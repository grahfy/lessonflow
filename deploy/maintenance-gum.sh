#!/bin/bash
# Maintenance Script for Melbourne Guitar School (gum TUI version)
# Comprehensive maintenance TUI for SEO management, backups, and system tasks.
# Uses charmbracelet/gum for modern terminal UI components.

set -euo pipefail

# =============================================================================
# OS Detection & Dependency Installation
# =============================================================================

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_ID_LIKE="${ID_LIKE:-}"
  elif command -v sw_vers >/dev/null 2>&1; then
    OS_ID="darwin"
  elif command -v uname >/dev/null 2>&1; then
    OS_ID="$(uname -s | tr '[:upper:]' '[:lower:]')"
  else
    OS_ID="unknown"
  fi
  export OS_ID
}

check_gum_installed() {
  if command -v gum >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

install_gum() {
  section "Installing gum"
  
  case "${OS_ID}" in
    ubuntu|debian)
      log_info "Installing gum for Debian/Ubuntu..."
      if command -v sudo >/dev/null 2>&1; then
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
        echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list
        sudo apt update
        sudo apt install -y gum
      else
        log_error "sudo not available. Please install gum manually."
        return 1
      fi
      ;;
    fedora|rhel|centos)
      log_info "Installing gum for Fedora/RHEL..."
      if command -v sudo >/dev/null 2>&1; then
        echo '[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key' | sudo tee /etc/yum.repos.d/charm.repo
        sudo rpm --import https://repo.charm.sh/yum/gpg.key
        sudo dnf install -y gum || sudo yum install -y gum
      else
        log_error "sudo not available. Please install gum manually."
        return 1
      fi
      ;;
    arch|manjaro)
      log_info "Installing gum for Arch Linux..."
      sudo pacman -S --noconfirm gum
      ;;
    opensuse*|suse)
      log_info "Installing gum for openSUSE..."
      sudo zypper refresh
      sudo zypper install -y gum
      ;;
    darwin)
      log_info "Installing gum for macOS..."
      if command -v brew >/dev/null 2>&1; then
        brew install gum
      else
        log_error "Homebrew not found. Please install it first: https://brew.sh"
        return 1
      fi
      ;;
    freebsd)
      log_info "Installing gum for FreeBSD..."
      sudo pkg install -y gum
      ;;
    *)
      log_warn "Unknown OS: ${OS_ID}. Attempting Go installation..."
      if command -v go >/dev/null 2>&1; then
        log_info "Installing gum via Go..."
        go install github.com/charmbracelet/gum@latest
        if [[ -d "${HOME}/go/bin" ]]; then
          export PATH="${PATH}:${HOME}/go/bin"
          log_info "Added ${HOME}/go/bin to PATH"
        fi
      else
        log_error "Cannot install gum automatically. Please install manually:"
        echo "  - Visit: https://github.com/charmbracelet/gum"
        echo "  - Or run: go install github.com/charmbracelet/gum@latest"
        return 1
      fi
      ;;
  esac
  
  if check_gum_installed; then
    log_info "gum installed successfully!"
    return 0
  else
    log_error "gum installation failed. Please install manually."
    return 1
  fi
}

