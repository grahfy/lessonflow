#!/bin/bash
# =============================================================================
# Melbourne Guitar School - Deployment Script
# =============================================================================
# Usage: ./deploy/deploy.sh [options]
#
# Options:
#   --skip-migrate    Skip database migrations
#   --skip-deps       Skip npm install
#   --branch BRANCH   Git branch to deploy (default: main)
#   --rollback        Rollback to previous release
#   --setup-packages  Run package installation first (requires root)
#   --ssl             Run SSL setup after deployment
#   --domain DOMAIN   Domain for SSL certificate
#   --email EMAIL     Email for SSL certificate
#
# Prerequisites (unless --setup-packages):
#   - Node.js 20+ installed
#   - MySQL database configured
#   - Environment file at /var/www/melbourne-guitar-school/shared/.env
#   - Nginx and systemd configured
# =============================================================================

set -euo pipefail

# Configuration
APP_NAME="melbourne-guitar-school"
DEPLOY_DIR="/var/www/${APP_NAME}"
RELEASES_DIR="${DEPLOY_DIR}/releases"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
KEEP_RELEASES=5
BRANCH="main"
SKIP_MIGRATE=false
SKIP_DEPS=false
ROLLBACK=false
SETUP_PACKAGES=false
SSL_SETUP=false
SSL_DOMAIN=""
SSL_EMAIL=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-migrate)
            SKIP_MIGRATE=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --branch)
            BRANCH="$2"
            shift 2
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --setup-packages)
            SETUP_PACKAGES=true
            shift
            ;;
        --ssl)
            SSL_SETUP=true
            shift
            ;;
        --domain)
            SSL_DOMAIN="$2"
            shift 2
            ;;
        --email)
            SSL_EMAIL="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Deployment failed with exit code: $exit_code"
        # Restore previous release if we were in the middle of deploying
        if [[ -n "${NEW_RELEASE_DIR:-}" && -d "${NEW_RELEASE_DIR}" ]]; then
            log_warn "Cleaning up failed release..."
            rm -rf "${NEW_RELEASE_DIR}"
        fi
    fi
    exit $exit_code
}
trap cleanup EXIT

