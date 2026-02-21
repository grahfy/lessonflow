#!/bin/bash
# =============================================================================
# Melbourne Guitar School - SSL Certificate Setup
# =============================================================================
# Sets up Let's Encrypt SSL certificate with automatic renewal
#
# Usage: sudo ./deploy/setup-ssl.sh [options]
#
# Options:
#   --domain DOMAIN    Primary domain (default: melbourneguitarschool.com.au)
#   --email EMAIL      Email for Let's Encrypt notifications
#   --staging          Use Let's Encrypt staging server (for testing)
#   --force            Force certificate renewal even if not expired
#
# Prerequisites:
#   - Nginx installed and configured
#   - Domain DNS pointing to this server
#   - Port 80 and 443 open in firewall
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default configuration
DOMAIN="melbourneguitarschool.com.au"
EMAIL=""
STAGING=false
FORCE=false
WWW_DOMAIN="www.${DOMAIN}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            WWW_DOMAIN="www.${DOMAIN}"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --staging)
            STAGING=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Validate email
if [[ -z "${EMAIL}" ]]; then
    log_error "Email address is required for Let's Encrypt notifications"
    echo "Usage: sudo ./deploy/setup-ssl.sh --email your@email.com"
    exit 1
fi

log_info "Setting up SSL certificate for: ${DOMAIN}"
log_info "Email: ${EMAIL}"

# Ensure HTTP-only nginx config is active (no SSL refs that would fail before certs exist)
NGINX_CONF="/etc/nginx/sites-available/melbourne-guitar-school"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTTP_CONF="${SCRIPT_DIR}/nginx-http.conf"

if [[ -f "${HTTP_CONF}" ]]; then
    # Check if current config has SSL references but no certs exist
    if grep -q "ssl_certificate" "${NGINX_CONF}" 2>/dev/null; then
        CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
        if [[ ! -f "${CERT_PATH}" ]]; then
            log_info "Replacing nginx config with HTTP-only version before obtaining certs..."
            cp "${HTTP_CONF}" "${NGINX_CONF}"
        fi
    fi
fi

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    log_info "Installing certbot..."
    apt update
    apt install -y certbot python3-certbot-nginx
fi

# Check if nginx is running
if ! systemctl is-active --quiet nginx; then
    log_warn "Nginx is not running. Starting nginx..."
    systemctl start nginx
fi

# Check if domain resolves to this server
log_info "Verifying DNS resolution..."
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || curl -s ipinfo.io/ip)
DOMAIN_IP=$(dig +short "${DOMAIN}" | tail -1)
WWW_IP=$(dig +short "${WWW_DOMAIN}" | tail -1)

if [[ "${DOMAIN_IP}" != "${SERVER_IP}" ]]; then
    log_error "Domain ${DOMAIN} resolves to ${DOMAIN_IP}, but this server is ${SERVER_IP}"
    log_error "Please update DNS records before proceeding"
    exit 1
fi

log_info "DNS verified: ${DOMAIN} -> ${SERVER_IP}"

# Build certbot command
CERTBOT_CMD="certbot --nginx --non-interactive --agree-tos --email ${EMAIL} -d ${DOMAIN} -d ${WWW_DOMAIN}"

if [[ "${STAGING}" == true ]]; then
    log_warn "Using Let's Encrypt STAGING server (certificate will not be trusted)"
    CERTBOT_CMD="${CERTBOT_CMD} --test-cert"
fi

if [[ "${FORCE}" == true ]]; then
    CERTBOT_CMD="${CERTBOT_CMD} --force-renewal"
fi

# Obtain certificate
log_info "Obtaining SSL certificate..."
if eval "${CERTBOT_CMD}"; then
    log_info "SSL certificate obtained successfully!"
else
    log_error "Failed to obtain SSL certificate"
    exit 1
fi

# Update nginx config if it doesn't have SSL
NGINX_CONF="/etc/nginx/sites-available/melbourne-guitar-school"
if [[ -f "${NGINX_CONF}" ]]; then
    if ! grep -q "ssl_certificate" "${NGINX_CONF}"; then
        log_info "Updating nginx configuration with SSL paths..."
        sed -i "s|# SSL Configuration.*|ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;|g" "${NGINX_CONF}"
        sed -i "s|ssl_certificate_key.*|ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;|g" "${NGINX_CONF}"
    fi
fi

# Test nginx configuration
log_info "Testing nginx configuration..."
if nginx -t; then
    log_info "Nginx configuration is valid"
else
    log_error "Nginx configuration test failed"
    exit 1
fi

# Reload nginx
log_info "Reloading nginx..."
systemctl reload nginx

# Set up automatic renewal
log_info "Setting up automatic certificate renewal..."

# Check if renewal timer exists
if systemctl list-timers | grep -q "certbot"; then
    log_info "Certbot renewal timer already configured"
else
    # Create systemd timer for certbot renewal
    cat > /etc/systemd/system/certbot-renewal.service << 'EOF'
[Unit]
Description=Certbot Renewal
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx"

[Install]
WantedBy=multi-user.target
EOF

    cat > /etc/systemd/system/certbot-renewal.timer << 'EOF'
[Unit]
Description=Run certbot renewal twice daily

[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable certbot-renewal.timer
    systemctl start certbot-renewal.timer
    log_info "Certbot renewal timer created and started"
fi

# Test renewal (dry run)
log_info "Testing certificate renewal (dry run)..."
if certbot renew --dry-run; then
    log_info "Certificate renewal test successful"
else
    log_warn "Certificate renewal test failed (this is expected for staging certificates)"
fi

# Summary
echo ""
echo "=========================================="
log_info "SSL Setup Complete!"
echo "=========================================="
echo ""
echo "Certificate Location:"
echo "  - Full chain: /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
echo "  - Private key: /etc/letsencrypt/live/${DOMAIN}/privkey.pem"
echo ""
echo "Automatic Renewal:"
echo "  - Runs twice daily at 00:00 and 12:00"
echo "  - Nginx will reload automatically after renewal"
echo ""
echo "Manual Renewal:"
echo "  sudo certbot renew"
echo ""
echo "Certificate Status:"
certbot certificates 2>/dev/null || true