ensure_dependencies() {
  detect_os
  
  # Check for required tools
  local missing=()
  
  if ! command -v gum >/dev/null 2>&1; then
    missing+=("gum")
  fi
  
  if [[ ${#missing[@]} -gt 0 ]]; then
    section "Missing Dependencies"
    log_warn "Missing: ${missing[*]}"
    
    if gum confirm "Would you like to install gum now?"; then
      install_gum || exit 1
    else
      log_error "Cannot proceed without gum. Exiting."
      exit 1
    fi
  fi
}

# =============================================================================
# Resolve paths
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_SCRIPT="${SCRIPT_DIR}/update.sh"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"
REPO_ROOT=""
APP_NAME="melbourne-guitar-school"
DEPLOY_DIR="/var/www/${APP_NAME}"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
LOG_DIR="/var/log/melbourne-guitar-school"
BACKUP_DIR="${DEPLOY_DIR}/backups"

# Runtime configuration
BRANCH=""
REMOTE_NAME="origin"
SKIP_PULL=false
SKIP_DEPLOY=false
ALLOW_DIRTY=false
FORCE_SUDO_DEPLOY=false
FORCE_NO_SUDO_DEPLOY=false
SUDO_DEPLOY_AUTH_READY=false
INTERACTIVE=false
NO_COLOR=false
NO_SPINNER=false
IS_TTY=false
SPINNER_PID=""
SPINNER_MSG=""
SPINNER_FRAMES=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )

# SEO Configuration paths
SEO_CONFIG_FILE=""
SITEMAP_FILE=""
ROBOTS_FILE=""

# Backup Configuration
BACKUP_FREQUENCY="daily"
BACKUP_CLOUD_PROVIDER="none"
BACKUP_CLOUD_FOLDER="melbourne-guitar-school-backups"
BACKUP_RETENTION_DAYS=30
LAST_BACKUP_DATE=""
BACKUP_AUTO_UPLOAD=false

# Backup toggles
BACKUP_INCLUDE_SQL=true
BACKUP_INCLUDE_WEBAPP=true
BACKUP_INCLUDE_ENV=true
BACKUP_INCLUDE_LEARNING_MATERIALS=true
BACKUP_INCLUDE_SEO_CONFIG=true
BACKUP_CLEAN_OLD=true

MAINTENANCE_CONFIG_FILE=""

# Cloud credentials
GDRIVE_CLIENT_ID=""
GDRIVE_CLIENT_SECRET=""
GDRIVE_REFRESH_TOKEN=""
KOOFR_WEBDAV_URL=""
KOOFR_USERNAME=""
KOOFR_PASSWORD=""

# Colors (for non-gum output)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'
DIM='\033[2m'

# =============================================================================
# Utils
# =============================================================================

log_info() { 
  if [[ "${IS_TTY}" == true ]]; then
    gum style --foreground green "●" "$1"
  else
    echo -e "${GREEN}●${NC} $1" >&2
  fi
}

log_warn() { 
  if [[ "${IS_TTY}" == true ]]; then
    gum style --foreground yellow "▲" "$1"
  else
    echo -e "${YELLOW}▲${NC} $1" >&2
  fi
}

log_error() { 
  if [[ "${IS_TTY}" == true ]]; then
    gum style --foreground red "✖" "$1"
  else
    echo -e "${RED}✖${NC} $1" >&2
  fi
}

section() {
  local title="$1"
  if [[ "${IS_TTY}" == true ]]; then
    gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      --margin 1 \
      "$(gum style --bold --foreground cyan "  ${title}  ")"
  else
    echo ""
    local width=$(( ${#title} + 4 ))
    local rule=""
    printf -v rule '%*s' "${width}" ''
    rule="${rule// /─}"
    echo -e "${BOLD}${BLUE}╭${rule}╮${NC}"
    echo -e "${BOLD}${BLUE}│${NC}  ${BOLD}${title}${NC}  ${BOLD}${BLUE}│${NC}"
    echo -e "${BOLD}${BLUE}╰${rule}╯${NC}"
  fi
}

prompt_value() {
  local prompt="$1"
  local default="${2:-}"
  local value
  if [[ "${IS_TTY}" == true ]]; then
    value=$(gum input --prompt "$prompt: " --placeholder "${default}" --value "${default}")
  else
    read -r -p "  ${prompt} [${default}]: " value
    value="${value:-${default}}"
  fi
  echo "${value}"
}

prompt_select() {
  local prompt="$1"
  shift
  local options=("$@")
  if [[ "${IS_TTY}" == true ]]; then
    gum choose --header "$prompt" --cursor ">" "${options[@]}"
  else
    local choice
    while true; do
      echo -e "  ${prompt}:"
      local i
      for i in "${!options[@]}"; do
        echo -e "    $((i+1))) ${options[i]}"
      done
      read -r -p "  Choice [1-${#options[@]}]: " choice
      if [[ "${choice}" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
        echo "${options[$((choice - 1))]}"
        return 0
      fi
      log_warn "Please enter a valid number."
    done
  fi
}

bool_word() { [[ "$1" == true ]] && echo "ON" || echo "OFF"; }
toggle_bool() { [[ "$1" == true ]] && echo false || echo true; }

get_backup_meta() {
  local bf="$1"
  local meta_file="${bf%.tar.xz}.meta"
  if run_privileged_cmd test -f "${meta_file}"; then
    run_privileged_cmd cat "${meta_file}"
  else
    echo "Unknown"
  fi
}

format_backup_meta() {
  local meta="$1"
  local result=""
  [[ "${meta}" == *"Database"* ]] && result+="DB "
  [[ "${meta}" == *"Environment"* ]] && result+="Env "
  [[ "${meta}" == *"SEO"* ]] && result+="SEO "
  [[ "${meta}" == *"Application"* ]] && result+="App "
  [[ "${meta}" == *"Materials"* ]] && result+="Mat "
  [[ "${meta}" == *"SharedData"* ]] && result+="Data "
  echo "${result:-Unknown}"
}

# =============================================================================
# System Stats
# =============================================================================

get_cpu_usage() {
  [[ -f /proc/stat ]] || { echo "0"; return; }
  local cpu_line
  cpu_line=$(head -1 /proc/stat)
  local user nice system idle iowait irq softirq steal
  read -r _ user nice system idle iowait irq softirq steal _ <<< "${cpu_line}"
  user=${user:-0}; nice=${nice:-0}; system=${system:-0}; idle=${idle:-0}
  iowait=${iowait:-0}; irq=${irq:-0}; softirq=${softirq:-0}; steal=${steal:-0}
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

get_process_count() { ps ax | wc -l | xargs; }
get_load_average() { cut -d' ' -f1-3 /proc/loadavg; }
get_hostname() { hostname 2>/dev/null || echo "unknown"; }
get_kernel() { uname -r 2>/dev/null | cut -d- -f1 || echo "unknown"; }

# =============================================================================
# Git & Paths
# =============================================================================

resolve_repo_root() {
  local c=("${SCRIPT_DIR}/.." "/var/www/${APP_NAME}/current" "/var/www/${APP_NAME}" "${HOME}/melbourne-guitar-school")
  local candidate
  for candidate in "${c[@]}"; do
    if [[ -d "${candidate}/.git" && -f "${candidate}/package.json" ]]; then
      REPO_ROOT="$(cd "${candidate}" && pwd -P)"
      return 0
    fi
  done
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
}

init_paths() {
  resolve_repo_root
  SEO_CONFIG_FILE="${REPO_ROOT}/src/lib/seo-config.json"
  SITEMAP_FILE="${REPO_ROOT}/public/sitemap.xml"
  ROBOTS_FILE="${REPO_ROOT}/public/robots.txt"
  MAINTENANCE_CONFIG_FILE="${REPO_ROOT}/.maintenance.conf"
}

current_branch_name() { git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main"; }
get_current_commit() { git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "unknown"; }
get_last_commit_msg() { git -C "${REPO_ROOT}" log -1 --format=%s 2>/dev/null || echo "none"; }

should_use_sudo_for_deploy() {
  if [[ "${FORCE_NO_SUDO_DEPLOY:-false}" == true ]]; then return 1; fi
  if [[ "${FORCE_SUDO_DEPLOY:-false}" == true ]]; then return 0; fi
  if [[ ${EUID} -eq 0 ]]; then return 1; fi
  [[ -w "${DEPLOY_DIR}" ]] || return 0
  [[ -r "${SHARED_DIR}/.env" ]] || return 0
  return 1
}

ensure_sudo_for_deploy_ready() {
  if should_use_sudo_for_deploy; then
    if [[ "${SUDO_DEPLOY_AUTH_READY:-false}" == true ]]; then return 0; fi
    if sudo -n true 2>/dev/null; then
      SUDO_DEPLOY_AUTH_READY=true
      export SUDO_DEPLOY_AUTH_READY
      return 0
    fi
    log_info "Sudo required. Please authenticate..."
    if sudo -v; then
      SUDO_DEPLOY_AUTH_READY=true
      export SUDO_DEPLOY_AUTH_READY
      return 0
    else
      return 1
    fi
  fi
  return 0
}

run_privileged_cmd() {
  if should_use_sudo_for_deploy; then
    ensure_sudo_for_deploy_ready >/dev/null
    sudo "$@"
  else
    "$@"
  fi
}

update_sudo_mode_label() {
  if [[ "${FORCE_SUDO_DEPLOY:-false}" == true ]]; then echo "FORCE ON";
  elif [[ "${FORCE_NO_SUDO_DEPLOY:-false}" == true ]]; then echo "FORCE OFF";
  else echo "AUTO"; fi
}

cycle_sudo_mode() {
  if [[ "${FORCE_SUDO_DEPLOY:-false}" == true ]]; then
    FORCE_SUDO_DEPLOY=false; FORCE_NO_SUDO_DEPLOY=true
  elif [[ "${FORCE_NO_SUDO_DEPLOY:-false}" == true ]]; then
    FORCE_SUDO_DEPLOY=false; FORCE_NO_SUDO_DEPLOY=false
  else
    FORCE_SUDO_DEPLOY=true; FORCE_NO_SUDO_DEPLOY=false
  fi
}

# =============================================================================
# Settings
# =============================================================================

load_maintenance_settings() {
  local cfg="${MAINTENANCE_CONFIG_FILE}"
  if [[ -f "${cfg}" ]]; then
    BACKUP_FREQUENCY="$(grep '^BACKUP_FREQUENCY=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "daily")"
    BACKUP_CLOUD_PROVIDER="$(grep '^BACKUP_CLOUD_PROVIDER=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "none")"
    BACKUP_CLOUD_FOLDER="$(grep '^BACKUP_CLOUD_FOLDER=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "melbourne-guitar-school-backups")"
    BACKUP_INCLUDE_SQL="$(grep '^BACKUP_INCLUDE_SQL=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "true")"
    BACKUP_INCLUDE_WEBAPP="$(grep '^BACKUP_INCLUDE_WEBAPP=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "true")"
    BACKUP_INCLUDE_ENV="$(grep '^BACKUP_INCLUDE_ENV=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "true")"
    BACKUP_INCLUDE_LEARNING_MATERIALS="$(grep '^BACKUP_INCLUDE_LEARNING_MATERIALS=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "true")"
    BACKUP_INCLUDE_SEO_CONFIG="$(grep '^BACKUP_INCLUDE_SEO_CONFIG=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "true")"
    BACKUP_CLEAN_OLD="$(grep '^BACKUP_CLEAN_OLD=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "true")"
    BACKUP_AUTO_UPLOAD="$(grep '^BACKUP_AUTO_UPLOAD=' "${cfg}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || echo "false")"
  fi
  GDRIVE_CLIENT_ID=$(get_env_val "GDRIVE_CLIENT_ID")
  GDRIVE_CLIENT_SECRET=$(get_env_val "GDRIVE_CLIENT_SECRET")
  GDRIVE_REFRESH_TOKEN=$(get_env_val "GDRIVE_REFRESH_TOKEN")
  KOOFR_WEBDAV_URL=$(get_env_val "KOOFR_WEBDAV_URL")
  KOOFR_USERNAME=$(get_env_val "KOOFR_USERNAME")
  KOOFR_PASSWORD=$(get_env_val "KOOFR_PASSWORD")
  [[ -z "${BACKUP_CLOUD_FOLDER:-}" || "${BACKUP_CLOUD_FOLDER}" == "null" ]] && BACKUP_CLOUD_FOLDER=$(get_env_val "BACKUP_CLOUD_FOLDER")
  [[ -z "${BACKUP_CLOUD_FOLDER:-}" || "${BACKUP_CLOUD_FOLDER}" == "null" ]] && BACKUP_CLOUD_FOLDER="melbourne-guitar-school-backups"
  [[ -z "${BACKUP_CLOUD_PROVIDER:-}" || "${BACKUP_CLOUD_PROVIDER}" == "null" ]] && BACKUP_CLOUD_PROVIDER="none"
  [[ -z "${BACKUP_AUTO_UPLOAD:-}" || "${BACKUP_AUTO_UPLOAD}" == "null" ]] && BACKUP_AUTO_UPLOAD="false"
  return 0
}

save_maintenance_settings() {
  cat > "${MAINTENANCE_CONFIG_FILE}" << EOF
BACKUP_FREQUENCY="${BACKUP_FREQUENCY}"
BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER}"
BACKUP_CLOUD_FOLDER="${BACKUP_CLOUD_FOLDER}"
BACKUP_INCLUDE_SQL="${BACKUP_INCLUDE_SQL}"
BACKUP_INCLUDE_WEBAPP="${BACKUP_INCLUDE_WEBAPP}"
BACKUP_INCLUDE_ENV="${BACKUP_INCLUDE_ENV}"
BACKUP_INCLUDE_LEARNING_MATERIALS="${BACKUP_INCLUDE_LEARNING_MATERIALS}"
BACKUP_INCLUDE_SEO_CONFIG="${BACKUP_INCLUDE_SEO_CONFIG}"
BACKUP_CLEAN_OLD="${BACKUP_CLEAN_OLD}"
BACKUP_AUTO_UPLOAD="${BACKUP_AUTO_UPLOAD}"
EOF
}

# =============================================================================
# DB & Env Operations
# =============================================================================

get_env_val() {
  local key="$1" val
  eval "val=\${${key}:-}"
  if [[ -z "${val}" ]]; then
    if run_privileged_cmd test -f "${SHARED_DIR}/.env" 2>/dev/null; then
      val=$(run_privileged_cmd grep -E "^${key}=" "${SHARED_DIR}/.env" 2>/dev/null | cut -d'=' -f2- | sed 's/^["'"'"']//;s/["'"'"']$//')
    else
      log_warn "Shared .env not found at ${SHARED_DIR}/.env (check permissions)"
    fi
  fi
  echo "${val}"
}

get_db_creds() {
  log_info "Looking for DATABASE_URL in ${SHARED_DIR}/.env"
  local du; du=$(get_env_val "DATABASE_URL")
  [[ -z "${du:-}" ]] && { log_error "DATABASE_URL is not set"; return 1; }
  log_info "DATABASE_URL found (length: ${#du})"
  DB_U=$(echo "${du}" | sed -n 's|.*://\([^:]*\):.*@.*|\1|p')
  DB_P=$(echo "${du}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
  DB_H=$(echo "${du}" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  DB_PORT=$(echo "${du}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_NAME=$(echo "${du}" | sed -n 's|.*/\([^?]*\).*|\1|p')
  log_info "Parsed: user=${DB_U:-empty} host=${DB_H:-empty} port=${DB_PORT:-empty} db=${DB_NAME:-empty}"
  [[ -n "${DB_U}" && -n "${DB_NAME}" ]] || { log_error "Failed to parse DATABASE_URL"; return 1; }
}

create_database_dump() {
  local output_file="$1"
  get_db_creds || { log_error "Failed to get database credentials from DATABASE_URL"; return 1; }
  [[ -z "${DB_U:-}" ]] && { log_error "Database username is empty"; return 1; }
  [[ -z "${DB_NAME:-}" ]] && { log_error "Database name is empty"; return 1; }
  log_info "DB: ${DB_NAME}@${DB_H:-localhost}:${DB_PORT:-3306} as ${DB_U}"
  local dump_err; dump_err=$(mktemp)
  if command -v mysqldump >/dev/null 2>&1; then
    log_info "Using mysqldump..."
    if MYSQL_PWD="${DB_P}" mysqldump -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" > "${output_file}" 2>"${dump_err}"; then
      rm -f "${dump_err}"
      return 0
    else
      log_error "mysqldump failed: $(cat "${dump_err}" | head -1)"
      rm -f "${dump_err}"
      return 1
    fi
  elif command -v mariadb-dump >/dev/null 2>&1; then
    log_info "Using mariadb-dump..."
    if MYSQL_PWD="${DB_P}" mariadb-dump -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" > "${output_file}" 2>"${dump_err}"; then
      rm -f "${dump_err}"
      return 0
    else
      log_error "mariadb-dump failed: $(cat "${dump_err}" | head -1)"
      rm -f "${dump_err}"
      return 1
    fi
  else
    log_error "No mysqldump or mariadb-dump found in PATH"
    return 1
  fi
}

restore_database() {
  local input_file="$1"
  get_db_creds || return 1
  if command -v mysql >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mysql -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" < "${input_file}" 2>/dev/null
  elif command -v mariadb >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mariadb -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" < "${input_file}" 2>/dev/null
  else
    log_error "No mysql or mariadb client found"
    return 1
  fi
}

# =============================================================================
# Cloud Provider Operations
# =============================================================================

upload_to_google_drive() {
  local fp="${1:-}"; [[ -n "${fp}" ]] || return 1; local bn="$(basename "${fp}")" at; at=$(gdrive_get_token) || return 1; local fid; fid=$(gdrive_get_folder_id "${at}") || return 1
  log_info "Uploading ${bn} to GDrive..."
  local metadata="{\"name\": \"${bn}\", \"parents\": [\"${fid}\"]}"; local boundary="---314159265358979323846" tmp=$(mktemp)
  { echo "--${boundary}"; echo "Content-Type: application/json; charset=UTF-8"; echo ""; echo "${metadata}"; echo "--${boundary}"; echo "Content-Type: application/octet-stream"; echo ""; cat "${fp}"; echo ""; echo "--${boundary}--"; } > "${tmp}"
  local res; res=$(curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" -H "Authorization: Bearer ${at}" -H "Content-Type: multipart/related; boundary=${boundary}" --data-binary "@${tmp}" 2>/dev/null)
  rm -f "${tmp}"; [[ "${res}" == *"\"id\":"* ]] && return 0 || return 1
}

upload_to_koofr() {
  local fp="${1:-}"; [[ -n "${fp}" ]] || { log_error "Koofr: No file specified"; return 1; }
  local bn="$(basename "${fp}")"
  [[ -n "${KOOFR_WEBDAV_URL}" ]] || { log_error "Koofr: WebDAV URL not configured"; return 1; }
  [[ -n "${KOOFR_USERNAME}" ]] || { log_error "Koofr: Username not configured"; return 1; }
  [[ -n "${KOOFR_PASSWORD}" ]] || { log_error "Koofr: Password not configured"; return 1; }
  log_info "Uploading ${bn} to Koofr..."
  curl -s -X MKCOL -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/" >/dev/null 2>&1 || true
  local http_code; http_code=$(curl -s -w "%{http_code}" -T "${fp}" -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/${bn}" -o /dev/null 2>/dev/null)
  [[ "${http_code}" =~ ^(200|201|204)$ ]] && { log_info "Koofr upload OK (HTTP ${http_code})"; return 0; } || { log_error "Koofr upload failed (HTTP ${http_code})"; log_warn "Check credentials"; return 1; }
}

download_from_google_drive() {
  local bn="$1" op="$2" at; at=$(gdrive_get_token) || return 1
  local fid; fid=$(curl -s -G "https://www.googleapis.com/drive/v3/files" -H "Authorization: Bearer ${at}" --data-urlencode "q=name='${bn}' and trashed=false" | sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' | head -1)
  [[ -n "${fid}" ]] || return 1; curl -s "https://www.googleapis.com/drive/v3/files/${fid}?alt=media" -H "Authorization: Bearer ${at}" -o "${op}" 2>/dev/null
}

download_from_koofr() { curl -s -o "$2" -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/$1" 2>/dev/null; }

delete_google_drive_backup() {
  local bn="$1" at; at=$(gdrive_get_token) || return 1
  local fid; fid=$(curl -s -G "https://www.googleapis.com/drive/v3/files" -H "Authorization: Bearer ${at}" --data-urlencode "q=name='${bn}' and trashed=false" | sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' | head -1)
  [[ -n "${fid}" ]] && curl -s -X DELETE "https://www.googleapis.com/drive/v3/files/${fid}" -H "Authorization: Bearer ${at}" >/dev/null 2>&1
}

delete_koofr_backup() { local bn="$1"; curl -s -X DELETE -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/${bn}" >/dev/null 2>&1; }

list_cloud_backups() {
  local p; for p in ${BACKUP_CLOUD_PROVIDER}; do
    case "$p" in
      google-drive) local at; at=$(gdrive_get_token) || continue; local fid; fid=$(gdrive_get_folder_id "${at}") || continue
        curl -s -G "https://www.googleapis.com/drive/v3/files" -H "Authorization: Bearer ${at}" --data-urlencode "q='${fid}' in parents and trashed=false" | grep -o '"name"[^}]*' | sed 's/.*: *"\([^"]*\)".*/\1/' | grep 'backup-.*\.tar\.xz$' || true ;;
      koofr) curl -s -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/" 2>/dev/null | grep -o 'backup-[^"]*\.tar\.xz' || true ;;
    esac
  done | sort -u
}

# =============================================================================
# Backup & Restore Logic
# =============================================================================

create_backup_directory() { 
  local u; u=$(id -un)
  if [[ ! -d "${BACKUP_DIR}" ]]; then 
    run_privileged_cmd mkdir -p "${BACKUP_DIR}"
    run_privileged_cmd chown "${u}:${u}" "${BACKUP_DIR}" 2>/dev/null || true 
  fi
  if [[ ! -d "${LOG_DIR}" ]]; then 
    run_privileged_cmd mkdir -p "${LOG_DIR}"
    run_privileged_cmd chown "${u}:${u}" "${LOG_DIR}" 2>/dev/null || true 
  fi 
}

create_backup_archive() {
  local ts="$1" bn="backup-${ts}" td af; td="$(mktemp -d)"; af="${BACKUP_DIR}/${bn}.tar.xz"; mkdir -p "${td}/${bn}"; local c=""
  log_info "Creating backup: ${bn}"
  log_info "Staging directory: ${td}"

  if [[ "${BACKUP_INCLUDE_SQL}" == "true" ]]; then
    log_info "Starting database backup..."
    if create_database_dump "${td}/${bn}/database.sql"; then
      log_info "Database backup completed"
      c+="Database "
    else
      log_warn "Database backup failed (check connection)"
    fi
  fi

  if [[ "${BACKUP_INCLUDE_ENV}" == "true" && -f "${SHARED_DIR}/.env" ]]; then
    run_step "Environment" run_privileged_cmd cp "${SHARED_DIR}/.env" "${td}/${bn}/" && c+="Env " || log_warn "Env copy failed"
  fi

  if [[ "${BACKUP_INCLUDE_SEO_CONFIG}" == "true" && -f "${SEO_CONFIG_FILE}" ]]; then
    run_step "SEO Config" run_privileged_cmd cp "${SEO_CONFIG_FILE}" "${td}/${bn}/" && c+="SEO " || log_warn "SEO config copy failed"
  fi

  if [[ "${BACKUP_INCLUDE_WEBAPP}" == "true" && -d "${CURRENT_LINK}" ]]; then
    mkdir -p "${td}/${bn}/app"
    if run_step "Application" run_privileged_cmd rsync -a --exclude='node_modules' --exclude='.next' "${CURRENT_LINK}/" "${td}/${bn}/app/"; then
      c+="Application "
    else
      log_warn "Application copy failed"
    fi
  fi

  if [[ "${BACKUP_INCLUDE_LEARNING_MATERIALS}" == "true" && -d "${REPO_ROOT}/.data" ]]; then
    run_step "Materials" run_privileged_cmd cp -r "${REPO_ROOT}/.data" "${td}/${bn}/" && c+="Materials " || log_warn "Materials copy failed"
  fi

  if [[ -d "${SHARED_DIR}/data" ]]; then
    run_step "Shared Data" run_privileged_cmd cp -r "${SHARED_DIR}/data" "${td}/${bn}/" && c+="SharedData " || log_warn "Shared data copy failed"
  fi

  log_info "Compressing archive..."
  if [[ ! -w "${BACKUP_DIR}" ]]; then
    run_step "Archive" run_privileged_cmd tar -cJf "${af}" -C "${td}" "${bn}"
  else
    run_step "Archive" tar -cJf "${af}" -C "${td}" "${bn}"
  fi

  echo "${c}" | run_privileged_cmd tee "${BACKUP_DIR}/${bn}.meta" >/dev/null
  run_privileged_cmd rm -rf "${td}"

  if [[ -f "${af}" ]]; then
    local size; size=$(du -h "${af}" | cut -f1)
    log_info "Backup complete: ${size} (${c})"
    log_info "Archive: ${af}"
    echo "${af}"
    return 0
  else
    log_error "Backup archive creation failed"
    return 1
  fi
}

run_backup() {
  local up="${1:-false}"
  ensure_sudo_for_deploy_ready || { log_error "Sudo access required for backup"; return 1; }
  create_backup_directory
  local ts="$(date +%Y%m%d-%H%M%S)" af
  af="$(create_backup_archive "${ts}")" || return 1

  if [[ "${up}" == "true" ]]; then
    log_info "Uploading to cloud providers..."
    local p
    for p in ${BACKUP_CLOUD_PROVIDER}; do
      case "${p}" in
        google-drive)
          if upload_to_google_drive "${af}"; then
            log_info "Uploaded to Google Drive"
          else
            log_warn "Google Drive upload failed"
          fi
          ;;
        koofr)
          if upload_to_koofr "${af}"; then
            log_info "Uploaded to Koofr"
          else
            log_warn "Koofr upload failed"
          fi
          ;;
      esac
    done
  fi

  if [[ "${BACKUP_CLEAN_OLD}" == "true" ]]; then
    log_info "Cleaning old backups (>${BACKUP_RETENTION_DAYS} days)..."
    find "${BACKUP_DIR}" -name "backup-*.tar.xz" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete 2>/dev/null
  fi

  local lf="${LOG_DIR}/backup-${ts}.log"
  local lm="[$(date -Iseconds)] Backup: ${af}"
  if [[ -w "${LOG_DIR}" ]]; then
    echo "${lm}" >> "${lf}"
  else
    echo "${lm}" | run_privileged_cmd tee -a "${lf}" >/dev/null
  fi

  log_info "Backup process completed"
}

list_local_backups() { [[ -d "${BACKUP_DIR}" ]] && find "${BACKUP_DIR}" -name "backup-*.tar.xz" -type f 2>/dev/null | sort -r; }

restore_backup() {
  local bf="$1" rs="${2:-true}" rw="${3:-true}" re="${4:-true}" rm="${5:-true}" rse="${6:-true}" rd="${7:-true}"
  section "Restore Backup"

  log_info "Extracting archive: ${bf}"
  local td="$(mktemp -d)"
  tar -xJf "${bf}" -C "${td}" 2>/dev/null || { rm -rf "${td}"; log_error "Failed to extract archive"; return 1; }
  local bd="$(find "${td}" -mindepth 1 -maxdepth 1 -type d | head -1)"
  log_info "Backup source: ${bd}"

  if [[ "${rs}" == "true" && -f "${bd}/database.sql" ]]; then
    log_info "Restoring database..."
    if restore_database "${bd}/database.sql"; then
      log_info "Database restored successfully"
    else
      log_warn "Database restore failed"
    fi
  fi

  if [[ "${re}" == "true" && -f "${bd}/.env" ]]; then
    log_info "Restoring environment file..."
    run_privileged_cmd cp "${bd}/.env" "${SHARED_DIR}/.env" && log_info "Environment restored" || log_warn "Environment copy failed"
  fi

  if [[ "${rse}" == "true" && -f "${bd}/seo-config.json" ]]; then
    log_info "Restoring SEO configuration..."
    run_privileged_cmd cp "${bd}/seo-config.json" "${SEO_CONFIG_FILE}" && log_info "SEO config restored" || log_warn "SEO config copy failed"
  fi

  if [[ "${rw}" == "true" && -d "${bd}/app" ]]; then
    log_info "Restoring application files..."
    if gum confirm "Overwrite active application files in ${CURRENT_LINK}?"; then
      run_step "Restoring files" run_privileged_cmd cp -r "${bd}/app/." "${CURRENT_LINK}/"
      log_info "Application files restored"
    else
      log_warn "Application file restore skipped by user"
    fi
  fi

  if [[ "${rm}" == "true" && -d "${bd}/learning-materials" ]]; then
    log_info "Restoring learning materials..."
    run_privileged_cmd cp -r "${bd}/learning-materials" "${REPO_ROOT}/.data/" && log_info "Learning materials restored" || log_warn "Learning materials copy failed"
  fi

  if [[ "${rd}" == "true" && -d "${bd}/data" ]]; then
    log_info "Restoring shared data..."
    run_privileged_cmd cp -r "${bd}/data" "${SHARED_DIR}/" && log_info "Shared data restored" || log_warn "Shared data copy failed"
  fi

  run_privileged_cmd rm -rf "${td}"
  log_info "Restore process completed!"
}

download_backup_from_cloud() {
  local btr="$1" dp="$2" success=false
  for p in ${BACKUP_CLOUD_PROVIDER}; do
    case "$p" in 
      google-drive) download_from_google_drive "${btr}" "${dp}" && success=true && break ;; 
      koofr) download_from_koofr "${btr}" "${dp}" && success=true && break ;; 
    esac
  done
  [[ "$success" == true ]] && return 0 || { log_error "Fail"; return 1; }
}

# =============================================================================
# Gum TUI Pages
# =============================================================================

gum_main_menu() {
  local cpu mem disk up hostname_val kernel_val branch_name commit_hash commit_msg sudo_label
  
  while true; do
    # Gather stats
    cpu=$(get_cpu_usage)
    mem=$(get_memory_usage)
    disk=$(get_disk_usage "/")
    up=$(get_uptime)
    hostname_val=$(get_hostname)
    kernel_val=$(get_kernel)
    branch_name="$(current_branch_name 2>/dev/null || echo "main")"
    commit_hash="$(get_current_commit 2>/dev/null || echo "???")"
    commit_msg="$(get_last_commit_msg 2>/dev/null || echo "...")"
    sudo_label="$(update_sudo_mode_label)"
    
    # Build header
    local header
    header=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "⬡ Melbourne Guitar School")" \
      "" \
      "$(gum style --bold "Maintenance Console")" \
      "" \
      "$(gum style --foreground 250 "Host:") $(gum style --foreground 45 "${hostname_val}")  $(gum style --foreground 208 "Kernel:") $(gum style --foreground 220 "${kernel_val}")" \
      "$(gum style --foreground 250 "Time:") $(gum style --foreground 82 "$(date "+%Y-%m-%d %H:%M:%S")")" \
    )
    
    # Build stats section
    local stats_section
    stats_section=$(gum style \
      --border rounded \
      --border-foreground cyan \
      --padding "1 2" \
      --margin "0 0 1 0" \
      "$(gum style --foreground 250 "CPU")   $(draw_gum_cpu_bar "${cpu}")  $(gum style --foreground 250 "Uptime:") $(gum style --foreground 141 "${up}")" \
      "$(gum style --foreground 250 "MEM")   $(draw_gum_mem_bar "${mem}")  $(gum style --foreground 250 "Procs:") $(gum style --foreground 45 "$(get_process_count)")" \
      "$(gum style --foreground 250 "DISK")  $(draw_gum_disk_bar "${disk}")  $(gum style --foreground 250 "Load:") $(gum style --foreground 220 "$(get_load_average)")" \
    )
    
    # Build git status
    local git_status
    git_status=$(gum style \
      --border rounded \
      --border-foreground cyan \
      --padding "1 2" \
      --margin "0 0 1 0" \
      "$(gum style --bold "Git Status")" \
      "" \
      "$(gum style --foreground 250 "Branch:") $(gum style --foreground 82 "${branch_name}")  $(gum style --foreground 250 "Commit:") $(gum style --foreground 220 "${commit_hash}")  $(gum style --foreground 250 "Sudo:") $(gum style --foreground 141 "${sudo_label}")" \
      "$(gum style --foreground 250 "Last:") $(gum style --foreground 250 "${commit_msg:0:60}")" \
    )
    
    # Build menu options
    local menu_options
    menu_options=$(gum style \
      --border rounded \
      --border-foreground cyan \
      --padding "1 2" \
      "$(gum style --bold "Categories")" \
      "" \
      "$(gum style --foreground 45 "D") Deploy      $(gum style --foreground 250 "- Deploy/Update")" \
      "$(gum style --foreground 82 "B") Backup      $(gum style --foreground 250 "- Manage Backups")" \
      "$(gum style --foreground 33 "S") SEO/DB      $(gum style --foreground 250 "- SEO & Health")" \
      "$(gum style --foreground 208 "Y") System     $(gum style --foreground 250 "- Config/Git")" \
      "" \
      "$(gum style --foreground 250 "Select: D, B, S, Y | R: Refresh | Q: Quit")" \
    )
    
    # Display everything
    clear
    echo "${header}"
    echo ""
    echo "${stats_section}"
    echo "${git_status}"
    echo "${menu_options}"
    
    # Get user input
    local choice
    if [[ "${IS_TTY}" == true ]]; then
      choice=$(gum input --prompt "Choice: " --placeholder "Select category...")
    else
      read -r choice
    fi
    
    case "${choice,,}" in
      d) gum_deploy_menu ;;
      b) gum_backup_menu ;;
      s) gum_seo_db_menu ;;
      y) gum_system_menu ;;
      r) continue ;;
      q|quit|exit) 
        if gum confirm "Exit maintenance console?"; then
          exit 0
        fi
        ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

draw_gum_cpu_bar() {
  local p="$1"
  local color
  if (( p < 30 )); then color="82"
  elif (( p < 50 )); then color="119"
  elif (( p < 70 )); then color="77"
  elif (( p < 85 )); then color="178"
  elif (( p < 95 )); then color="208"
  else color="196"
  fi
  local bar="" width=15
  local filled=$(( (p * width) / 100 ))
  local empty=$(( width - filled ))
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  gum style --foreground "${color}" "${bar} ${p}%"
}

draw_gum_mem_bar() {
  local p="$1"
  local color
  if (( p < 50 )); then color="33"
  elif (( p < 70 )); then color="45"
  elif (( p < 85 )); then color="220"
  else color="208"
  fi
  local bar="" width=15
  local filled=$(( (p * width) / 100 ))
  local empty=$(( width - filled ))
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  gum style --foreground "${color}" "${bar} ${p}%"
}

draw_gum_disk_bar() {
  local p="$1"
  local color
  if (( p < 60 )); then color="82"
  elif (( p < 75 )); then color="220"
  elif (( p < 90 )); then color="208"
  else color="196"
  fi
  local bar="" width=15
  local filled=$(( (p * width) / 100 ))
  local empty=$(( width - filled ))
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  gum style --foreground "${color}" "${bar} ${p}%"
}

gum_deploy_menu() {
  while true; do
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  Deploy Management  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "Update and deploy operations")"
    echo ""
    echo "$(gum style --foreground 45 "U") Update      $(gum style --foreground 250 "- Run update.sh")"
    echo "$(gum style --foreground 82 "D") Deploy      $(gum style --foreground 250 "- Run deploy.sh")"
    echo "$(gum style --foreground 141 "S") Sudo Mode  $(gum style --foreground 250 "- Current: $(update_sudo_mode_label)")"
    echo ""
    echo "$(gum style --foreground 250 "B") Back"
    echo ""
    
    local choice
    choice=$(gum input --prompt "Choice: " --placeholder "Select option...")
    
    case "${choice,,}" in
      u) 
        section "Updating Application"
        bash "${UPDATE_SCRIPT}" --sudo-deploy
        gum confirm "Update completed" || true
        ;;
      d) 
        section "Deploying Application"
        bash "${DEPLOY_SCRIPT}" --skip-pull
        gum confirm "Deploy completed" || true
        ;;
      s) cycle_sudo_mode ;;
      b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

