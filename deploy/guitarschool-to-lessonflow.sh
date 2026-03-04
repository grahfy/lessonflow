#!/bin/bash
# =============================================================================
# Legacy Migration - melbourne-guitar-school -> lessonflow
# =============================================================================
# One-time production migration helper for low-power VPS deployments.
#
# Usage:
#   ./deploy/guitarschool-to-lessonflow.sh [options]
#
# Options:
#   --dry-run           Print planned actions only (default)
#   --execute           Apply migration changes
#   --skip-deploy       Skip post-migration update.sh handoff
#   --branch BRANCH     Branch for post-migration handoff (default: main)
#   --no-color          Disable ANSI colors
#   --help, -h          Show usage
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

LEGACY_APP_NAME="melbourne-guitar-school"
TARGET_APP_NAME="lessonflow"
LEGACY_DEPLOY_DIR="/var/www/${LEGACY_APP_NAME}"
TARGET_DEPLOY_DIR="/var/www/${TARGET_APP_NAME}"
LEGACY_SERVICE_FILE="/etc/systemd/system/${LEGACY_APP_NAME}.service"
TARGET_SERVICE_FILE="/etc/systemd/system/${TARGET_APP_NAME}.service"
LEGACY_NGINX_SITE="/etc/nginx/sites-available/${LEGACY_APP_NAME}"
TARGET_NGINX_SITE="/etc/nginx/sites-available/${TARGET_APP_NAME}"
LEGACY_NGINX_ENABLED="/etc/nginx/sites-enabled/${LEGACY_APP_NAME}"
TARGET_NGINX_ENABLED="/etc/nginx/sites-enabled/${TARGET_APP_NAME}"
LEGACY_CRON_RUNNER="/var/www/${LEGACY_APP_NAME}/current/deploy/cron.sh"
TARGET_CRON_RUNNER="/var/www/${TARGET_APP_NAME}/current/deploy/cron.sh"
LEGACY_SHARED_ENV="${LEGACY_DEPLOY_DIR}/shared/.env"
TARGET_SHARED_ENV="${TARGET_DEPLOY_DIR}/shared/.env"
LEGACY_MAINTENANCE_CONF="/home/grahf/melbourne-guitar-school/.maintenance.conf"

MODE="dry-run"
SKIP_DEPLOY=false
BRANCH="main"
NO_COLOR=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

BACKUP_ROOT=""

show_usage() {
  cat <<'USAGE'
Legacy Migration - melbourne-guitar-school -> lessonflow

Usage: ./deploy/guitarschool-to-lessonflow.sh [options]

Options:
  --dry-run           Print planned actions only (default)
  --execute           Apply migration changes
  --skip-deploy       Skip post-migration update.sh handoff
  --branch BRANCH     Branch for post-migration handoff (default: main)
  --no-color          Disable ANSI colors
  --help, -h          Show usage
USAGE
}

log_info() {
  echo -e "${GREEN}●${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}▲${NC} $1"
}

log_error() {
  echo -e "${RED}✖${NC} $1" >&2
}

section() {
  echo ""
  echo -e "${BOLD}${BLUE}== $1 ==${NC}"
}

run_cmd() {
  if [[ "${MODE}" == "dry-run" ]]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    echo ""
    return 0
  fi
  "$@"
}

run_shell() {
  local cmd="$1"
  if [[ "${MODE}" == "dry-run" ]]; then
    echo "[dry-run] ${cmd}"
    return 0
  fi
  bash -lc "${cmd}"
}

backup_file_if_exists() {
  local src="$1"
  local dst_name="$2"

  if [[ ! -e "${src}" ]]; then
    return 0
  fi

  run_cmd cp -a "${src}" "${BACKUP_ROOT}/${dst_name}"
}

ensure_execute_permissions() {
  if [[ "${MODE}" != "execute" ]]; then
    return 0
  fi

  if [[ ${EUID} -ne 0 ]]; then
    log_error "--execute requires root. Re-run with sudo."
    exit 1
  fi
}

preflight_checks() {
  section "Preflight"

  if [[ -d "${LEGACY_DEPLOY_DIR}" ]]; then
    log_info "Legacy deploy dir detected: ${LEGACY_DEPLOY_DIR}"
  elif [[ -d "${TARGET_DEPLOY_DIR}" ]]; then
    log_info "Target deploy dir already present: ${TARGET_DEPLOY_DIR}"
  else
    log_warn "Neither legacy nor target deploy directory exists."
  fi

  if [[ -d "${LEGACY_DEPLOY_DIR}" && -d "${TARGET_DEPLOY_DIR}" ]]; then
    log_error "Both legacy and target deploy directories exist. Resolve manually first."
    exit 1
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    log_warn "systemctl not found. Service migration steps may be skipped."
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    log_warn "nginx not found. Nginx validation may be skipped."
  fi

  if ! command -v crontab >/dev/null 2>&1; then
    log_warn "crontab not found. Cron migration may be skipped."
  fi
}