# =============================================================================
# ROLLBACK FUNCTION
# =============================================================================
rollback() {
    log_info "Initiating rollback..."
    
    if [[ ! -d "${RELEASES_DIR}" ]]; then
        log_error "No releases directory found"
        exit 1
    fi
    
    # List releases sorted by date
    local releases=($(ls -1t "${RELEASES_DIR}"))
    
    if [[ ${#releases[@]} -lt 2 ]]; then
        log_error "No previous release available for rollback"
        exit 1
    fi
    
    local current_release=$(readlink "${CURRENT_LINK}" | xargs basename)
    local previous_release=""
    
    # Find the release before current
    for release in "${releases[@]}"; do
        if [[ "${release}" != "${current_release}" ]]; then
            previous_release="${release}"
            break
        fi
    done
    
    if [[ -z "${previous_release}" ]]; then
        log_error "Could not find previous release"
        exit 1
    fi
    
    log_info "Rolling back to release: ${previous_release}"
    
    # Update symlink
    ln -sfn "${RELEASES_DIR}/${previous_release}" "${CURRENT_LINK}"
    
    # Restart service
    systemctl restart ${APP_NAME}
    
    log_info "Rollback complete! Now running release: ${previous_release}"
    exit 0
}

# Execute rollback if requested
if [[ "${ROLLBACK}" == true ]]; then
    rollback
fi

# Run package setup if requested
if [[ "${SETUP_PACKAGES}" == true ]]; then
    log_info "Running package setup..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "${SCRIPT_DIR}/setup-packages.sh" --non-interactive
fi

# =============================================================================
# DEPLOYMENT
# =============================================================================
log_info "Starting deployment of branch: ${BRANCH}"
log_info "Deploy directory: ${DEPLOY_DIR}"

# Create directories if they don't exist
mkdir -p "${RELEASES_DIR}"
mkdir -p "${SHARED_DIR}"

# Create release directory with timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)
NEW_RELEASE_DIR="${RELEASES_DIR}/${TIMESTAMP}"
mkdir -p "${NEW_RELEASE_DIR}"
log_info "Created release directory: ${NEW_RELEASE_DIR}"

# Clone/copy repository
if [[ -d ".git" ]]; then
    # Running from git repository
    git archive --format=tar "${BRANCH}" | tar -x -C "${NEW_RELEASE_DIR}"
else
    # Copy current directory
    rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
          --exclude='*.log' --exclude='prisma/*.db' \
          ./ "${NEW_RELEASE_DIR}/"
fi

cd "${NEW_RELEASE_DIR}"

# Link shared environment file
if [[ -f "${SHARED_DIR}/.env" ]]; then
    ln -sf "${SHARED_DIR}/.env" "${NEW_RELEASE_DIR}/.env"
    log_info "Linked shared environment file"
else
    log_warn "No shared .env file found at ${SHARED_DIR}/.env"
fi

# Link shared data directory (learning materials, etc.)
if [[ -d "${SHARED_DIR}/data" ]]; then
    ln -sf "${SHARED_DIR}/data" "${NEW_RELEASE_DIR}/.data"
    log_info "Linked shared data directory"
fi

# Install dependencies
if [[ "${SKIP_DEPS}" == false ]]; then
    log_info "Installing dependencies..."
    npm ci --omit=dev --ignore-scripts
fi

# Always install Prisma CLI (needed for generate and migrate)
log_info "Installing Prisma CLI..."
npm install prisma --save-dev --ignore-scripts

# Generate Prisma client
log_info "Generating Prisma client..."
npm exec --no -- prisma generate

# Run database migrations
if [[ "${SKIP_MIGRATE}" == false ]]; then
    log_info "Running database migrations..."
    npm exec --no -- prisma migrate deploy
else
    log_info "Skipping database migrations"
fi

# Build the application
log_info "Building application..."
npm run build

# Verify build succeeded
if [[ ! -f ".next/BUILD_ID" ]]; then
    log_error "Build failed - BUILD_ID not found"
    exit 1
fi

log_info "Build successful: $(cat .next/BUILD_ID)"

# Update symlink atomically
log_info "Updating current symlink..."
ln -sfn "${NEW_RELEASE_DIR}" "${CURRENT_LINK}"

# Ensure systemd service is installed
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
if [[ ! -f "${SERVICE_FILE}" ]]; then
    log_info "Installing systemd service..."
    cp "${NEW_RELEASE_DIR}/deploy/${APP_NAME}.service" "${SERVICE_FILE}"
    systemctl daemon-reload
    systemctl enable ${APP_NAME}
fi

# Ensure nginx config is installed
NGINX_SITE_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"
if [[ ! -f "${NGINX_SITE_AVAILABLE}" ]]; then
    log_info "Installing nginx configuration..."
    cp "${NEW_RELEASE_DIR}/deploy/nginx.conf" "${NGINX_SITE_AVAILABLE}"
    ln -sf "${NGINX_SITE_AVAILABLE}" "${NGINX_SITE_ENABLED}"
    # Remove default site if it exists
    rm -f /etc/nginx/sites-enabled/default
    # Test and reload nginx
    if nginx -t; then
        systemctl reload nginx
        log_info "Nginx configuration installed and reloaded"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
fi

# Restart the service
log_info "Restarting service..."
systemctl restart ${APP_NAME}

# Wait for service to start
log_info "Waiting for service to start..."
sleep 5

# Check service status
if systemctl is-active --quiet ${APP_NAME}; then
    log_info "Service started successfully"
else
    log_error "Service failed to start"
    systemctl status ${APP_NAME} --no-pager
    exit 1
fi

# Cleanup old releases
log_info "Cleaning up old releases..."
cd "${RELEASES_DIR}"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

log_info "Deployment complete!"
log_info "Current release: ${TIMESTAMP}"

# Show release history
echo ""
echo "Release history:"
ls -1t "${RELEASES_DIR}" | head -n ${KEEP_RELEASES}

# Run SSL setup if requested
if [[ "${SSL_SETUP}" == true ]]; then
    if [[ -z "${SSL_DOMAIN}" || -z "${SSL_EMAIL}" ]]; then
        log_error "SSL setup requires --domain and --email options"
        exit 1
    fi
    log_info "Running SSL setup..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "${SCRIPT_DIR}/setup-ssl.sh" --domain "${SSL_DOMAIN}" --email "${SSL_EMAIL}"
fi
