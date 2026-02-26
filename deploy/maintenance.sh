#!/bin/bash
# =============================================================================
# Melbourne Guitar School - Maintenance Script
# =============================================================================
# Comprehensive maintenance TUI for SEO management, backups, and system tasks.
# Uses the same patterns as update.sh and deploy.sh for consistency.
# Enhanced with btop-style TUI aesthetics and selective restore functionality.
#
# Usage: ./deploy/maintenance.sh [options]
# =============================================================================

set -euo pipefail

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="melbourne-guitar-school"
DEPLOY_DIR="/var/www/${APP_NAME}"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
LOG_DIR="/var/log/melbourne-guitar-school"
BACKUP_DIR="${DEPLOY_DIR}/backups"

# Runtime configuration
REPO_ROOT=""
BRANCH=""
REMOTE_NAME="origin"
SKIP_PULL=false
ALLOW_DIRTY=false
INTERACTIVE=false
NO_COLOR=false
NO_SPINNER=false
IS_TTY=false
SPINNER_PID=""
SPINNER_MSG=""
SPINNER_FRAMES=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠦" "⠴" "⠧" "⠇" "⠏" )
MAINTENANCE_TUI_PANEL_WIDTH=92
MAINTENANCE_TUI_PANEL_WIDTH_MAX=120

# Config file paths
SEO_CONFIG_FILE=""
SITEMAP_FILE=""
ROBOTS_FILE=""
MAINTENANCE_CONFIG_FILE=""

# Backup Configuration
BACKUP_FREQUENCY="daily"
BACKUP_CLOUD_PROVIDER="none"
BACKUP_CLOUD_FOLDER="melbourne-guitar-school-backups"
BACKUP_RETENTION_DAYS=30
LAST_BACKUP_DATE=""

# Backup toggles
BACKUP_INCLUDE_SQL=true
BACKUP_INCLUDE_WEBAPP=true
BACKUP_INCLUDE_ENV=true
BACKUP_INCLUDE_LEARNING_MATERIALS=true
BACKUP_INCLUDE_SEO_CONFIG=true
BACKUP_CLEAN_OLD=true

# Cloud credentials
GDRIVE_CLIENT_ID=""
GDRIVE_CLIENT_SECRET=""
GDRIVE_REFRESH_TOKEN=""
KOOFR_WEBDAV_URL=""
KOOFR_USERNAME=""
KOOFR_PASSWORD=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'
DIM='\033[2m'

# btop colors
BTOP_FG='\033[38;5;250m'
BTOP_FG_DIM='\033[38;5;245m'
BTOP_CYAN='\033[38;5;45m'
BTOP_GREEN='\033[38;5;82m'
BTOP_BLUE='\033[38;5;33m'
BTOP_ORANGE='\033[38;5;208m'
BTOP_PURPLE='\033[38;5;141m'
BTOP_YELLOW='\033[1;33m'

# Box drawing
BOX_TL='╭'
BOX_TR='╮'
BOX_BL='╰'
BOX_BR='╯'
BOX_H='─'
BOX_V='│'
BOX_VR='├'
BOX_VL='┤'

BLOCK_EMPTY='░'
BLOCK_FULL='█'

# =============================================================================
# Utils
# =============================================================================

log_info() { echo -e "${GREEN}●${NC} $1"; }
log_warn() { echo -e "${YELLOW}▲${NC} $1"; }
log_error() { echo -e "${RED}✖${NC} $1"; }