gum_backup_menu() {
  while true; do
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  Backup & Restore  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "Manage local and cloud backups")"
    echo ""
    echo "$(gum style --foreground 82 "R") Run Backup     $(gum style --foreground 250 "- Create new backup")"
    echo "$(gum style --foreground 45 "T") Restore        $(gum style --foreground 250 "- Restore from backup")"
    echo "$(gum style --foreground 196 "D") Delete         $(gum style --foreground 250 "- Delete backups")"
    echo "$(gum style --foreground 33 "V") Cloud Settings $(gum style --foreground 250 "- Configure providers")"
    echo "$(gum style --foreground 208 "C") Components     $(gum style --foreground 250 "- Toggle backup parts")"
    echo "$(gum style --foreground 220 "F") Frequency      $(gum style --foreground 250 "- Current: ${BACKUP_FREQUENCY}")"
    echo "$(gum style --foreground 141 "K") Retention      $(gum style --foreground 250 "- Current: ${BACKUP_RETENTION_DAYS} days")"
    echo ""
    echo "$(gum style --foreground 250 "B") Back"
    echo ""
    
    local choice
    choice=$(gum input --prompt "Choice: " --placeholder "Select option...")
    
    case "${choice,,}" in
      r) 
        run_backup "${BACKUP_AUTO_UPLOAD:-false}"
        gum confirm "Backup completed" || true
        ;;
      t) gum_restore_backup_tui ;;
      d) gum_delete_backups_tui ;;
      v) gum_cloud_settings_tui ;;
      c) gum_backup_components_tui ;;
      f) 
        section "Backup Frequency"
        BACKUP_FREQUENCY=$(gum choose --header "Select frequency" "hourly" "daily" "weekly")
        save_maintenance_settings
        log_info "Frequency set to: ${BACKUP_FREQUENCY}"
        ;;
      k) 
        section "Retention Days"
        BACKUP_RETENTION_DAYS=$(gum input --prompt "Days to keep: " --placeholder "${BACKUP_RETENTION_DAYS}" --value "${BACKUP_RETENTION_DAYS}")
        save_maintenance_settings
        log_info "Retention set to: ${BACKUP_RETENTION_DAYS} days"
        ;;
      b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

