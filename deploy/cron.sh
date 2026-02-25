#!/bin/bash
# =============================================================================
# Melbourne Guitar School - Cron Job Script
# =============================================================================
# This script runs the scheduled jobs (daily bookings digest, invoice reminders)
# It's called by the system cron and makes authenticated requests to the API
#
# Install: Add to crontab with `sudo crontab -e`
# Example crontab entries:
#   0 20 * * * /var/www/melbourne-guitar-school/current/deploy/cron.sh daily-bookings-digest
#   30 20 * * * /var/www/melbourne-guitar-school/current/deploy/cron.sh invoice-reminders
# =============================================================================

set -euo pipefail

# Configuration
APP_NAME="melbourne-guitar-school"
DEPLOY_DIR="/var/www/${APP_NAME}"
SHARED_DIR="${DEPLOY_DIR}/shared"
LOG_DIR="/var/log/${APP_NAME}"

# Load environment from the shared deploy path so cron jobs use the same
# `NEXT_PUBLIC_SITE_URL` and `CRON_SECRET` as the running app/service.
# This lightweight export parser assumes simple KEY=VALUE entries.
if [[ -f "${SHARED_DIR}/.env" ]]; then
    export $(grep -v '^#' "${SHARED_DIR}/.env" | xargs)
fi

# Default site URL falls back to localhost for single-host deployments. If the
# production env sets an HTTPS public URL, cron will hit the same reverse proxy
# path and exercise the same auth/headers behavior as external requests.
SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://127.0.0.1:3000}"
CRON_SECRET="${CRON_SECRET:-}"

# Logging
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/cron-$(date +%Y%m%d).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "${LOG_FILE}"
}

# Validate cron secret
if [[ -z "${CRON_SECRET}" ]]; then
    log "ERROR: CRON_SECRET not set in environment"
    exit 1
fi

# Determine job to run
JOB_TYPE="${1:-}"

case "${JOB_TYPE}" in
    daily-bookings-digest)
        ENDPOINT="/api/jobs/daily-bookings-digest"
        ;;
    invoice-reminders)
        ENDPOINT="/api/jobs/invoice-reminders"
        ;;
    *)
        log "ERROR: Unknown job type: ${JOB_TYPE}"
        echo "Usage: $0 {daily-bookings-digest|invoice-reminders}"
        exit 1
        ;;
esac

log "Starting job: ${JOB_TYPE}"

# Make an authenticated POST and capture both body and status code in one call.
# The trailing status line keeps parsing simple without requiring jq.
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    "${SITE_URL}${ENDPOINT}")

HTTP_CODE=$(echo "${RESPONSE}" | tail -n 1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [[ "${HTTP_CODE}" == "200" ]]; then
    log "Job completed successfully: ${JOB_TYPE}"
    log "Response: ${BODY}"
else
    log "ERROR: Job failed with HTTP ${HTTP_CODE}: ${JOB_TYPE}"
    log "Response: ${BODY}"
    exit 1
fi
