#!/bin/bash
# =============================================================================
# LessonFlow - Backup Health Check
# =============================================================================
# Verifies that the most recent database backup archive produced by
# `deploy/backup.sh` exists, is recent enough, and is non-empty. Intended to be
# run from cron (e.g. once daily after the scheduled backup) or manually before
# a risky deploy, so a silently-broken backup pipeline is caught early.
#
# Usage: ./deploy/verify-backup.sh [options]
#
# Options:
#   --max-age-hours N   Fail if the newest backup is older than N hours
#                       (default: 26 — a daily backup plus slack).
#   --min-size-bytes N  Fail if the newest backup is smaller than N bytes
#                       (default: 1024 — a non-trivial archive).
#   --backup-dir DIR    Override the backup directory (default: auto-detected,
#                       matching backup.sh: <deploy-dir>/backups).
#   --quiet             Only print on failure.
#   --help, -h          Show usage.
#
# Exit codes:
#   0  newest backup exists, is recent, and is non-empty
#   1  no backups found, too old, too small, or directory missing
#   2  usage error
# =============================================================================

set -euo pipefail

# Resolve paths the same way backup.sh does so both agree on the backup location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

# Defaults
BACKUP_DIR="${DEPLOY_DIR}/backups"
MAX_AGE_HOURS=26
MIN_SIZE_BYTES=1024
QUIET=false

log() {
  [[ "${QUIET}" == "true" ]] && return 0
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

show_usage() {
  cat <<'EOF'
LessonFlow - Backup Health Check

Usage: ./deploy/verify-backup.sh [options]

Options:
  --max-age-hours N   Fail if the newest backup is older than N hours (default: 26).
  --min-size-bytes N  Fail if the newest backup is smaller than N bytes (default: 1024).
  --backup-dir DIR    Override the backup directory (default: <deploy-dir>/backups).
  --quiet             Only print on failure.
  --help, -h          Show usage.

Exit codes: 0 healthy, 1 unhealthy (missing/old/small), 2 usage error.
EOF
}

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-age-hours)
      MAX_AGE_HOURS="$2"; shift 2 ;;
    --min-size-bytes)
      MIN_SIZE_BYTES="$2"; shift 2 ;;
    --backup-dir)
      BACKUP_DIR="$2"; shift 2 ;;
    --quiet)
      QUIET=true; shift ;;
    --help|-h)
      show_usage; exit 0 ;;
    *)
      log_error "Unknown argument: $1"; show_usage; exit 2 ;;
  esac
done

# Validate numeric options so a bad cron config fails loudly rather than silently
# treating every backup as healthy.
if ! [[ "${MAX_AGE_HOURS}" =~ ^[0-9]+$ ]]; then
  log_error "--max-age-hours must be a non-negative integer (got '${MAX_AGE_HOURS}')."
  exit 2
fi
if ! [[ "${MIN_SIZE_BYTES}" =~ ^[0-9]+$ ]]; then
  log_error "--min-size-bytes must be a non-negative integer (got '${MIN_SIZE_BYTES}')."
  exit 2
fi

if [[ ! -d "${BACKUP_DIR}" ]]; then
  log_error "Backup directory does not exist: ${BACKUP_DIR}"
  exit 1
fi

# Find the most recently modified backup archive (matches backup.sh naming).
newest_backup=""
newest_mtime=0
while IFS= read -r -d '' file; do
  mtime="$(stat -c%Y "${file}" 2>/dev/null || stat -f%m "${file}" 2>/dev/null || echo 0)"
  if (( mtime > newest_mtime )); then
    newest_mtime="${mtime}"
    newest_backup="${file}"
  fi
done < <(find "${BACKUP_DIR}" -maxdepth 1 -name 'backup-*.tar.gz' -type f -print0 2>/dev/null)

if [[ -z "${newest_backup}" ]]; then
  log_error "No backup archives (backup-*.tar.gz) found in ${BACKUP_DIR}"
  exit 1
fi

# Age check.
now_epoch="$(date +%s)"
age_seconds=$(( now_epoch - newest_mtime ))
max_age_seconds=$(( MAX_AGE_HOURS * 3600 ))
age_hours=$(( age_seconds / 3600 ))

if (( age_seconds > max_age_seconds )); then
  log_error "Newest backup is too old: ${newest_backup} (${age_hours}h old, limit ${MAX_AGE_HOURS}h)"
  exit 1
fi

# Size check.
size_bytes="$(stat -c%s "${newest_backup}" 2>/dev/null || stat -f%z "${newest_backup}" 2>/dev/null || echo 0)"
if (( size_bytes < MIN_SIZE_BYTES )); then
  log_error "Newest backup is too small: ${newest_backup} (${size_bytes} bytes, minimum ${MIN_SIZE_BYTES})"
  exit 1
fi

log "OK: ${newest_backup} (${age_hours}h old, ${size_bytes} bytes)"
exit 0