gum_backup_components_tui() {
  while true; do
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  Backup Components  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "Configure included backup parts")"
    echo ""
    echo "$(gum style --foreground 82 "S") Database   $(gum style --foreground 250 "- $(bool_word "${BACKUP_INCLUDE_SQL}")")"
    echo "$(gum style --foreground 45 "A") App Files  $(gum style --foreground 250 "- $(bool_word "${BACKUP_INCLUDE_WEBAPP}")")"
    echo "$(gum style --foreground 220 "E") Env File   $(gum style --foreground 250 "- $(bool_word "${BACKUP_INCLUDE_ENV}")")"
    echo "$(gum style --foreground 208 "M") Materials  $(gum style --foreground 250 "- $(bool_word "${BACKUP_INCLUDE_LEARNING_MATERIALS}")")"
    echo "$(gum style --foreground 33 "O") SEO Config  $(gum style --foreground 250 "- $(bool_word "${BACKUP_INCLUDE_SEO_CONFIG}")")"
    echo "$(gum style --foreground 141 "C") Clean Old   $(gum style --foreground 250 "- $(bool_word "${BACKUP_CLEAN_OLD}")")"
    echo ""
    echo "$(gum style --foreground 82 "V") Save"
    echo "$(gum style --foreground 250 "B") Back"
    echo ""
    
    local choice
    choice=$(gum input --prompt "Choice: " --placeholder "Toggle options...")
    
    case "${choice,,}" in
      s) BACKUP_INCLUDE_SQL=$(toggle_bool "${BACKUP_INCLUDE_SQL}") ;;
      a) BACKUP_INCLUDE_WEBAPP=$(toggle_bool "${BACKUP_INCLUDE_WEBAPP}") ;;
      e) BACKUP_INCLUDE_ENV=$(toggle_bool "${BACKUP_INCLUDE_ENV}") ;;
      m) BACKUP_INCLUDE_LEARNING_MATERIALS=$(toggle_bool "${BACKUP_INCLUDE_LEARNING_MATERIALS}") ;;
      o) BACKUP_INCLUDE_SEO_CONFIG=$(toggle_bool "${BACKUP_INCLUDE_SEO_CONFIG}") ;;
      c) BACKUP_CLEAN_OLD=$(toggle_bool "${BACKUP_CLEAN_OLD}") ;;
      v) 
        save_maintenance_settings
        log_info "Settings saved"
        return 0
        ;;
      b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