prepare_backup_root() {
  local timestamp
  timestamp="$(date +%Y%m%d%H%M%S)"
  BACKUP_ROOT="/var/backups/lessonflow-migration/${timestamp}"

  section "Backup"
  run_cmd mkdir -p "${BACKUP_ROOT}"
  run_cmd mkdir -p "${BACKUP_ROOT}/systemd" "${BACKUP_ROOT}/nginx" "${BACKUP_ROOT}/crontab" "${BACKUP_ROOT}/env" "${BACKUP_ROOT}/repo"

  backup_file_if_exists "${LEGACY_SERVICE_FILE}" "systemd/${LEGACY_APP_NAME}.service"
  backup_file_if_exists "${TARGET_SERVICE_FILE}" "systemd/${TARGET_APP_NAME}.service"
  backup_file_if_exists "${LEGACY_NGINX_SITE}" "nginx/${LEGACY_APP_NAME}"
  backup_file_if_exists "${TARGET_NGINX_SITE}" "nginx/${TARGET_APP_NAME}"
  backup_file_if_exists "${LEGACY_SHARED_ENV}" "env/shared.env.legacy"
  backup_file_if_exists "${TARGET_SHARED_ENV}" "env/shared.env.target"
  backup_file_if_exists "${LEGACY_MAINTENANCE_CONF}" "repo/.maintenance.conf"

  if command -v crontab >/dev/null 2>&1; then
    if [[ "${MODE}" == "dry-run" ]]; then
      echo "[dry-run] crontab -l > ${BACKUP_ROOT}/crontab/root.before"
    else
      crontab -l > "${BACKUP_ROOT}/crontab/root.before" 2>/dev/null || true
    fi
  fi

  log_info "Backup root: ${BACKUP_ROOT}"
}

migrate_directory() {
  section "Deploy Path"

  if [[ -d "${LEGACY_DEPLOY_DIR}" ]]; then
    run_cmd mv "${LEGACY_DEPLOY_DIR}" "${TARGET_DEPLOY_DIR}"
  else
    log_info "Legacy deploy path not present; skipping move."
  fi
}

migrate_systemd() {
  section "Systemd"

  if ! command -v systemctl >/dev/null 2>&1; then
    log_warn "Skipping systemd migration (systemctl unavailable)."
    return 0
  fi

  if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${LEGACY_APP_NAME}\\.service"; then
    run_cmd systemctl stop "${LEGACY_APP_NAME}" || true
    run_cmd systemctl disable "${LEGACY_APP_NAME}" || true
  fi

  if [[ -f "${SCRIPT_DIR}/${TARGET_APP_NAME}.service" ]]; then
    run_cmd cp "${SCRIPT_DIR}/${TARGET_APP_NAME}.service" "${TARGET_SERVICE_FILE}"
  elif [[ -f "${LEGACY_SERVICE_FILE}" ]]; then
    run_shell "sed -e 's/melbourne-guitar-school/lessonflow/g' '${LEGACY_SERVICE_FILE}' > '${TARGET_SERVICE_FILE}'"
  fi

  if [[ -f "${LEGACY_SERVICE_FILE}" ]]; then
    run_cmd rm -f "${LEGACY_SERVICE_FILE}"
  fi

  run_cmd systemctl daemon-reload
  run_cmd systemctl enable "${TARGET_APP_NAME}" || true
}

migrate_nginx() {
  section "Nginx"

  if [[ -f "${LEGACY_NGINX_SITE}" ]]; then
    run_shell "sed -e 's/melbourne_guitar_school/lessonflow/g' -e 's#/var/www/melbourne-guitar-school#/var/www/lessonflow#g' -e 's/melbourne-guitar-school/lessonflow/g' '${LEGACY_NGINX_SITE}' > '${TARGET_NGINX_SITE}'"
  fi

  if [[ -f "${TARGET_NGINX_SITE}" ]]; then
    run_cmd ln -sfn "${TARGET_NGINX_SITE}" "${TARGET_NGINX_ENABLED}"
  fi

  run_cmd rm -f "${LEGACY_NGINX_ENABLED}"
  run_cmd rm -f "${LEGACY_NGINX_SITE}"

  if command -v nginx >/dev/null 2>&1; then
    if [[ "${MODE}" == "dry-run" ]]; then
      echo "[dry-run] nginx -t"
    else
      nginx -t
      systemctl reload nginx || true
    fi
  fi
}

