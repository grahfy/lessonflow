#!/bin/bash
# =============================================================================
# LessonFlow - SSL Certificate Setup
# =============================================================================
# Sets up Let's Encrypt SSL certificate with automatic renewal
#
# Usage: sudo ./deploy/setup-ssl.sh [options]
#
# Options:
#   --domain DOMAIN    Primary domain (auto-detected from live nginx/shared env when omitted)
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
DOMAIN=""
EMAIL=""
STAGING=false
FORCE=false
WWW_DOMAIN=""

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

read_nginx_server_name_domains() {
    local nginx_conf="$1"

    [[ -r "${nginx_conf}" ]] || return 1

    awk '
        /^[[:space:]]*server_name[[:space:]]+/ {
            for (i = 2; i <= NF; i++) {
                gsub(/;$/, "", $i)
                if ($i != "_" && $i != "") {
                    print $i
                }
            }
        }
    ' "${nginx_conf}" 2>/dev/null
}

read_domain_from_site_url() {
    local site_url="$1"

    [[ -n "${site_url}" ]] || return 1
    printf '%s\n' "${site_url}" | sed -E 's#^[A-Za-z]+://##; s#/.*$##; s#:[0-9]+$##'
}

detect_domain_from_nginx_config() {
    local candidate=""
    local domain=""
    local other=""
    local -a domains=()
    local nginx_candidates=(
        "/etc/nginx/sites-available/lessonflow"
        "/etc/nginx/sites-enabled/lessonflow"
    )

    for candidate in "${nginx_candidates[@]}"; do
        [[ -r "${candidate}" ]] || continue
        mapfile -t domains < <(read_nginx_server_name_domains "${candidate}" || true)

        for domain in "${domains[@]}"; do
            if [[ "${domain}" == www.* ]]; then
                for other in "${domains[@]}"; do
                    if [[ "${other}" == "${domain#www.}" ]]; then
                        printf '%s\n' "${other}"
                        return 0
                    fi
                done
            fi
        done

        for domain in "${domains[@]}"; do
            if [[ "${domain}" != www.* ]]; then
                printf '%s\n' "${domain}"
                return 0
            fi
        done

        if [[ ${#domains[@]} -gt 0 ]]; then
            printf '%s\n' "${domains[0]#www.}"
            return 0
        fi
    done

    return 1
}

read_site_host_from_shared_env() {
    local shared_env="/var/www/lessonflow/shared/.env"
    local site_url=""
    local site_host=""

    [[ -r "${shared_env}" ]] || return 1

    site_url="$(awk -F'=' '
        /^[[:space:]]*NEXT_PUBLIC_SITE_URL[[:space:]]*=/ {
            v=substr($0, index($0, "=") + 1)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
            gsub(/^"/, "", v)
            gsub(/"$/, "", v)
            print v
            exit
        }
    ' "${shared_env}" 2>/dev/null || true)"

    site_host="$(read_domain_from_site_url "${site_url}" || true)"
    [[ -n "${site_host}" ]] || return 1
    printf '%s\n' "${site_host}"
}

escape_sed_replacement() {
    printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

render_nginx_site_template() {
    local template_path="$1"
    local output_path="$2"
    local canonical_domain="$3"
    local www_domain="$4"
    local escaped_canonical=""
    local escaped_www=""

    [[ -n "${canonical_domain}" ]] || return 1
    [[ -n "${www_domain}" ]] || www_domain="www.${canonical_domain}"

    escaped_canonical="$(escape_sed_replacement "${canonical_domain}")"
    escaped_www="$(escape_sed_replacement "${www_domain}")"

    sed \
        -e "s/www\\.melbourneguitarschool\\.com\\.au/${escaped_www}/g" \
        -e "s/melbourneguitarschool\\.com\\.au/${escaped_canonical}/g" \
        "${template_path}" > "${output_path}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

if [[ -z "${DOMAIN}" ]]; then
    DOMAIN="$(detect_domain_from_nginx_config || true)"
fi

if [[ -z "${DOMAIN}" ]]; then
    DOMAIN="$(read_site_host_from_shared_env || true)"
fi

if [[ -z "${DOMAIN}" ]]; then
    log_error "Could not detect a site domain from nginx or /var/www/lessonflow/shared/.env."
    echo "Usage: sudo ./deploy/setup-ssl.sh --domain example.com --email your@email.com"
    exit 1
fi

if [[ "${DOMAIN}" == www.* ]]; then
    WWW_DOMAIN="${DOMAIN}"
    DOMAIN="${DOMAIN#www.}"
fi

if [[ -z "${WWW_DOMAIN}" ]]; then
    WWW_DOMAIN="www.${DOMAIN}"
fi

# Validate email
if [[ -z "${EMAIL}" ]]; then
    log_error "Email address is required for Let's Encrypt notifications"
    echo "Usage: sudo ./deploy/setup-ssl.sh --email your@email.com"
    exit 1
fi

log_info "Setting up SSL certificate for: ${DOMAIN}"
log_info "Email: ${EMAIL}"

# Ensure HTTP-only nginx config is active (no SSL refs that would fail before
# certs exist). This lets certbot's nginx plugin validate and bootstrap the
# first certificate even if the current site file was copied from the HTTPS template.
NGINX_CONF="/etc/nginx/sites-available/lessonflow"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTTP_CONF="${SCRIPT_DIR}/nginx-http.conf"

if [[ -f "${HTTP_CONF}" ]]; then
    # Check if current config has SSL references but no certs exist
    if grep -q "ssl_certificate" "${NGINX_CONF}" 2>/dev/null; then
        CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
        if [[ ! -f "${CERT_PATH}" ]]; then
            log_info "Replacing nginx config with HTTP-only version before obtaining certs..."
            rendered_http_conf="$(mktemp)"
            render_nginx_site_template "${HTTP_CONF}" "${rendered_http_conf}" "${DOMAIN}" "${WWW_DOMAIN}"
            cp "${rendered_http_conf}" "${NGINX_CONF}"
            rm -f "${rendered_http_conf}"
        fi
    fi
fi

# Check if certbot is installed. This helper currently installs Debian/Ubuntu
# packages directly because the production target is a DigitalOcean droplet.
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

# Check if domain resolves to this server before asking certbot to issue certs.
# This catches the common DNS propagation / wrong-A-record failure early.
log_info "Verifying DNS resolution..."
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || curl -s ipinfo.io/ip)
DOMAIN_IP=$(dig +short "${DOMAIN}" | tail -1)
WWW_IP=$(dig +short "${WWW_DOMAIN}" | tail -1)

if [[ "${DOMAIN_IP}" != "${SERVER_IP}" ]]; then
    log_error "Domain ${DOMAIN} resolves to ${DOMAIN_IP}, but this server is ${SERVER_IP}"
    log_error "Please update DNS records before proceeding"
    exit 1
fi

if [[ -z "${WWW_IP}" || "${WWW_IP}" != "${SERVER_IP}" ]]; then
    log_error "Domain ${WWW_DOMAIN} resolves to ${WWW_IP:-<no DNS record>}, but this server is ${SERVER_IP}"
    log_error "Please update DNS records for both the bare domain and www host before proceeding"
    exit 1
fi

log_info "DNS verified: ${DOMAIN}, ${WWW_DOMAIN} -> ${SERVER_IP}"

# Build certbot command dynamically so staging/force flags only apply when set.
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

# Update nginx config if it doesn't have SSL. In the normal flow certbot's nginx
# plugin edits the site config directly, but this fallback keeps the template
# usable if a minimal HTTP config was active during certificate issuance.
NGINX_CONF="/etc/nginx/sites-available/lessonflow"
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

# Set up automatic renewal. If a distro-provided certbot timer already exists we
# reuse it; otherwise we create a small local timer/service pair with nginx reload.
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