section() {
  echo ""
  local title="$1"
  local width=$(( ${#title} + 4 ))
  local rule=""
  printf -v rule '%*s' "${width}" ''
  rule="${rule// /─}"
  echo -e "${BOLD}${BLUE}╭${rule}╮${NC}"
  echo -e "${BOLD}${BLUE}│${NC}  ${BOLD}${title}${NC}  ${BOLD}${BLUE}│${NC}"
  echo -e "${BOLD}${BLUE}╰${rule}╯${NC}"
}

prompt_yes_no() {
  local prompt="$1"
  local default_answer="${2:-y}"
  local answer=""
  local suffix="[y/N]"
  [[ "${default_answer,,}" == "y" ]] && suffix="[Y/n]"
  while true; do
    read -r -p "${prompt} ${suffix} " answer
    answer="${answer:-$default_answer}"
    case "${answer,,}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) log_warn "Please answer y or n." ;;
    esac
  done
}

prompt_value() {
  local prompt="$1" default_value="${2:-}"
  local value=""
  if [[ -n "${default_value}" ]]; then
    read -r -p "${prompt} [${default_value}]: " value
    echo "${value:-$default_value}"
    return 0
  fi
  read -r -p "${prompt}: " value
  echo "${value}"
}

prompt_select() {
  local prompt="$1"
  shift
  local options=("$@")
  local i=1
  echo ""
  for opt in "${options[@]}"; do echo "  ${i}) ${opt}"; ((i++)); done
  echo ""
  while true; do
    read -r -p "${prompt} [1-$(( ${#options[@]} ))]: " choice
    if [[ "${choice}" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      echo "${options[$((choice - 1))]}"
      return 0
    fi
    log_warn "Please enter a valid number."
  done
}

bool_word() { [[ "$1" == true ]] && echo "ON" || echo "OFF"; }
toggle_bool() { [[ "$1" == true ]] && echo false || echo true; }
tui_clear_screen() { [[ "${IS_TTY}" == true ]] && clear; }
print_tui_panel_rule() {
  local width="${1:-84}"
  local rule=""
  printf -v rule '%*s' "${width}" ''
  rule="${rule// /─}"
  echo -e "${DIM}${BLUE}${rule}${NC}"
}

tui_truncate_text() {
  local text="$1" max_width="$2"
  [[ -z "${max_width}" || "${max_width}" -le 0 ]] && { printf ""; return 0; }
  (( ${#text} <= max_width )) && { printf "%s" "${text}"; return 0; }
  (( max_width <= 3 )) && { printf '%.*s' "${max_width}" "..."; return 0; }
  printf '%s...' "${text:0:max_width-3}"
}

# =============================================================================
# btop Stats
# =============================================================================

get_cpu_usage() {
  [[ -f /proc/stat ]] || { echo "0"; return; }
  local cpu_line
  cpu_line=$(head -1 /proc/stat)
  local user nice system idle iowait irq softirq steal=0
  read -r user nice system idle iowait irq softirq steal <<< "$(echo "${cpu_line#cpu:}" | awk '{print $1, $2, $3, $4, $5, $6, $7, $8}')"
  local total=$((user + nice + system + idle + iowait + irq + softirq + steal))
  local usage=$((user + nice + system + irq + softirq + steal))
  [[ $total -gt 0 ]] && echo "$(( (usage * 100) / total ))" || echo "0"
}

get_memory_usage() {
  [[ -f /proc/meminfo ]] || { echo "0"; return; }
  local mem_total mem_available
  mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
  if [[ -z "${mem_available}" ]]; then
    local mem_free=$(grep MemFree /proc/meminfo | awk '{print $2}')
    local mem_buffers=$(grep Buffers /proc/meminfo | awk '{print $2}')
    local mem_cached=$(grep Cached /proc/meminfo | head -1 | awk '{print $2}')
    mem_available=$((mem_free + mem_buffers + mem_cached))
  fi
  [[ $mem_total -gt 0 ]] && echo "$(( ((mem_total - mem_available) * 100) / mem_total ))" || echo "0"
}

get_disk_usage() {
  df -P "${1:-/}" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%' || echo "0"
}

get_uptime() {
  local uptime_secs=""
  [[ -f /proc/uptime ]] && uptime_secs=$(awk '{print int($1)}' /proc/uptime)
  [[ -z "${uptime_secs}" || "${uptime_secs}" -eq 0 ]] && { echo "unknown"; return; }
  local days=$((uptime_secs / 86400))
  local hours=$(((uptime_secs % 86400) / 3600))
  local mins=$(((uptime_secs % 3600) / 60))
  if (( days > 0 )); then echo "${days}d ${hours}h ${mins}m"; elif (( hours > 0 )); then echo "${hours}h ${mins}m"; else echo "${mins}m"; fi
}

get_load_average() { awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0.00"; }
get_process_count() { grep -c '^proc' /proc/stat 2>/dev/null || echo "1"; }

draw_mini_bar() {
  local p="$1" w="${2:-15}"
  ((p = p < 0 ? 0 : p > 100 ? 100 : p))
  local filled=$(( (p * w) / 100 )) empty=$(( w - filled ))
  local bar=""
  local i
  for ((i=0; i<filled; i++)); do bar+="${BTOP_GREEN}${BLOCK_FULL}"; done
  for ((i=0; i<empty; i++)); do bar+="${BTOP_FG_DIM}${BLOCK_EMPTY}"; done
  printf "${bar}%s${NC}" ""
}

# =============================================================================
# Settings Persistence
# =============================================================================

load_maintenance_settings() {
  if [[ -f "${MAINTENANCE_CONFIG_FILE}" ]]; then
    BACKUP_FREQUENCY="$(grep '^BACKUP_FREQUENCY=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "daily")"
    BACKUP_CLOUD_PROVIDER="$(grep '^BACKUP_CLOUD_PROVIDER=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "none")"
    BACKUP_INCLUDE_SQL="$(grep '^BACKUP_INCLUDE_SQL=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_WEBAPP="$(grep '^BACKUP_INCLUDE_WEBAPP=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_ENV="$(grep '^BACKUP_INCLUDE_ENV=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_LEARNING_MATERIALS="$(grep '^BACKUP_INCLUDE_LEARNING_MATERIALS=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_SEO_CONFIG="$(grep '^BACKUP_INCLUDE_SEO_CONFIG=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
    BACKUP_CLEAN_OLD="$(grep '^BACKUP_CLEAN_OLD=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
  fi
}

save_maintenance_settings() {
  cat > "${MAINTENANCE_CONFIG_FILE}" << EOF
BACKUP_FREQUENCY=${BACKUP_FREQUENCY}
BACKUP_CLOUD_PROVIDER=${BACKUP_CLOUD_PROVIDER}
BACKUP_INCLUDE_SQL=${BACKUP_INCLUDE_SQL}
BACKUP_INCLUDE_WEBAPP=${BACKUP_INCLUDE_WEBAPP}
BACKUP_INCLUDE_ENV=${BACKUP_INCLUDE_ENV}
BACKUP_INCLUDE_LEARNING_MATERIALS=${BACKUP_INCLUDE_LEARNING_MATERIALS}
BACKUP_INCLUDE_SEO_CONFIG=${BACKUP_INCLUDE_SEO_CONFIG}
BACKUP_CLEAN_OLD=${BACKUP_CLEAN_OLD}
EOF
}

# =============================================================================
# Git
# =============================================================================

resolve_repo_root() {
  local c=("${SCRIPT_DIR}/.." "/var/www/${APP_NAME}/current" "/var/www/${APP_NAME}" "${HOME}/melbourne-guitar-school")
  for candidate in "${c[@]}"; do
    if [[ -d "${candidate}/.git" && -f "${candidate}/package.json" ]]; then
      REPO_ROOT="$(cd "${candidate}" && pwd -P)"
      return 0
    fi
  done
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
}

current_branch_name() { git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main"; }
git_worktree_dirty() { [[ -n "$(git -C "${REPO_ROOT}" status --porcelain 2>/dev/null || true)" ]]; }

run_git_pull() {
  section "Git Update"
  [[ -z "${BRANCH}" ]] && BRANCH="$(current_branch_name)"
  [[ "${ALLOW_DIRTY}" != true ]] && git_worktree_dirty && { log_warn "Tree dirty. Use --allow-dirty"; return 1; }
  log_info "Updating ${BRANCH} from ${REMOTE_NAME}..."
  run_step "Git Fetch" git -C "${REPO_ROOT}" fetch "${REMOTE_NAME}" "${BRANCH}" || return 1
  run_step "Git Pull" git -C "${REPO_ROOT}" pull --ff-only "${REMOTE_NAME}" "${BRANCH}" || return 1
  log_info "Updated to $(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
}

# =============================================================================
# Backup Logic
# =============================================================================

load_backup_config() {
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    GDRIVE_CLIENT_ID="$(grep -o 'GDRIVE_CLIENT_ID[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    GDRIVE_CLIENT_SECRET="$(grep -o 'GDRIVE_CLIENT_SECRET[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    GDRIVE_REFRESH_TOKEN="$(grep -o 'GDRIVE_REFRESH_TOKEN[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_WEBDAV_URL="$(grep -o 'KOOFR_WEBDAV_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_USERNAME="$(grep -o 'KOOFR_USERNAME[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_PASSWORD="$(grep -o 'KOOFR_PASSWORD[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
  fi
  if [[ -d "${LOG_DIR}" ]]; then
    LAST_BACKUP_DATE="$(ls -t "${LOG_DIR}"/backup-*.log 2>/dev/null | head -1 | xargs -r basename 2>/dev/null | sed 's/backup-\([0-9-]*\).log/\1/' || echo "")"
  fi
  load_maintenance_settings
}

create_backup_directory() { mkdir -p "${BACKUP_DIR}" "${LOG_DIR}"; }

create_database_dump() {
  local out="$1" du
  [[ -f "${SHARED_DIR}/.env" ]] && du="$(grep -o 'DATABASE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/')"
  [[ -n "${du}" ]] || return 1
  local host="$(echo "${du}" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\1|p')"
  local port="$(echo "${du}" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\2|p')"
  local name="$(echo "${du}" | sed -n 's|.*/\([^?]*\).*|\1|p')"
  local user="$(echo "${du}" | sed -n 's|.*://\([^:]*\):.*|\1|p')"
  local pass="$(echo "${du}" | sed -n 's|.*:[^:]*:\([^@]*\)@.*|\1|p')"
  MYSQL_PWD="${pass}" mysqldump -h "${host:-localhost}" -P "${port:-3306}" -u "${user}" --single-transaction --quick "${name}" > "${out}" 2>/dev/null
}

upload_to_google_drive() {
  local fp="$1" bn="$(basename "$fp")"
  [[ -n "${GDRIVE_CLIENT_ID}" && -n "${GDRIVE_REFRESH_TOKEN}" ]] || return 1
  local tr access_token fid
  tr="$(curl -s -X POST "https://oauth2.googleapis.com/token" -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=${GDRIVE_CLIENT_ID}&client_secret=${GDRIVE_CLIENT_SECRET}&refresh_token=${GDRIVE_REFRESH_TOKEN}&grant_type=refresh_token" 2>/dev/null)"
  access_token="$(echo "${tr}" | grep -o '"access_token"[^}]*' | sed 's/.*: *"\(.*\)".*/\1/')"
  fid="$(curl -s "https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_CLOUD_FOLDER}'+and+mimeType='application/vnd.google-apps.folder'" -H "Authorization: Bearer ${access_token}" | grep -o '"id"[^}]*' | head -1 | sed 's/.*: *"\(.*\)".*/\1/')"
  curl -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" -H "Authorization: Bearer ${access_token}" -F "metadata={name:'${bn}',parents:['${fid}']};type=application/json" -F "file=@${fp}" 2>/dev/null
}

upload_to_koofr() {
  local fp="$1" bn="$(basename "$fp")"
  [[ -n "${KOOFR_WEBDAV_URL}" ]] || return 1
  curl -s -T "${fp}" -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/${bn}" 2>/dev/null
}

create_backup_archive() {
  local ts="$1" bn="backup-${ts}" td="$(mktemp -d)" af="${BACKUP_DIR}/${bn}.tar.xz"
  mkdir -p "${td}/${bn}"
  [[ "${BACKUP_INCLUDE_SQL}" == "true" ]] && { log_info "SQL dump..."; create_database_dump "${td}/${bn}/database.sql" || log_warn "SQL failed"; }
  [[ "${BACKUP_INCLUDE_ENV}" == "true" && -f "${SHARED_DIR}/.env" ]] && cp "${SHARED_DIR}/.env" "${td}/${bn}/"
  [[ "${BACKUP_INCLUDE_SEO_CONFIG}" == "true" && -f "${SEO_CONFIG_FILE}" ]] && cp "${SEO_CONFIG_FILE}" "${td}/${bn}/"
  [[ "${BACKUP_INCLUDE_WEBAPP}" == "true" && -d "${CURRENT_LINK}" ]] && { log_info "App files..."; mkdir -p "${td}/${bn}/app"; rsync -a --exclude='node_modules' --exclude='.next' "${CURRENT_LINK}/" "${td}/${bn}/app/" 2>/dev/null; }
  [[ "${BACKUP_INCLUDE_LEARNING_MATERIALS}" == "true" && -d "${REPO_ROOT}/.data" ]] && cp -r "${REPO_ROOT}/.data" "${td}/${bn}/"
  [[ -d "${SHARED_DIR}/data" ]] && cp -r "${SHARED_DIR}/data" "${td}/${bn}/"
  log_info "Compressing (tar.xz)..."
  tar -cJf "${af}" -C "${td}" "${bn}" 2>/dev/null
  rm -rf "${td}"
  [[ -f "${af}" ]] && { log_info "Created: $(du -h "${af}" | cut -f1)"; echo "${af}"; } || return 1
}

run_backup() {
  local up="${1:-false}"
  section "Backup Execution"
  create_backup_directory
  local ts="$(date +%Y%m%d-%H%M%S)"
  local af; af="$(create_backup_archive "${ts}")" || return 1
  if [[ "${up}" == "true" ]]; then
    case "${BACKUP_CLOUD_PROVIDER}" in
      google-drive) upload_to_google_drive "${af}" ;;
      koofr) upload_to_koofr "${af}" ;;
    esac
  fi
  [[ "${BACKUP_CLEAN_OLD}" == "true" ]] && find "${BACKUP_DIR}" -name "backup-*.tar.xz" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete 2>/dev/null
  echo "[$(date -Iseconds)] Backup completed: ${af}" >> "${LOG_DIR}/backup-${ts}.log"
}

# =============================================================================
# Restore Logic
# =============================================================================

list_local_backups() { [[ -d "${BACKUP_DIR}" ]] && find "${BACKUP_DIR}" -name "backup-*.tar.xz" -type f 2>/dev/null | sort -r; }

download_from_google_drive() {
  local bn="$1" op="$2" tr at fid
  tr="$(curl -s -X POST "https://oauth2.googleapis.com/token" -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=${GDRIVE_CLIENT_ID}&client_secret=${GDRIVE_CLIENT_SECRET}&refresh_token=${GDRIVE_REFRESH_TOKEN}&grant_type=refresh_token" 2>/dev/null)"
  at="$(echo "${tr}" | grep -o '"access_token"[^}]*' | sed 's/.*: *"\([^"]*\)".*/\1/')"
  fid="$(curl -s "https://www.googleapis.com/drive/v3/files?q=name='${bn}'" -H "Authorization: Bearer ${at}" 2>/dev/null | grep -o '"id"[^}]*' | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')"
  curl -s "https://www.googleapis.com/drive/v3/files/${fid}?alt=media" -H "Authorization: Bearer ${at}" -o "${op}" 2>/dev/null
}

download_from_koofr() {
  curl -s -o "$2" -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/$1" 2>/dev/null
}

list_cloud_backups() {
  case "${BACKUP_CLOUD_PROVIDER}" in
    google-drive)
      local tr at
      tr="$(curl -s -X POST "https://oauth2.googleapis.com/token" -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=${GDRIVE_CLIENT_ID}&client_secret=${GDRIVE_CLIENT_SECRET}&refresh_token=${GDRIVE_REFRESH_TOKEN}&grant_type=refresh_token" 2>/dev/null)"
      at="$(echo "${tr}" | grep -o '"access_token"[^}]*' | sed 's/.*: *"\([^"]*\)".*/\1/')"
      curl -s "https://www.googleapis.com/drive/v3/files?q='${BACKUP_CLOUD_FOLDER}'+in+parents" -H "Authorization: Bearer ${at}" 2>/dev/null | grep -o '"name"[^}]*' | sed 's/.*: *"\([^"]*\)".*/\1/' | grep 'backup-.*\.tar\.xz$' || true
      ;;
    koofr) curl -s -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/" 2>/dev/null | grep -o 'backup-[^"]*\.tar\.xz' || true ;;
  esac
}

restore_database() {
  local sf="$1" du
  [[ -f "${SHARED_DIR}/.env" ]] && du=$(grep 'DATABASE_URL' "${SHARED_DIR}/.env" | sed 's/.*=//; s/["'\'']//g')
  [[ -z "${du}" ]] && return 1
  local h=$(echo "${du}" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  local p=$(echo "${du}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  local n=$(echo "${du}" | sed -n 's|.*/\([^?]*\).*|\1|p')
  local u=$(echo "${du}" | sed -n 's|.*://\([^:]*\):.*@.*|\1|p')
  local pass=$(echo "${du}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
  if command -v mysql >/dev/null 2>&1; then
    MYSQL_PWD="${pass}" mysql -h "${h:-localhost}" -P "${p:-3306}" -u "${u}" "${n}" < "${sf}" 2>/dev/null
  elif command -v mariadb >/dev/null 2>&1; then
    MYSQL_PWD="${pass}" mariadb -h "${h:-localhost}" -P "${p:-3306}" -u "${u}" "${n}" < "${sf}" 2>/dev/null
  else
    return 1
  fi
}

restore_backup() {
  local bf="$1" rs="${2:-true}" rw="${3:-true}" re="${4:-true}" rm="${5:-true}" rse="${6:-true}" rd="${7:-true}"
  section "Restore Backup"
  local td="$(mktemp -d)"
  tar -xJf "${bf}" -C "${td}" 2>/dev/null || { rm -rf "${td}"; return 1; }
  local bd="$(find "${td}" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [[ "${rs}" == "true" && -f "${bd}/database.sql" ]] && { log_info "SQL..."; restore_database "${bd}/database.sql" && log_info "OK" || log_warn "Fail"; }
  [[ "${re}" == "true" && -f "${bd}/.env" ]] && cp "${bd}/.env" "${SHARED_DIR}/.env"
  [[ "${rse}" == "true" && -f "${bd}/seo-config.json" ]] && cp "${bd}/seo-config.json" "${SEO_CONFIG_FILE}"
  [[ "${rw}" == "true" && -d "${bd}/app" ]] && log_warn "Manual move: cp -r ${bd}/app/* ${CURRENT_LINK}/"
  [[ "${rm}" == "true" && -d "${bd}/learning-materials" ]] && cp -r "${bd}/learning-materials" "${REPO_ROOT}/.data/"
  [[ "${rd}" == "true" && -d "${bd}/data" ]] && cp -r "${bd}/data" "${SHARED_DIR}/"
  rm -rf "${td}"
  log_info "Done!"
}

# =============================================================================
# TUI Logic
# =============================================================================

draw_btop_separator() {
  local width="$1" label="${2:-}"
  if [[ -z "${label}" ]]; then
    printf "${BTOP_FG}%s" "${BOX_VR}"; local i; for ((i=0; i<width-2; i++)); do printf "${BOX_H}"; done; printf "${BOX_VL}\n"
  else
    local label_len=${#label} line_len=$(( (width - 2 - label_len - 4) / 2 ))
    printf "${BTOP_FG}%s" "${BOX_VR}"; for ((i=0; i<line_len; i++)); do printf "${BOX_H}"; done; printf " ${BTOP_PURPLE}%s ${BTOP_FG}" "${label}"
    local remaining=$((width - 2 - line_len - label_len - 4)); for ((i=0; i<remaining; i++)); do printf "${BOX_H}"; done; printf "${BOX_VL}\n"
  fi
}

draw_btop_menu_item() {
  local key="$1" label="$2" description="$3" status="$4" width="$5"
  local label_width=28 desc_width=$((width - label_width - 25)) key_width=4
  printf "${BTOP_FG}%s" "${BOX_V}"; printf " ${BTOP_YELLOW}[${key}]${BTOP_FG} "; printf "${BTOP_CYAN_BRIGHT}%-${label_width}s${BTOP_FG}" "${label}"
  [[ -n "${status}" ]] && printf "${BTOP_GREEN}●${BTOP_FG} %-12s" "${status}" || printf "%-14s" ""
  local desc_trunc="$(tui_truncate_text "${description}" "${desc_width}")"
  printf "${BTOP_FG_DIM}%s" "${desc_trunc}"
  local used=$((3 + 4 + 1 + label_width + 1 + 14 + 1 + ${#desc_trunc}))
  local fill=$((width - used - 1)); local i; for ((i=0; i<fill; i++)); do printf " "; done; printf "${BTOP_FG}%s\n" "${BOX_V}"
}

print_btop_main_menu() {
  tui_clear_screen
  local cpu=$(get_cpu_usage) mem=$(get_memory_usage) disk=$(get_disk_usage "/") up=$(get_uptime)
  local width="${MAINTENANCE_TUI_PANEL_WIDTH}" inner_width=$((width - 2))
  local i
  printf "${BTOP_FG}${BOX_TL}"; for ((i=0;i<inner_width;i++)); do printf "${BOX_H}"; done; printf "${BOX_TR}\n"
  printf "${BOX_V} %*s%s%*s ${BOX_V}\n" $(( (inner_width - 22) / 2 )) "" "LessonFlow Maintenance" $(( (inner_width - 22 + 1) / 2 )) ""
  printf "${BOX_VR}"; for ((i=0;i<inner_width;i++)); do printf "${BOX_H}"; done; printf "${BOX_VL}\n"
  printf "${BOX_V} CPU $(draw_mini_bar "$cpu" 12) %3d%%  MEM $(draw_mini_bar "$mem" 12) %3d%%  DISK $(draw_mini_bar "$disk" 12) %3d%% %*s ${BOX_V}\n" "$cpu" "$mem" "$disk" $((inner_width - 70)) ""
  printf "${BTOP_FG}${BOX_BL}"; for ((i=0;i<inner_width;i++)); do printf "${BOX_H}"; done; printf "${BOX_BR}\n\n"
  draw_btop_separator "${width}" " BACKUP & RESTORE "
  draw_btop_menu_item "1" "Run Backup" "Create .tar.xz archive" "Ready" "${width}"
  draw_btop_menu_item "2" "Restore Backup" "Restore local/cloud" "Ready" "${width}"
  draw_btop_menu_item "3" "Components" "Configure backup elements" "Edit" "${width}"
  draw_btop_menu_item "4" "Cloud" "Cloud Provider: ${BACKUP_CLOUD_PROVIDER}" "Cloud" "${width}"
  draw_btop_menu_item "5" "Cron" "Freq: ${BACKUP_FREQUENCY}" "Cron" "${width}"
  echo ""
  draw_btop_separator "${width}" " SEO & DB "
  draw_btop_menu_item "6" "Sitemap" "Generate sitemap.xml" "Ready" "${width}"
  draw_btop_menu_item "7" "Robots.txt" "Generate robots.txt" "Ready" "${width}"
  draw_btop_menu_item "8" "DB Health" "Check DB connection" "Check" "${width}"
  echo ""
  draw_btop_separator "${width}" " SYSTEM "
  draw_btop_menu_item "9" "Clean Cache" "Remove .next/node cache" "Clean" "${width}"
  draw_btop_menu_item "0" "Git Pull" "Pull latest from git" "Git" "${width}"
  echo ""
  printf "  ${BOLD}${BTOP_YELLOW}1-9,0${NC} Select Action    ${BOLD}${BTOP_YELLOW}Q${NC} Quit\n"
}

restore_backup_tui() {
  local src="local" rs=true rw=true re=true rmat=true rse=true rd=true
  while true; do
    tui_clear_screen
    print_box_banner "Restore Backup"
    echo -e " Source: ${BOLD}${src^^}${NC}"
    local bks=() i=1
    if [[ "${src}" == "local" ]]; then
      while IFS= read -r b; do [[ -n "$b" ]] || continue; echo " [$i] $(basename "${b}") $(du -h "${b}" 2>/dev/null | cut -f1)"; bks+=("${b}"); ((i++)); done < <(list_local_backups)
    else
      while IFS= read -r b; do [[ -n "$b" ]] || continue; echo " [$i] $b"; bks+=("${b}"); ((i++)); done < <(list_cloud_backups)
    fi
    echo ""
    print_tui_panel_rule
    echo " [1] SQL:$(bool_word "${rs}") [2] App:$(bool_word "${rw}") [3] Env:$(bool_word "${re}")"
    echo " [4] Mat:$(bool_word "${rmat}") [5] SEO:$(bool_word "${rse}") [6] Data:$(bool_word "${rd}")"
    echo " [R] Restore [S] Source [B] Back"
    read -r -p "Select: " ch
    case "${ch,,}" in
      1) rs=$(toggle_bool "${rs}") ;; 2) rw=$(toggle_bool "${rw}") ;; 3) re=$(toggle_bool "${re}") ;;
      4) rmat=$(toggle_bool "${rmat}") ;; 5) rse=$(toggle_bool "${rse}") ;; 6) rd=$(toggle_bool "${rd}") ;;
      s) [[ "${src}" == "local" ]] && src="cloud" || src="local" ;;
      r)
        read -r -p "Number: " num
        local btr="${bks[$((num-1))]:-}"
        [[ -n "${btr}" ]] || continue
        if [[ "${src}" == "cloud" ]]; then
          local dp="${BACKUP_DIR}/$(basename "${btr}")"
          case "${BACKUP_CLOUD_PROVIDER}" in google-drive) download_from_google_drive "${btr}" "${dp}" ;; koofr) download_from_koofr "${btr}" "${dp}" ;; esac
          btr="${dp}"
        fi
        restore_backup "${btr}" "${rs}" "${rw}" "${re}" "${rmat}" "${rse}" "${rd}"
        read -r -n 1 -s -p "Press key..." ;;
      b) return 0 ;;
    esac
  done
}

print_backup_components_tui() {
  while true; do
    tui_clear_screen
    print_box_banner "Backup Components"
    echo " [1] SQL:$(bool_word "${BACKUP_INCLUDE_SQL}")"
    echo " [2] App:$(bool_word "${BACKUP_INCLUDE_WEBAPP}")"
    echo " [3] Env:$(bool_word "${BACKUP_INCLUDE_ENV}")"
    echo " [4] Mat:$(bool_word "${BACKUP_INCLUDE_LEARNING_MATERIALS}")"
    echo " [5] SEO:$(bool_word "${BACKUP_INCLUDE_SEO_CONFIG}")"
    echo " [6] Clean:$(bool_word "${BACKUP_CLEAN_OLD}")"
    echo " [S] Save [B] Back"
    read -r -p "Option: " ch
    case "${ch,,}" in
      1) BACKUP_INCLUDE_SQL=$(toggle_bool "${BACKUP_INCLUDE_SQL}") ;;
      2) BACKUP_INCLUDE_WEBAPP=$(toggle_bool "${BACKUP_INCLUDE_WEBAPP}") ;;
      3) BACKUP_INCLUDE_ENV=$(toggle_bool "${BACKUP_INCLUDE_ENV}") ;;
      4) BACKUP_INCLUDE_LEARNING_MATERIALS=$(toggle_bool "${BACKUP_INCLUDE_LEARNING_MATERIALS}") ;;
      5) BACKUP_INCLUDE_SEO_CONFIG=$(toggle_bool "${BACKUP_INCLUDE_SEO_CONFIG}") ;;
      6) BACKUP_CLEAN_OLD=$(toggle_bool "${BACKUP_CLEAN_OLD}") ;;
      s) save_maintenance_settings; return 0 ;;
      b) return 0 ;;
    esac
  done
}

# =============================================================================
# Main
# =============================================================================

run_interactive_maintenance() {
  load_backup_config; create_backup_directory
  while true; do
    print_btop_main_menu
    read -r -p "Select [1-0, Q]: " ch
    case "${ch,,}" in
      1) local up=false; prompt_yes_no "Upload to cloud?" "n" && up=true; run_backup "${up}"; read -r -n 1 -s -p "Done. Press key..." ;;
      2) restore_backup_tui ;;
      3) print_backup_components_tui ;;
      4) section "Cloud Provider"; BACKUP_CLOUD_PROVIDER=$(prompt_select "Select" "none" "google-drive" "koofr"); save_maintenance_settings ;;
      5) section "Frequency"; BACKUP_FREQUENCY=$(prompt_select "Select" "hourly" "daily" "weekly"); save_maintenance_settings ;;
      6) generate_sitemap; read -r -n 1 -s -p "Press key..." ;;
      7) generate_robots_txt; read -r -n 1 -s -p "Press key..." ;;
      8) check_database_health; read -r -n 1 -s -p "Press key..." ;;
      9) [[ -d "${REPO_ROOT}/.next" ]] && rm -rf "${REPO_ROOT}/.next"; [[ -d "${REPO_ROOT}/node_modules/.cache" ]] && rm -rf "${REPO_ROOT}/node_modules/.cache"; log_info "Cleaned"; read -r -n 1 -s -p "Press key..." ;;
      0) run_git_pull; read -r -n 1 -s -p "Press key..." ;;
      q) exit 0 ;;
    esac
  done
}