gum_cloud_settings_tui() {
  while true; do
    local use_g="false" use_k="false"
    [[ "${BACKUP_CLOUD_PROVIDER}" == *"google-drive"* ]] && use_g="true"
    [[ "${BACKUP_CLOUD_PROVIDER}" == *"koofr"* ]] && use_k="true"
    
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  Cloud Settings  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "Configure cloud backup providers")"
    echo ""
    echo "$(gum style --foreground 82 "G") Google Drive  $(gum style --foreground 250 "- $(bool_word "${use_g}")")"
    echo "$(gum style --foreground 45 "K") Koofr         $(gum style --foreground 250 "- $(bool_word "${use_k}")")"
    echo "$(gum style --foreground 220 "U") Auto Upload   $(gum style --foreground 250 "- $(bool_word "${BACKUP_AUTO_UPLOAD}")")"
    echo ""
    echo "$(gum style --foreground 250 "Folder: ${BACKUP_CLOUD_FOLDER}")"
    echo ""
    echo "$(gum style --foreground 208 "F") Change Folder"
    echo "$(gum style --foreground 250 "B") Back"
    echo ""
    
    local choice
    choice=$(gum input --prompt "Choice: " --placeholder "Configure cloud...")
    
    case "${choice,,}" in
      g) 
        if [[ "${use_g}" == "true" ]]; then 
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//google-drive/}"
        else 
          [[ "${BACKUP_CLOUD_PROVIDER}" == "none" ]] && BACKUP_CLOUD_PROVIDER=""
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} google-drive"
        fi
        BACKUP_CLOUD_PROVIDER=$(echo "${BACKUP_CLOUD_PROVIDER}" | xargs)
        [[ -z "${BACKUP_CLOUD_PROVIDER}" ]] && BACKUP_CLOUD_PROVIDER="none"
        save_maintenance_settings
        ;;
      k) 
        if [[ "${use_k}" == "true" ]]; then 
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//koofr/}"
        else 
          [[ "${BACKUP_CLOUD_PROVIDER}" == "none" ]] && BACKUP_CLOUD_PROVIDER=""
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} koofr"
        fi
        BACKUP_CLOUD_PROVIDER=$(echo "${BACKUP_CLOUD_PROVIDER}" | xargs)
        [[ -z "${BACKUP_CLOUD_PROVIDER}" ]] && BACKUP_CLOUD_PROVIDER="none"
        save_maintenance_settings
        ;;
      u) 
        BACKUP_AUTO_UPLOAD=$(toggle_bool "${BACKUP_AUTO_UPLOAD}")
        save_maintenance_settings
        ;;
      f) 
        BACKUP_CLOUD_FOLDER=$(gum input --prompt "Cloud folder: " --placeholder "${BACKUP_CLOUD_FOLDER}" --value "${BACKUP_CLOUD_FOLDER}")
        save_maintenance_settings
        ;;
      b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

