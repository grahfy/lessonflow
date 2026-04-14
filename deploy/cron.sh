#!/bin/bash
# =============================================================================
# LessonFlow - Cron Job Script
# =============================================================================
# This script runs the scheduled jobs (digests, reminders, owner reports)
# It's called by the system cron and makes authenticated requests to the API
#
# Install: Add to crontab with `sudo crontab -e`
# Example crontab entries:
#   0 20 * * * /var/www/lessonflow/current/deploy/cron.sh daily-bookings-digest
#   30 20 * * * /var/www/lessonflow/current/deploy/cron.sh invoice-reminders
#   45 20 * * * /var/www/lessonflow/current/deploy/cron.sh admin-reports-daily
#   0 8 * * 1 /var/www/lessonflow/current/deploy/cron.sh admin-reports-weekly
#   15 8 1 * * /var/www/lessonflow/current/deploy/cron.sh admin-reports-monthly
#   30 8 1 1 * /var/www/lessonflow/current/deploy/cron.sh admin-reports-yearly
#   0 2 * * * /var/www/lessonflow/current/deploy/cron.sh generate-sitemap
# =============================================================================

set -euo pipefail

# Configuration
APP_NAME="lessonflow"
LEGACY_APP_NAME="melbourne-guitar-school"

if [[ -d "/var/www/${APP_NAME}" ]]; then
    DEPLOY_DIR="/var/www/${APP_NAME}"
elif [[ -d "/var/www/${LEGACY_APP_NAME}" ]]; then
    DEPLOY_DIR="/var/www/${LEGACY_APP_NAME}"
    APP_NAME="${LEGACY_APP_NAME}"
else
    DEPLOY_DIR="/var/www/${APP_NAME}"
fi

SHARED_DIR="${DEPLOY_DIR}/shared"
LOG_DIR="/var/log/${APP_NAME}"

# Read a single KEY=value assignment from a .env file without sourcing it.
# This avoids executing arbitrary shell content and handles quoted values
# safely enough for the runtime settings used by cron (URL + secret).
read_env_file_value() {
    local env_file="$1"
    local key="$2"
    local line=""
    local value=""

    [[ -f "${env_file}" ]] || return 1

    line="$(grep -m1 -E "^[[:space:]]*${key}=" "${env_file}" 2>/dev/null || true)"
    [[ -n "${line}" ]] || return 1

    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ ${#value} -ge 2 && "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
        value="${value:1:${#value}-2}"
    elif [[ ${#value} -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:${#value}-2}"
    fi

    printf '%s\n' "${value}"
}

# Load only the env keys cron needs from the shared deploy env file so values
# containing spaces/placeholders do not break shell parsing (for example
# "Owner Name <email@example.com>" in unrelated variables).
SHARED_ENV_FILE="${SHARED_DIR}/.env"
if [[ -f "${SHARED_ENV_FILE}" ]]; then
    NEXT_PUBLIC_SITE_URL="$(read_env_file_value "${SHARED_ENV_FILE}" "NEXT_PUBLIC_SITE_URL" || true)"
    CRON_SECRET="$(read_env_file_value "${SHARED_ENV_FILE}" "CRON_SECRET" || true)"
fi

# Default site URL falls back to localhost for single-host deployments. If the
# production env sets an HTTPS public URL, cron will hit the same reverse proxy
# path and exercise the same auth/headers behavior as external requests.
# RATIONALE: Localhost remains the safest fallback during first bootstrap
# because timers should keep working before DNS/TLS are fully configured.
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
    admin-reports-daily)
        ENDPOINT="/api/jobs/admin-reports/daily"
        ;;
    admin-reports-weekly)
        ENDPOINT="/api/jobs/admin-reports/weekly"
        ;;
    admin-reports-monthly)
        ENDPOINT="/api/jobs/admin-reports/monthly"
        ;;
    admin-reports-yearly)
        ENDPOINT="/api/jobs/admin-reports/yearly"
        ;;
    generate-sitemap)
        ENDPOINT="/api/jobs/generate-sitemap"
        ;;
    gmail-sync)
        ENDPOINT="/api/jobs/gmail-sync"
        ;;
    purge-logs)
        ENDPOINT="/api/jobs/purge-logs"
        ;;
    analytics-rollup)
        ENDPOINT="/api/jobs/analytics-rollup"
        ;;
    analytics-purge)
        ENDPOINT="/api/jobs/analytics-purge"
        ;;
    *)
        log "ERROR: Unknown job type: ${JOB_TYPE}"
        echo "Usage: $0 {daily-bookings-digest|invoice-reminders|admin-reports-daily|admin-reports-weekly|admin-reports-monthly|admin-reports-yearly|generate-sitemap|gmail-sync|purge-logs|analytics-rollup|analytics-purge}"
        exit 1
        ;;
esac

log "Starting job: ${JOB_TYPE}"

# Make an authenticated POST and capture both body and status code in one call.
# The trailing status line keeps parsing simple without requiring jq.
# NOTE: Cron logs need both pieces from the same request so failures can be
# diagnosed without a second network call that might observe a different state.
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    "${SITE_URL}${ENDPOINT}")

HTTP_CODE=$(echo "${RESPONSE}" | tail -n 1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [[ "${HTTP_CODE}" == "200" ]]; then
    # NOTE: We log the response body so timer/cron troubleshooting can happen
    # from journal/log files without replaying the job manually.
    log "Job completed successfully: ${JOB_TYPE}"
    log "Response: ${BODY}"
else
    log "ERROR: Job failed with HTTP ${HTTP_CODE}: ${JOB_TYPE}"
    log "Response: ${BODY}"
    exit 1
fi