run_step() {
  local msg="$1"; shift; start_spinner "${msg}"
  if "$@" >/dev/null 2>&1; then stop_spinner "ok"; else stop_spinner "fail"; return 1; fi
}
start_spinner() {
  local msg="$1"; local i=0; local fc="${#SPINNER_FRAMES[@]}"
  [[ "${NO_SPINNER}" == true || "${IS_TTY}" != true ]] && return 0
  SPINNER_MSG="${msg}"
  ( while true; do printf "\r${CYAN}%s${NC} %s" "${SPINNER_FRAMES[$i]}" "${SPINNER_MSG}"; i=$(( (i + 1) % fc )); sleep 0.08; done ) &
  SPINNER_PID=$!
}
stop_spinner() {
  local status="$1"
  [[ "${NO_SPINNER}" == true || "${IS_TTY}" != true ]] && return 0
  kill "${SPINNER_PID}" 2>/dev/null || true; wait "${SPINNER_PID}" 2>/dev/null || true
  [[ "${status}" == "ok" ]] && printf "\r${GREEN}✔${NC} %s\n" "${SPINNER_MSG}" || printf "\r${RED}✖${NC} %s\n" "${SPINNER_MSG}"
}

check_database_health() {
  section "Database Health"
  local du; [[ -f "${SHARED_DIR}/.env" ]] && du=$(grep 'DATABASE_URL' "${SHARED_DIR}/.env" | sed 's/.*=//; s/["'\'']//g')
  [[ -z "${du}" ]] && { log_error "No DATABASE_URL"; return 1; }
  local h=$(echo "${du}" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  local p=$(echo "${du}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  local n=$(echo "${du}" | sed -n 's|.*/\([^?]*\).*|\1|p')
  if mysql -h "${h:-localhost}" -P "${p:-3306}" -u "${u:-}" -e "SELECT 1" "${n:-}" >/dev/null 2>&1; then log_info "DB OK"; else log_error "DB Fail"; fi
}

init_paths() {
  resolve_repo_root
  SEO_CONFIG_FILE="${REPO_ROOT}/src/lib/seo-config.json"
  SITEMAP_FILE="${REPO_ROOT}/public/sitemap.xml"
  ROBOTS_FILE="${REPO_ROOT}/public/robots.txt"
  MAINTENANCE_CONFIG_FILE="${REPO_ROOT}/.maintenance.conf"
}

show_usage() {
  cat <<'EOF'
Melbourne Guitar School - Maintenance Script

Usage: ./deploy/maintenance.sh [options]

Options:
  --interactive         Force interactive TUI mode (default when TTY detected)
  --skip-pull          Skip git pull when running non-interactively
  --branch BRANCH       Git branch to pull from (default: current branch)
  --remote REMOTE      Git remote to pull from (default: origin)
  --allow-dirty        Allow operation even if working tree is dirty
  --no-color            Disable colored output
  --no-spinner          Disable spinner UI
  --help, -h            Show usage
EOF
}

detect_tty_capabilities() {
  if [[ -t 0 && -t 1 ]]; then IS_TTY=true; fi
  if [[ "${IS_TTY}" == true ]]; then auto_size_tui_panel_width; fi
  if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
    disable_colors
  fi
}

disable_colors() {
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' DIM='' NC=''
  BTOP_FG='' BTOP_FG_DIM='' BTOP_CYAN='' BTOP_GREEN='' BTOP_BLUE='' BTOP_ORANGE='' BTOP_PURPLE='' BTOP_YELLOW='' BTOP_RED=''
  BTOP_OK='' BTOP_WARN='' BTOP_ERROR='' BTOP_INFO=''
  BOX_TL='┌' BOX_TR='┐' BOX_BL='└' BOX_BR='┘' BOX_H='─' BOX_V='│'
  BLOCK_EMPTY=' ' BLOCK_FULL='#'
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in --interactive) INTERACTIVE=true ;; --skip-pull) SKIP_PULL=true ;; --branch) BRANCH="$2"; shift ;; esac
    shift
  done
  detect_tty_capabilities; init_paths
  if [[ "${INTERACTIVE}" == true || "${IS_TTY}" == true ]]; then run_interactive_maintenance; else show_usage; fi
}

main "$@"