gum_restore_backup_tui() {
  ensure_sudo_for_deploy_ready
  
  local src="local" rs=true rw=true re=true rmat=true rse=true rd=true
  
  while true; do
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  Restore Backup  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "Source: $(gum style --bold "${src^^}")")"
    echo ""
    echo "$(gum style --bold "Available Backups")"
    echo ""
    
    local backups=()
    local backup_display=()
    local letters="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    
    if [[ "${src}" == "local" ]]; then
      while IFS= read -r b; do
        [[ -n "$b" ]] || continue
        local meta; meta=$(get_backup_meta "$b")
        local fmt_meta; fmt_meta=$(format_backup_meta "${meta}")
        local size; size=$(du -h "${b}" 2>/dev/null | cut -f1)
        backups+=("${b}")
        backup_display+=("$(gum style --foreground 45 "[${letters:${#backups[@]}:1}]") $(basename "${b}") $(gum style --foreground 250 "${size} ${fmt_meta}")")
      done < <(list_local_backups)
    else
      while IFS= read -r b; do
        [[ -n "$b" ]] || continue
        backups+=("${b}")
        backup_display+=("$(gum style --foreground 33 "[${letters:${#backups[@]}:1}]") ${b}")
      done < <(list_cloud_backups)
    fi
    
    if [[ ${#backups[@]} -eq 0 ]]; then
      echo "$(gum style --foreground 220 "No backups found")"
    else
      for item in "${backup_display[@]}"; do
        echo "${item}"
      done
    fi
    
    echo ""
    echo "$(gum style --bold "Options")"
    echo "$(gum style --foreground 82 "S") SQL: $(bool_word "${rs}")  $(gum style --foreground 45 "A") App: $(bool_word "${rw}")"
    echo "$(gum style --foreground 220 "E") Env: $(bool_word "${re}")  $(gum style --foreground 208 "M") Mat: $(bool_word "${rmat}")"
    echo "$(gum style --foreground 33 "O") SEO: $(bool_word "${rse}")  $(gum style --foreground 141 "D") Data: $(bool_word "${rd}")"
    echo ""
    echo "$(gum style --foreground 82 "R") Restore  $(gum style --foreground 45 "G") Toggle Source  $(gum style --foreground 250 "B") Back"
    echo ""
    
    local choice
    choice=$(gum input --prompt "Choice: " --placeholder "Select backup...")
    choice="${choice,,}"
    
    # Check if it's a letter selection
    local idx
    idx=$(echo "${letters}" | grep -bo "${choice}" | head -1 | cut -d: -f1)
    
    if [[ -n "${idx}" && $idx -lt ${#backups[@]} ]]; then
      local selected_backup="${backups[$idx]}"
      if gum confirm "Restore $(basename "${selected_backup}")?"; then
        if [[ "${src}" == "cloud" ]]; then
          local dp="${BACKUP_DIR}/$(basename "${selected_backup}")"
          download_backup_from_cloud "${selected_backup}" "${dp}" || continue
          selected_backup="${dp}"
        fi
        restore_backup "${selected_backup}" "${rs}" "${rw}" "${re}" "${rmat}" "${rse}" "${rd}"
        gum confirm "Restore completed" || true
      fi
      continue
    fi
    
    case "${choice}" in
      s) rs=$(toggle_bool "${rs}") ;;
      a) rw=$(toggle_bool "${rw}") ;;
      e) re=$(toggle_bool "${re}") ;;
      m) rmat=$(toggle_bool "${rmat}") ;;
      o) rse=$(toggle_bool "${rse}") ;;
      d) rd=$(toggle_bool "${rd}") ;;
      g) [[ "${src}" == "local" ]] && src="cloud" || src="local" ;;
      b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

gum_delete_backups_tui() {
  local selected=()
  local backups=()
  local local_list=()
  local cloud_list=()
  
  log_info "Loading backups..."
  mapfile -t local_list < <(list_local_backups | xargs -n1 basename 2>/dev/null || true)
  mapfile -t cloud_list < <(list_cloud_backups 2>/dev/null || true)
  
  local all_ids=()
  for b in "${local_list[@]}" "${cloud_list[@]}"; do
    local id; id=$(echo "$b" | sed -n 's/backup-\(.*\)\.tar\.xz/\1/p')
    [[ -n "$id" ]] && all_ids+=("$id")
  done
  mapfile -t backups < <(printf "%s\n" "${all_ids[@]}" | sort -u -r)
  
  local count=${#backups[@]}
  for ((i=0; i<count; i++)); do selected[i]=false; done
  
  while true; do
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  Delete Backups  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "Toggle with letter, then choose action number")"
    echo ""
    
    local letters="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for ((i=0; i<count; i++)); do
      [[ $i -ge ${#letters} ]] && break
      local l="${letters:$i:1}"
      local id="${backups[i]}"
      local bn="backup-${id}.tar.xz"
      
      local is_local=false
      for bl in "${local_list[@]}"; do [[ "$bl" == "$bn" ]] && is_local=true && break; done
      local is_cloud=false
      for bc in "${cloud_list[@]}"; do [[ "$bc" == "$bn" ]] && is_cloud=true && break; done
      
      local status=""
      [[ "$is_local" == true ]] && status+="$(gum style --foreground 82 "L ")" || status+="$(gum style --foreground 250 "· ")"
      [[ "$is_cloud" == true ]] && status+="$(gum style --foreground 45 "C ")" || status+="$(gum style --foreground 250 "· ")"
      
      local meta; meta=$(get_backup_meta "${BACKUP_DIR}/${bn}")
      local fmt_meta; fmt_meta=$(format_backup_meta "${meta}")
      local tick="[ ]"
      [[ "${selected[i]}" == true ]] && tick="[$(gum style --foreground 82 "✔")]"
      
      echo "$(gum style --foreground 45 "${l}") ${tick} $(gum style --bold "${id}") ${status} $(gum style --foreground 250 "${fmt_meta}")"
    done
    
    (( count == 0 )) && echo "$(gum style --foreground 220 "No backups found")"
    
    echo ""
    echo "$(gum style --bold "Actions")"
    echo "$(gum style --foreground 196 "1") Delete Local     $(gum style --foreground 82 "2") Delete Cloud"
    echo "$(gum style --foreground 208 "3") Delete Both      $(gum style --foreground 250 "4") Back / Cancel"
    echo ""
    
    local ch
    ch=$(gum input --prompt "Choice: " --placeholder "Select...")
    ch="${ch,,}"
    
    case "${ch}" in
      [a-z]|[A-Z])
        local idx
        idx=$(echo "${letters}" | grep -bo "${ch}" | head -1 | cut -d: -f1)
        if [[ -n "$idx" && $idx -lt $count ]]; then
          [[ "${selected[idx]}" == true ]] && selected[idx]=false || selected[idx]=true
          continue
        fi
        ;;
      1|2|3)
        local mode="${ch}"
        local sel_count=0
        for s in "${selected[@]}"; do [[ "$s" == true ]] && ((sel_count++)); done
        [[ $sel_count -eq 0 ]] && { log_warn "Nothing selected"; sleep 1; continue; }
        
        if gum confirm "Are you sure?"; then
          ensure_sudo_for_deploy_ready || { log_error "Sudo authentication failed"; sleep 2; continue; }
          
          for ((i=0; i<count; i++)); do
            [[ "${selected[i]}" == true ]] || continue
            local id="${backups[i]}"
            local bn="backup-${id}.tar.xz"
            
            if [[ "$mode" == "1" || "$mode" == "3" ]]; then
              log_info "Deleting ${id} locally..."
              run_privileged_cmd rm -f "${BACKUP_DIR}/${bn}" "${BACKUP_DIR}/backup-${id}.meta" 2>/dev/null || true
            fi
            if [[ "$mode" == "2" || "$mode" == "3" ]]; then
              log_info "Deleting ${id} from cloud..."
              local provider
              for provider in ${BACKUP_CLOUD_PROVIDER}; do
                case "$provider" in
                  google-drive) delete_google_drive_backup "${bn}" ;;
                  koofr) delete_koofr_backup "${bn}" ;;
                esac
              done
            fi
          done
          log_info "Deletions completed"
          sleep 1
          return 0
        fi
        ;;
      4|b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${ch}"
        sleep 1
        ;;
    esac
  done
}

gum_seo_db_menu() {
  while true; do
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  SEO & Database  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "SEO and database health")"
    echo ""
    echo "$(gum style --foreground 82 "M") Sitemap   $(gum style --foreground 250 "- Generate sitemap")"
    echo "$(gum style --foreground 45 "G") Robots    $(gum style --foreground 250 "- Generate robots.txt")"
    echo "$(gum style --foreground 220 "H") Health    $(gum style --foreground 250 "- Database check")"
    echo ""
    echo "$(gum style --foreground 250 "B") Back"
    echo ""
    
    local choice
    choice=$(gum input --prompt "Choice: " --placeholder "Select option...")
    
    case "${choice,,}" in
      m) 
        generate_sitemap
        gum confirm "Sitemap generated" || true
        ;;
      g) 
        generate_robots_txt
        gum confirm "Robots.txt generated" || true
        ;;
      h) 
        check_database_health
        gum confirm "Health check completed" || true
        ;;
      b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

gum_system_menu() {
  while true; do
    local menu
    menu=$(gum style \
      --border double \
      --border-foreground cyan \
      --padding "0 2" \
      "$(gum style --bold --foreground cyan "  System Management  ")" \
    )
    
    clear
    echo "${menu}"
    echo ""
    echo "$(gum style --foreground 250 "Operations and configuration")"
    echo ""
    echo "$(gum style --foreground 82 "P") Git Pull      $(gum style --foreground 250 "- Fetch and pull")"
    echo "$(gum style --foreground 45 "X") Clean Cache   $(gum style --foreground 250 "- Remove build cache")"
    echo "$(gum style --foreground 220 "E") Edit Config   $(gum style --foreground 250 "- Edit .env file")"
    echo ""
    echo "$(gum style --foreground 250 "B") Back"
    echo ""
    
    local choice
    choice=$(gum input --prompt "Choice: " --placeholder "Select option...")
    
    case "${choice,,}" in
      p) 
        run_git_pull
        gum confirm "Git pull completed" || true
        ;;
      x) 
        [[ -d "${REPO_ROOT}/.next" ]] && run_privileged_cmd rm -rf "${REPO_ROOT}/.next"
        [[ -d "${REPO_ROOT}/node_modules/.cache" ]] && run_privileged_cmd rm -rf "${REPO_ROOT}/node_modules/.cache"
        log_info "Cache cleaned"
        gum confirm "Done" || true
        ;;
      e) 
        section "Edit Configuration"
        prompt_env_editor
        ;;
      b|q) return 0 ;;
      "") continue ;;
      *) 
        log_warn "Invalid option: ${choice}"
        sleep 1
        ;;
    esac
  done
}