migrate_crontab() {
  section "Cron"

  if ! command -v crontab >/dev/null 2>&1; then
    log_warn "Skipping cron migration (crontab unavailable)."
    return 0
  fi

  local existing
  local stripped
  local tmp_file

  existing="$(crontab -l 2>/dev/null || true)"
  stripped="$(printf '%s\n' "${existing}" | awk -v legacy_runner="${LEGACY_CRON_RUNNER}" -v target_runner="${TARGET_CRON_RUNNER}" '
    $0 == "# BEGIN LESSONFLOW_MANAGED_CRON" { skip=1; next }
    $0 == "# END LESSONFLOW_MANAGED_CRON" { skip=0; next }
    $0 == "# BEGIN MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON" { skip=1; next }
    $0 == "# END MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON" { skip=0; next }
    !skip && index($0, legacy_runner) == 0 && index($0, target_runner) == 0 { print }
  ')"

  tmp_file="$(mktemp)"
  {
    if [[ -n "${stripped//[[:space:]]/}" ]]; then
      printf '%s\n' "${stripped}"
      echo ""
    fi
    echo "# BEGIN LESSONFLOW_MANAGED_CRON"
    echo "# LessonFlow managed cron jobs"
    echo "0 20 * * * ${TARGET_CRON_RUNNER} daily-bookings-digest"
    echo "30 20 * * * ${TARGET_CRON_RUNNER} invoice-reminders"
    echo "45 20 * * * ${TARGET_CRON_RUNNER} admin-reports-daily"
    echo "0 8 * * 1 ${TARGET_CRON_RUNNER} admin-reports-weekly"
    echo "15 8 1 * * ${TARGET_CRON_RUNNER} admin-reports-monthly"
    echo "30 8 1 1 * ${TARGET_CRON_RUNNER} admin-reports-yearly"
    echo "# END LESSONFLOW_MANAGED_CRON"
    echo ""
  } > "${tmp_file}"

  if [[ "${MODE}" == "dry-run" ]]; then
    echo "[dry-run] crontab ${tmp_file}"
    rm -f "${tmp_file}"
  else
    crontab "${tmp_file}"
    rm -f "${tmp_file}"
  fi
}

update_shared_env() {
  section "Shared Env"

  local env_path=""
  if [[ -f "${TARGET_SHARED_ENV}" ]]; then
    env_path="${TARGET_SHARED_ENV}"
  elif [[ -f "${LEGACY_SHARED_ENV}" ]]; then
    env_path="${LEGACY_SHARED_ENV}"
  fi

  if [[ -z "${env_path}" ]]; then
    log_warn "Shared .env not found; skipping env updates."
    return 0
  fi

  run_shell "if grep -q '^BACKUP_CLOUD_FOLDER=\"melbourne-guitar-school-backups\"' '${env_path}'; then sed -i 's#^BACKUP_CLOUD_FOLDER=\"melbourne-guitar-school-backups\"#BACKUP_CLOUD_FOLDER=\"lessonflow-backups\"#' '${env_path}'; fi"
}

cleanup_repo_maintenance_conf() {
  section "Repo Cleanup"

  if [[ ! -f "${LEGACY_MAINTENANCE_CONF}" ]]; then
    log_info "No .maintenance.conf file found; skipping."
    return 0
  fi

  backup_file_if_exists "${LEGACY_MAINTENANCE_CONF}" "repo/.maintenance.conf"
  run_cmd rm -f "${LEGACY_MAINTENANCE_CONF}"
}

post_migration_handoff() {
  section "Post-Migration Handoff"

  local cmd="cd '${REPO_ROOT}' && ./deploy/update.sh --skip-pull --branch '${BRANCH}' --install-app-service --install-cron-jobs --allow-dirty --no-spinner"
  if [[ "${SKIP_DEPLOY}" == true ]]; then
    log_info "Skipping deploy handoff (--skip-deploy set)."
    return 0
  fi

  run_shell "${cmd}"
}

verify_state() {
  section "Verification"

  run_shell "ls -ld '${TARGET_DEPLOY_DIR}' '${TARGET_DEPLOY_DIR}/current' 2>/dev/null || true"
  if command -v systemctl >/dev/null 2>&1; then
    run_shell "systemctl is-enabled '${TARGET_APP_NAME}' 2>/dev/null || true"
    run_shell "systemctl is-active '${TARGET_APP_NAME}' 2>/dev/null || true"
  fi
  if command -v nginx >/dev/null 2>&1; then
    run_shell "nginx -t"
  fi
  if command -v crontab >/dev/null 2>&1; then
    run_shell "crontab -l | grep '${TARGET_CRON_RUNNER}' || true"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE="dry-run"; shift ;;
    --execute) MODE="execute"; shift ;;
    --skip-deploy) SKIP_DEPLOY=true; shift ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --no-color) NO_COLOR=true; shift ;;
    --help|-h)
      show_usage
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      show_usage
      exit 1
      ;;
  esac
done

if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

section "Mode"
log_info "Mode: ${MODE}"
log_info "Repo root: ${REPO_ROOT}"
log_info "Branch for post-migration deploy: ${BRANCH}"

ensure_execute_permissions
preflight_checks
prepare_backup_root
migrate_directory
migrate_systemd
migrate_nginx
migrate_crontab
update_shared_env
cleanup_repo_maintenance_conf
post_migration_handoff
verify_state

section "Complete"
if [[ "${MODE}" == "dry-run" ]]; then
  log_info "Dry run complete. Re-run with --execute to apply changes."
else
  log_info "Migration complete."
fi