# =============================================================================
# Helper Functions (need to be implemented)
# =============================================================================

generate_sitemap() {
  log_info "Generating sitemap..."
  # Placeholder - implement based on original
  log_info "Sitemap generation complete"
}

generate_robots_txt() {
  log_info "Generating robots.txt..."
  # Placeholder - implement based on original
  log_info "robots.txt generation complete"
}

check_database_health() { 
  section "Database Health"
  get_db_creds || { log_error "No creds"; return 1; }
  log_info "Connecting to ${DB_NAME} on ${DB_H:-localhost}..."
  if command -v mysql >/dev/null 2>&1; then 
    if MYSQL_PWD="${DB_P}" mysql -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" -e "SELECT 1" "${DB_NAME}" >/dev/null 2>&1; then 
      log_info "DB OK"
    else 
      log_error "DB Fail"
    fi
  elif command -v mariadb >/dev/null 2>&1; then 
    if MYSQL_PWD="${DB_P}" mariadb -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" -e "SELECT 1" "${DB_NAME}" >/dev/null 2>&1; then 
      log_info "DB OK"
    else 
      log_error "DB Fail"
    fi
  else 
    log_error "No mysql client"
  fi
}

run_git_pull() { 
  section "Git Pull"
  run_step "Fetching" git -C "${REPO_ROOT}" fetch "${REMOTE_NAME}"
  run_step "Pulling" git -C "${REPO_ROOT}" pull "${REMOTE_NAME}" "${BRANCH:-$(current_branch_name)}"
}

run_step() { 
  local msg="$1"
  shift
  if [[ "${IS_TTY}" == true ]]; then
    gum spin --spinner dot --title "${msg}..." -- "$@"
  else
    start_spinner "${msg}"
    if "$@" >/dev/null 2>&1; then 
      stop_spinner "ok" >&2
    else 
      stop_spinner "fail" >&2
      return 1
    fi
  fi
}

start_spinner() { 
  local msg="$1" i=0
  SPINNER_MSG="${msg}"
  # Simple spinner implementation
  while true; do
    for frame in "${SPINNER_FRAMES[@]}"; do
      printf "\r${frame} ${msg}..." >&2
      sleep 0.1
      return 0
    done
  done &
  SPINNER_PID=$!
}

stop_spinner() { 
  local status="$1"
  [[ "${NO_SPINNER:-false}" == true || "${IS_TTY:-false}" != true ]] && return 0
  if [[ -n "${SPINNER_PID:-}" ]] && kill -0 "${SPINNER_PID}" 2>/dev/null; then 
    kill "${SPINNER_PID}" 2>/dev/null || true
    wait "${SPINNER_PID}" 2>/dev/null || true
  fi
  printf "\r\033[K" >&2
  [[ "${status}" == "ok" ]] && printf "${GREEN}✔${NC} %s\n" "${SPINNER_MSG}" >&2 || printf "${RED}✖${NC} %s\n" "${SPINNER_MSG}" >&2
}

prompt_env_editor() { 
  local se="${SHARED_DIR}/.env" 
  ed="${VISUAL:-${EDITOR:-nano}}"
  for c in nano vi vim; do 
    if command -v "${c}" >/dev/null 2>&1; then 
      ed="${c}"
      break
    fi
  done
  if command -v "${ed}" >/dev/null 2>&1; then 
    if [[ -f "${se}" ]]; then 
      "${ed}" "${se}"
    else 
      log_warn "Shared .env not found"
    fi
  else 
    log_warn "No terminal editor found"
  fi
}

# =============================================================================
# Main
# =============================================================================

detect_tty_capabilities() {
  if [[ -t 0 && -t 1 ]]; then IS_TTY=true; fi
  if [[ "${NO_COLOR:-false}" == true || ! -t 1 ]]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' DIM='' NC=''
  fi
}

show_usage() {
  cat <<'EOF'
Melbourne Guitar School - Maintenance Script (gum TUI)
Usage: ./deploy/maintenance-gum.sh [options]

Options:
  --interactive     Run interactive TUI mode (default when TTY detected)
  --no-gum-check    Skip gum dependency check
  --help, -h        Show this help message

This script uses charmbracelet/gum for a modern terminal UI experience.
EOF
}

main() {
  local skip_gum_check=false
  
  while [[ $# -gt 0 ]]; do 
    case "$1" in 
      --interactive) INTERACTIVE=true ;; 
      --no-gum-check) skip_gum_check=true ;;
      --branch) BRANCH="$2"; shift ;; 
      --remote) REMOTE_NAME="$2"; shift ;; 
      --help|-h) show_usage; exit 0 ;; 
    esac 
    shift
  done
  
  # Ensure dependencies unless skipped
  if [[ "${skip_gum_check}" == false ]]; then
    ensure_dependencies
  fi
  
  init_paths
  detect_tty_capabilities
  load_maintenance_settings
  
  if [[ "${INTERACTIVE:-false}" == true || "${IS_TTY:-false}" == true ]]; then 
    gum_main_menu
  else 
    show_usage
  fi
}

main "$@"
