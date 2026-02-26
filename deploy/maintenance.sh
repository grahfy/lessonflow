#!/bin/bash
# =============================================================================
# Melbourne Guitar School - Maintenance Script
# =============================================================================
# Comprehensive maintenance TUI for SEO management, backups, and system tasks.
# Uses the same patterns as update.sh and deploy.sh for consistency.
#
# Usage: ./deploy/maintenance.sh [options]
#
# Options:
#   --interactive         Force interactive TUI mode (default when TTY detected)
#   --skip-pull          Skip git pull when running non-interactively
#   --branch BRANCH       Git branch to pull from (default: current branch)
#   --remote REMOTE      Git remote to pull from (default: origin)
#   --allow-dirty        Allow operation even if working tree is dirty
#   --no-color          Disable colored output
#   --no-spinner        Disable spinner UI
#   --help, -h          Show usage
# =============================================================================

set -euo pipefail

# Resolve the deploy directory so we can invoke this script reliably even when
# called from another working directory. Mirrors update.sh/deploy.sh patterns.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT=""
ORIGINAL_ARGS=( "$@" )

# Configuration defaults
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
ALLOW_DIRTY=false
INTERACTIVE=false
NO_COLOR=false
NO_SPINNER=false
IS_TTY=false
SPINNER_PID=""
SPINNER_MSG=""
SPINNER_FRAMES=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
MAINTENANCE_TUI_PANEL_WIDTH=92
MAINTENANCE_TUI_PANEL_WIDTH_MAX=120

# SEO Configuration
SEO_CONFIG_FILE=""
SITEMAP_FILE=""
ROBOTS_FILE=""

# Backup Configuration
BACKUP_FREQUENCY="daily"
BACKUP_CLOUD_PROVIDER="none"
BACKUP_CLOUD_FOLDER="melbourne-guitar-school-backups"
BACKUP_RETENTION_DAYS=30
LAST_BACKUP_DATE=""

# Backup component toggles (persisted to config file)
BACKUP_INCLUDE_SQL=true
BACKUP_INCLUDE_WEBAPP=true
BACKUP_INCLUDE_ENV=true
BACKUP_INCLUDE_LEARNING_MATERIALS=true
BACKUP_INCLUDE_SEO_CONFIG=true
BACKUP_CLEAN_OLD=true

# Settings file for persistence
MAINTENANCE_CONFIG_FILE="${REPO_ROOT}/.maintenance.conf"

# Google Drive OAuth Configuration

# Settings file for persistence
MAINTENANCE_CONFIG_FILE=""

# Google Drive OAuth Configuration
GDRIVE_CLIENT_ID=""
GDRIVE_CLIENT_SECRET=""
GDRIVE_REFRESH_TOKEN=""

# Koofr WebDAV Configuration
KOOFR_WEBDAV_URL=""
KOOFR_USERNAME=""
KOOFR_PASSWORD=""

# ANSI color palette (shared with update.sh/deploy.sh)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
BLINK='\033[5m'
DIM='\033[2m'
NC='\033[0m'

# btop-style extended colors
BTOP_FG='\033[38;5;250m'
BTOP_FG_DIM='\033[38;5;245m'
BTOP_CYAN='\033[38;5;45m'
BTOP_CYAN_BRIGHT='\033[38;5;51m'
BTOP_GREEN='\033[38;5;82m'
BTOP_GREEN_BRIGHT='\033[38;5;118m'
BTOP_BLUE='\033[0;34m'
BTOP_ORANGE='\033[38;5;208m'
BTOP_PURPLE='\033[38;5;141m'
BTOP_YELLOW='\033[1;33m'
BTOP_RED='\033[0;31m'
BTOP_OK='\033[38;5;82m'
BTOP_WARN='\033[38;5;226m'
BTOP_ERROR='\033[38;5;203m'
BTOP_INFO='\033[38;5;45m'

# Box drawing
BOX_TL='╭'
BOX_TR='╮'
BOX_BL='╰'
BOX_BR='╯'
BOX_H='─'
BOX_V='│'
BOX_VR='├'
BOX_VL='┤'

# Block elements
BLOCK_EMPTY='░'
BLOCK_FULL='█'

# =============================================================================
# Usage
# =============================================================================

show_usage() {
  cat <<'EOF'
Melbourne Guitar School - Maintenance Script

Usage: ./deploy/maintenance.sh [options]

Options:
  --interactive         Force interactive TUI mode
  --skip-pull          Skip git pull
  --branch BRANCH       Git branch to pull from
  --remote REMOTE      Git remote to pull from
  --allow-dirty        Allow dirty worktree
  --no-color          Disable colored output
  --no-spinner        Disable spinner UI
  --help, -h          Show usage

Features:
  - Sitemap.xml and robots.txt generation
  - Backup with tar.xz compression (SQL, webapp, .env, materials, SEO)
  - Cloud backup to Google Drive or Koofr
  - Settings persistence between sessions
  - System maintenance tasks
EOF
}

# =============================================================================
# Initialization
# =============================================================================

resolve_repo_root() {
  # Try to find repo root from various locations
  local candidates=(
    "${SCRIPT_DIR}/.."
    "/var/www/${APP_NAME}/current"
    "/var/www/${APP_NAME}"
    "${HOME}/melbourne-guitar-school"
  )
  
  for candidate in "${candidates[@]}"; do
    if [[ -d "${candidate}/.git" && -f "${candidate}/package.json" ]]; then
      REPO_ROOT="$(cd "${candidate}" && pwd -P)"
      return 0
    fi
  done
  
  # Fall back to SCRIPT_DIR
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
}

init_paths() {
  resolve_repo_root
  SEO_CONFIG_FILE="${REPO_ROOT}/src/lib/seo-config.json"
  SITEMAP_FILE="${REPO_ROOT}/public/sitemap.xml"
  ROBOTS_FILE="${REPO_ROOT}/public/robots.txt"
  MAINTENANCE_CONFIG_FILE="${REPO_ROOT}/.maintenance.conf"
}

# =============================================================================
# TTY and Display
# =============================================================================

detect_tty_capabilities() {
  if [[ -t 0 && -t 1 ]]; then
    IS_TTY=true
  fi

  if [[ "${IS_TTY}" == true ]]; then
    auto_size_tui_panel_width
  fi

  if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' BLINK='' DIM='' NC=''
    BTOP_FG='' BTOP_FG_DIM='' BTOP_CYAN='' BTOP_CYAN_BRIGHT='' BTOP_GREEN='' BTOP_GREEN_BRIGHT=''
    BTOP_BLUE='' BTOP_ORANGE='' BTOP_PURPLE='' BTOP_YELLOW='' BTOP_RED=''
    BTOP_OK='' BTOP_WARN='' BTOP_ERROR='' BTOP_INFO=''
    BOX_TL='┌' BOX_TR='┐' BOX_BL='└' BOX_BR='┘' BOX_H='─' BOX_V='│'
    BLOCK_EMPTY=' ' BLOCK_FULL='#'
  fi
}

auto_size_tui_panel_width() {
  local cols=""
  local target_width=""

  if command -v tput >/dev/null 2>&1; then
    cols="$(tput cols 2>/dev/null || true)"
  fi

  if [[ -z "${cols}" && -n "${COLUMNS:-}" ]]; then
    cols="${COLUMNS}"
  fi

  if [[ ! "${cols}" =~ ^[0-9]+$ ]]; then
    return 0
  fi

  target_width="${cols}"
  if (( target_width < 48 )); then
    target_width=48
  fi
  if (( target_width > MAINTENANCE_TUI_PANEL_WIDTH_MAX )); then
    target_width="${MAINTENANCE_TUI_PANEL_WIDTH_MAX}"
  fi

  MAINTENANCE_TUI_PANEL_WIDTH="${target_width}"
}

# =============================================================================
# Version
# =============================================================================

get_app_version() {
  local package_json="${REPO_ROOT}/package.json"
  if [[ -f "${package_json}" ]]; then
    local version_line=""
    version_line="$(grep -m1 '"version"' "${package_json}" 2>/dev/null || true)"
    if [[ -n "${version_line}" ]]; then
      local version=""
      version="$(printf '%s' "${version_line}" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
      if [[ -n "${version}" && "${version}" != "${version_line}" ]]; then
        echo "${version}"
        return 0
      fi
    fi
  fi
  echo "unknown"
}

# =============================================================================
# UI Functions
# =============================================================================

print_box_banner() {
  local content="$1"
  local inner_width=$(( ${#content} + 2 ))
  local rule=""
  printf -v rule '%*s' "${inner_width}" ''
  rule="${rule// /─}"

  echo ""
  echo -e "${BOLD}${CYAN}╭${rule}╮${NC}"
  echo -e "${BOLD}${CYAN}│${NC} ${BOLD}${content}${NC} ${BOLD}${CYAN}│${NC}"
  echo -e "${BOLD}${CYAN}╰${rule}╯${NC}"
}

print_banner() {
  local app_version
  app_version="$(get_app_version)"
  print_box_banner "LessonFlow Maintenance v1.0"
}

log_info() {
  echo -e "${GREEN}●${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}▲${NC} $1"
}

log_error() {
  echo -e "${RED}✖${NC} $1"
}

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

tui_clear_screen() {
  [[ "${IS_TTY}" == true ]] && clear
}

print_tui_panel_rule() {
  local width="${1:-84}"
  local rule=""
  printf -v rule '%*s' "${width}" ''
  rule="${rule// /─}"
  echo -e "${DIM}${BLUE}${rule}${NC}"
}

tui_truncate_text() {
  local text="$1"
  local max_width="$2"

  if [[ -z "${max_width}" || "${max_width}" -le 0 ]]; then
    printf '%s' ""
    return 0
  fi

  if (( ${#text} <= max_width )); then
    printf '%s' "${text}"
    return 0
  fi

  if (( max_width <= 3 )); then
    printf '%.*s' "${max_width}" "..."
    return 0
  fi

  printf '%s...' "${text:0:max_width-3}"
}

bool_word() {
  if [[ "$1" == true ]]; then
    echo "ON"
  else
    echo "OFF"
  fi
}

toggle_bool() {
  if [[ "$1" == true ]]; then
    echo false
  else
    echo true
  fi
}

prompt_yes_no() {
  local prompt="$1"
  local default_answer="${2:-y}"
  local answer=""
  local suffix="[y/N]"

  if [[ "${default_answer,,}" == "y" ]]; then
    suffix="[Y/n]"
  fi

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
  local prompt="$1"
  local default_value="${2:-}"
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
  local options=("${@:2}")
  local i=1

  echo ""
  for opt in "${options[@]}"; do
    echo "  ${i}) ${opt}"
    ((i++))
  done
  echo ""

  while true; do
    read -r -p "${prompt} [1-$(( ${#options[@]} ))]: " choice
    if [[ "${choice}" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      echo "${options[$((choice - 1))]}"
      return 0
    fi
    log_warn "Please enter a number between 1 and $(( ${#options[@]} ))"
  done
}

# =============================================================================
# btop-style Functions
# =============================================================================

get_cpu_usage() {
  local cpu_usage=0
  if [[ -f /proc/stat ]]; then
    local cpu_line
    cpu_line=$(head -1 /proc/stat)
    local user nice system idle iowait irq softirq steal=0
    read -r user nice system idle iowait irq softirq steal <<< "$(echo "${cpu_line#cpu:}" | awk '{print $1, $2, $3, $4, $5, $6, $7, $8}')"
    local total=$((user + nice + system + idle + iowait + irq + softirq + steal))
    local usage=$((user + nice + system + irq + softirq + steal))
    if (( total > 0 )); then
      cpu_usage=$(( (usage * 100) / total ))
    fi
  fi
  echo "${cpu_usage}"
}

get_memory_usage() {
  local mem_total=0
  local mem_available=0
  if [[ -f /proc/meminfo ]]; then
    mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
    if [[ -z "${mem_available}" ]]; then
      local mem_free=$(grep MemFree /proc/meminfo | awk '{print $2}')
      local mem_buffers=$(grep Buffers /proc/meminfo | awk '{print $2}')
      local mem_cached=$(grep Cached /proc/meminfo | head -1 | awk '{print $2}')
      mem_available=$((mem_free + mem_buffers + mem_cached))
    fi
    if (( mem_total > 0 )); then
      local mem_used=$((mem_total - mem_available))
      echo "$(( (mem_used * 100) / mem_total ))"
      return
    fi
  fi
  echo "0"
}

get_disk_usage() {
  local path="${1:-/}"
  local usage=0
  if command -v df >/dev/null 2>&1; then
    usage=$(df -P "${path}" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')
  fi
  echo "${usage:-0}"
}

get_uptime() {
  local uptime_secs=""
  if [[ -f /proc/uptime ]]; then
    uptime_secs=$(awk '{print int($1)}' /proc/uptime)
  fi
  if [[ -z "${uptime_secs}" || "${uptime_secs}" -eq 0 ]]; then
    echo "unknown"
    return
  fi
  local days=$((uptime_secs / 86400))
  local hours=$(((uptime_secs % 86400) / 3600))
  local mins=$(((uptime_secs % 3600) / 60))
  if (( days > 0 )); then
    echo "${days}d ${hours}h ${mins}m"
  elif (( hours > 0 )); then
    echo "${hours}h ${mins}m"
  else
    echo "${mins}m"
  fi
}

get_process_count() {
  if [[ -f /proc/stat ]]; then
    grep -c '^proc' /proc/stat 2>/dev/null || echo "1"
  else
    echo "1"
  fi
}

draw_mini_bar() {
  local percentage="$1"
  local width="${2:-15}"
  
  if (( percentage < 0 )); then
    percentage=0
  elif (( percentage > 100 )); then
    percentage=100
  fi
  
  local filled=$(( (percentage * width) / 100 ))
  local empty=$(( width - filled ))
  
  local bar=""
  local i
  for ((i=0; i<filled; i++)); do
    bar+="${BTOP_GREEN}${BLOCK_FULL}"
  done
  for ((i=0; i<empty; i++)); do
    bar+="${BTOP_FG_DIM}${BLOCK_EMPTY}"
  done
  
  printf "${bar}%s${NC}" ""
}

draw_btop_separator() {
  local width="$1"
  local label="${2:-}"
  
  if [[ -z "${label}" ]]; then
    printf "${BTOP_FG}%s" "${BOX_VR}"
    local i
    for ((i=0; i<width-2; i++)); do
      printf "${BTOP_FG}%s" "${BOX_H}"
    done
    printf "${BTOP_FG}%s\n" "${BOX_VL}"
  else
    local label_len=${#label}
    local line_len=$(( (width - 2 - label_len - 4) / 2 ))
    
    printf "${BTOP_FG}%s" "${BOX_VR}"
    for ((i=0; i<line_len; i++)); do
      printf "${BTOP_FG}%s" "${BOX_H}"
    done
    printf " ${BTOP_PURPLE}%s ${BTOP_FG}" "${label}"
    local remaining=$((width - 2 - line_len - label_len - 4))
    for ((i=0; i<remaining; i++)); do
      printf "${BTOP_FG}%s" "${BOX_H}"
    done
    printf "${BTOP_FG}%s\n" "${BOX_VL}"
  fi
}

draw_btop_menu_item() {
  local key="$1"
  local label="$2"
  local description="$3"
  local status="$4"
  local width="$5"
  
  local label_width=28
  local desc_width=$((width - key_width - label_width - 25))
  local key_width=4
  
  printf "${BTOP_FG}%s" "${BOX_V}"
  printf " ${BTOP_YELLOW}[${key}]${BTOP_FG} "
  printf "${BTOP_CYAN_BRIGHT}%-${label_width}s${BTOP_FG}" "${label}"
  
  if [[ -n "${status}" ]]; then
    printf "${BTOP_GREEN}●${BTOP_FG} %-12s" "${status}"
  else
    printf "%-14s" ""
  fi
  
  local desc_trunc
  desc_trunc=$(tui_truncate_text "${description}" "${desc_width}")
  printf "${BTOP_FG_DIM}%s" "${desc_trunc}"
  
  local used=$((3 + 4 + 1 + label_width + 1 + 14 + 1 + ${#desc_trunc}))
  local fill=$((width - used - 1))
  local i
  for ((i=0; i<fill; i++)); do
    printf " "
  done
  
  printf "${BTOP_FG}%s\n" "${BOX_V}"
}

# =============================================================================
# Settings Persistence
# =============================================================================

save_maintenance_settings() {
  local config_file="${MAINTENANCE_CONFIG_FILE}"
  
  mkdir -p "$(dirname "${config_file}")" 2>/dev/null || true
  
  cat > "${config_file}" << EOF
# Melbourne Guitar School - Maintenance Settings
# Generated: $(date -Iseconds)

BACKUP_FREQUENCY=${BACKUP_FREQUENCY}
BACKUP_CLOUD_PROVIDER=${BACKUP_CLOUD_PROVIDER}
BACKUP_CLOUD_FOLDER=${BACKUP_CLOUD_FOLDER}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS}

# Backup component toggles
BACKUP_INCLUDE_SQL=${BACKUP_INCLUDE_SQL}
BACKUP_INCLUDE_WEBAPP=${BACKUP_INCLUDE_WEBAPP}
BACKUP_INCLUDE_ENV=${BACKUP_INCLUDE_ENV}
BACKUP_INCLUDE_LEARNING_MATERIALS=${BACKUP_INCLUDE_LEARNING_MATERIALS}
BACKUP_INCLUDE_SEO_CONFIG=${BACKUP_INCLUDE_SEO_CONFIG}
BACKUP_CLEAN_OLD=${BACKUP_CLEAN_OLD}
EOF
}

load_maintenance_settings() {
  local config_file="${MAINTENANCE_CONFIG_FILE}"
  
  if [[ -f "${config_file}" ]]; then
    BACKUP_FREQUENCY="$(grep '^BACKUP_FREQUENCY=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "daily")"
    BACKUP_CLOUD_PROVIDER="$(grep '^BACKUP_CLOUD_PROVIDER=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "none")"
    BACKUP_CLOUD_FOLDER="$(grep '^BACKUP_CLOUD_FOLDER=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "melbourne-guitar-school-backups")"
    BACKUP_RETENTION_DAYS="$(grep '^BACKUP_RETENTION_DAYS=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "30")"
    
    BACKUP_INCLUDE_SQL="$(grep '^BACKUP_INCLUDE_SQL=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_WEBAPP="$(grep '^BACKUP_INCLUDE_WEBAPP=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_ENV="$(grep '^BACKUP_INCLUDE_ENV=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_LEARNING_MATERIALS="$(grep '^BACKUP_INCLUDE_LEARNING_MATERIALS=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "true")"
    BACKUP_INCLUDE_SEO_CONFIG="$(grep '^BACKUP_INCLUDE_SEO_CONFIG=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "true")"
    BACKUP_CLEAN_OLD="$(grep '^BACKUP_CLEAN_OLD=' "${config_file}" 2>/dev/null | cut -d= -f2 || echo "true")"
  fi
}

# =============================================================================
# Git Operations
# =============================================================================

resolve_git_root() {
  if [[ -n "${REPO_ROOT}" && -d "${REPO_ROOT}/.git" ]]; then
    echo "${REPO_ROOT}"
    return 0
  fi
  if [[ -d .git ]]; then
    pwd
    return 0
  fi
  git rev-parse --show-toplevel 2>/dev/null || echo "${REPO_ROOT}"
}

current_branch_name() {
  local git_root
  git_root="$(resolve_git_root)"
  git -C "${git_root}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main"
}

git_worktree_dirty() {
  local git_root
  git_root="$(resolve_git_root)"
  [[ -n "$(git -C "${git_root}" status --porcelain 2>/dev/null || true)" ]]
}

run_git_pull() {
  local git_root
  git_root="$(resolve_git_root)"
  
  if [[ ! -d "${git_root}/.git" ]]; then
    log_error "Not a git repository: ${git_root}"
    return 1
  fi
  
  if [[ -z "${BRANCH}" ]]; then
    BRANCH="$(current_branch_name)"
  fi
  
  if [[ "${ALLOW_DIRTY}" != true ]] && git_worktree_dirty; then
    log_warn "Working tree is dirty. Commit/stash changes or use --allow-dirty."
    return 1
  fi
  
  log_info "Fetching ${REMOTE_NAME}/${BRANCH}..."
  if ! git -C "${git_root}" fetch "${REMOTE_NAME}" "${BRANCH}" 2>/dev/null; then
    log_error "Failed to fetch from ${REMOTE_NAME}"
    return 1
  fi
  
  log_info "Pulling ${REMOTE_NAME}/${BRANCH}..."
  if ! git -C "${git_root}" pull --ff-only "${REMOTE_NAME}" "${BRANCH}" 2>/dev/null; then
    log_error "Failed to pull. There may be conflicts."
    return 1
  fi
  
  log_info "Updated to $(git -C "${git_root}" rev-parse --short HEAD)"
  return 0
}

# =============================================================================
# Backup Functions
# =============================================================================

load_backup_config() {
  # Load cloud credentials from shared .env
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    GDRIVE_CLIENT_ID="$(grep -o 'GDRIVE_CLIENT_ID[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    GDRIVE_CLIENT_SECRET="$(grep -o 'GDRIVE_CLIENT_SECRET[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    GDRIVE_REFRESH_TOKEN="$(grep -o 'GDRIVE_REFRESH_TOKEN[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_WEBDAV_URL="$(grep -o 'KOOFR_WEBDAV_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_USERNAME="$(grep -o 'KOOFR_USERNAME[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
    KOOFR_PASSWORD="$(grep -o 'KOOFR_PASSWORD[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
  fi
  
  # Load last backup date
  if [[ -d "${LOG_DIR}" ]]; then
    LAST_BACKUP_DATE="$(ls -t "${LOG_DIR}"/backup-*.log 2>/dev/null | head -1 | xargs -r basename 2>/dev/null | sed 's/backup-\([0-9-]*\).log/\1/' || echo "")"
  fi
  
  # Load persisted settings
  load_maintenance_settings
}

create_backup_directory() {
  mkdir -p "${BACKUP_DIR}" "${LOG_DIR}"
}

create_database_dump() {
  local output_file="$1"
  local database_url=""
  
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    database_url="$(grep -o 'DATABASE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
  fi
  
  if [[ -z "${database_url}" ]]; then
    log_error "DATABASE_URL not found"
    return 1
  fi
  
  local db_user db_pass db_host db_port="3306" db_name
  local url_without_prefix="${database_url#mysql://}"
  
  if [[ "${url_without_prefix}" == */* ]]; then
    local creds_and_host="${url_without_prefix%%/*}"
    db_name="${url_without_prefix#*/}"
    db_name="${db_name%%\?*}"
    
    if [[ "${creds_and_host}" == *@* ]]; then
      local creds="${creds_and_host%@*}"
      local host_and_port="${creds_and_host#*@}"
      
      if [[ "${creds}" == *:* ]]; then
        db_user="${creds%%:*}"
        db_pass="${creds#*:}"
      else
        db_user="${creds}"
      fi
      
      if [[ "${host_and_port}" == *:* ]]; then
        db_host="${host_and_port%%:*}"
        db_port="${host_and_port#*:}"
      else
        db_host="${host_and_port}"
      fi
    fi
  fi
  
  if [[ -z "${db_user}" || -z "${db_name}" ]]; then
    log_error "Could not parse database credentials"
    return 1
  fi
  
  if command -v mysqldump >/dev/null 2>&1; then
    MYSQL_PWD="${db_pass}" mysqldump -h "${db_host}" -P "${db_port}" -u "${db_user}" --single-transaction --quick "${db_name}" > "${output_file}" 2>/dev/null
    return $?
  elif command -v mariadb-dump >/dev/null 2>&1; then
    MYSQL_PWD="${db_pass}" mariadb-dump -h "${db_host}" -P "${db_port}" -u "${db_user}" --single-transaction --quick "${db_name}" > "${output_file}" 2>/dev/null
    return $?
  else
    log_error "mysqldump or mariadb-dump not found"
    return 1
  fi
}

create_backup_archive() {
  local timestamp="$1"
  local backup_name="backup-${timestamp}"
  local temp_dir
  local archive_file="${BACKUP_DIR}/${backup_name}.tar.xz"

  temp_dir="$(mktemp -d)"
  mkdir -p "${temp_dir}/${backup_name}"

  # Database dump (if enabled)
  if [[ "${BACKUP_INCLUDE_SQL}" == "true" ]]; then
    log_info "Backing up database..."
    if ! create_database_dump "${temp_dir}/${backup_name}/database.sql"; then
      log_warn "Database dump failed, skipping SQL backup"
    fi
  else
    log_info "SQL backup disabled, skipping"
  fi

  # Shared .env file (if enabled)
  if [[ "${BACKUP_INCLUDE_ENV}" == "true" ]]; then
    if [[ -f "${SHARED_DIR}/.env" ]]; then
      cp "${SHARED_DIR}/.env" "${temp_dir}/${backup_name}/"
    fi
  else
    log_info ".env backup disabled, skipping"
  fi

  # SEO config (if enabled)
  if [[ "${BACKUP_INCLUDE_SEO_CONFIG}" == "true" ]]; then
    if [[ -f "${SEO_CONFIG_FILE}" ]]; then
      cp "${SEO_CONFIG_FILE}" "${temp_dir}/${backup_name}/"
    fi
  else
    log_info "SEO config backup disabled, skipping"
  fi

  # Deployed app (if enabled)
  if [[ "${BACKUP_INCLUDE_WEBAPP}" == "true" ]]; then
    if [[ -d "${CURRENT_LINK}" ]]; then
      log_info "Backing up deployed app..."
      mkdir -p "${temp_dir}/${backup_name}/app"
      if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete \
          --exclude='node_modules' \
          --exclude='.next' \
          --exclude='.git' \
          --exclude='*.log' \
          --exclude='.env*' \
          "${CURRENT_LINK}/" "${temp_dir}/${backup_name}/app/" 2>/dev/null || true
      else
        find "${CURRENT_LINK}" -mindepth 1 -maxdepth 1 ! -name 'node_modules' ! -name '.next' ! -name '.git' ! -name '*.log' ! -name '.env*' -exec cp -r {} "${temp_dir}/${backup_name}/app/" \; 2>/dev/null || true
      fi
    fi
  else
    log_info "Webapp backup disabled, skipping"
  fi

  # Learning materials (if enabled)
  if [[ "${BACKUP_INCLUDE_LEARNING_MATERIALS}" == "true" ]]; then
    local materials_dir="${REPO_ROOT}/.data/learning-materials"
    if [[ -d "${materials_dir}" ]]; then
      log_info "Backing up learning materials..."
      cp -r "${materials_dir}" "${temp_dir}/${backup_name}/" 2>/dev/null || true
    fi
  else
    log_info "Learning materials backup disabled, skipping"
  fi

  # Shared data
  if [[ -d "${SHARED_DIR}/data" ]]; then
    log_info "Backing up shared data..."
    cp -r "${SHARED_DIR}/data" "${temp_dir}/${backup_name}/" 2>/dev/null || true
  fi

  # Create xz-compressed archive
  log_info "Creating compressed backup (tar.xz)..."
  tar -cJf "${archive_file}" -C "${temp_dir}" "${backup_name}" 2>/dev/null
  rm -rf "${temp_dir}"

  if [[ -f "${archive_file}" ]]; then
    local size
    size="$(du -h "${archive_file}" | cut -f1)"
    log_info "Backup created: ${archive_file} (${size})"
    echo "${archive_file}"
    return 0
  else
    log_error "Failed to create backup archive"
    return 1
  fi
}

upload_to_google_drive() {
  local file_path="$1"
  local folder_name="${BACKUP_CLOUD_FOLDER}"
  
  if [[ -z "${GDRIVE_CLIENT_ID}" || -z "${GDRIVE_CLIENT_SECRET}" || -z "${GDRIVE_REFRESH_TOKEN}" ]]; then
    log_error "Google Drive credentials not configured"
    return 1
  fi
  
  log_info "Uploading to Google Drive..."
  
  local token_response=""
  token_response="$(curl -s -X POST "https://oauth2.googleapis.com/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${GDRIVE_CLIENT_ID}" \
    -d "client_secret=${GDRIVE_CLIENT_SECRET}" \
    -d "refresh_token=${GDRIVE_REFRESH_TOKEN}" \
    -d "grant_type=refresh_token" 2>/dev/null || true)"
  
  local access_token=""
  access_token="$(echo "${token_response}" | grep -o '"access_token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
  
  if [[ -z "${access_token}" ]]; then
    log_error "Failed to get Google Drive access token"
    return 1
  fi
  
  # Get or create folder
  local folder_id=""
  folder_id="$(curl -s "https://www.googleapis.com/drive/v3/files?q=name='${folder_name}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false" \
    -H "Authorization: Bearer ${access_token}" 2>/dev/null | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
  
  if [[ -z "${folder_id}" ]]; then
    folder_id="$(curl -s -X POST "https://www.googleapis.com/drive/v3/files" \
      -H "Authorization: Bearer ${access_token}" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${folder_name}\", \"mimeType\": \"application/vnd.google-apps.folder\"}" 2>/dev/null | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || true)"
  fi
  
  if [[ -z "${folder_id}" ]]; then
    log_error "Failed to get/create Google Drive folder"
    return 1
  fi
  
  # Upload file
  local file_name
  file_name="$(basename "${file_path}")"
  local http_code
  http_code="$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://www.googleapis.com/drive/v3/files?uploadType=multipart" \
    -H "Authorization: Bearer ${access_token}" \
    -F "metadata={\"name\": \"${file_name}\", \"parents\": [\"${folder_id}\"]};type=application/json" \
    -F "file=@${file_path};type=application/octet-stream" 2>/dev/null || echo "000")"
  
  if [[ "${http_code}" == "200" || "${http_code}" == "201" ]]; then
    log_info "Uploaded to Google Drive: ${file_name}"
    return 0
  else
    log_error "Failed to upload (HTTP ${http_code})"
    return 1
  fi
}

upload_to_koofr() {
  local file_path="$1"
  
  if [[ -z "${KOOFR_WEBDAV_URL}" || -z "${KOOFR_USERNAME}" || -z "${KOOFR_PASSWORD}" ]]; then
    log_error "Koofr WebDAV credentials not configured"
    return 1
  fi
  
  log_info "Uploading to Koofr..."
  
  local file_name
  file_name="$(basename "${file_path}")"
  local remote_path="${KOOFR_WEBDAV_URL}/${BACKUP_CLOUD_FOLDER}/${file_name}"
  
  local http_code
  http_code="$(curl -s -o /dev/null -w "%{http_code}" -T "${file_path}" \
    -u "${KOOFR_USERNAME}:${KOOFR_PASSWORD}" "${remote_path}" 2>/dev/null || echo "000")"
  
  if [[ "${http_code}" == "201" || "${http_code}" == "200" || "${http_code}" == "204" ]]; then
    log_info "Uploaded to Koofr: ${file_name}"
    return 0
  else
    log_error "Failed to upload (HTTP ${http_code})"
    return 1
  fi
}

run_backup() {
  local upload="${1:-false}"
  
  section "Backup Execution"
  create_backup_directory
  
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  
  local archive_file
  archive_file="$(create_backup_archive "${timestamp}")" || return 1
  
  # Upload to cloud if requested
  if [[ "${upload}" == "true" ]]; then
    case "${BACKUP_CLOUD_PROVIDER}" in
      google-drive)
        upload_to_google_drive "${archive_file}"
        ;;
      koofr)
        upload_to_koofr "${archive_file}"
        ;;
    esac
  fi
  
  # Clean old backups (if enabled)
  if [[ "${BACKUP_CLEAN_OLD}" == "true" ]]; then
    log_info "Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days..."
    find "${BACKUP_DIR}" -name "backup-*.tar.xz" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete 2>/dev/null || true
  fi
  
  echo "[$(date -Iseconds)] Backup completed: ${archive_file}" >> "${LOG_DIR}/backup-${timestamp}.log"
  
  log_info "Backup completed successfully"
  return 0
}

# =============================================================================
# SEO Functions
# =============================================================================

init_seo_config() {
  if [[ ! -f "${SEO_CONFIG_FILE}" ]]; then
    mkdir -p "$(dirname "${SEO_CONFIG_FILE}")"
    cat > "${SEO_CONFIG_FILE}" << 'EOF'
{
  "version": "1.0",
  "pages": {
    "/": {"enabled": true, "priority": 1.0, "changeFrequency": "monthly"},
    "/lessons": {"enabled": true, "priority": 0.9, "changeFrequency": "monthly"},
    "/teacher": {"enabled": true, "priority": 0.7, "changeFrequency": "yearly"},
    "/vouchers": {"enabled": true, "priority": 0.8, "changeFrequency": "monthly"},
    "/contact": {"enabled": true, "priority": 0.6, "changeFrequency": "yearly"},
    "/book": {"enabled": true, "priority": 0.8, "changeFrequency": "monthly"},
    "/terms": {"enabled": true, "priority": 0.3, "changeFrequency": "yearly"}
  }
}
EOF
    log_info "Created SEO config: ${SEO_CONFIG_FILE}"
  fi
}

generate_sitemap() {
  section "Sitemap Generation"
  
  init_seo_config
  
  local base_url="https://melbourneguitarschool.com.au"
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    base_url="$(grep -o 'NEXT_PUBLIC_SITE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || echo "${base_url}")"
  fi
  
  local count=0
  > "${SITEMAP_FILE}"
  
  cat > "${SITEMAP_FILE}" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
EOF
  
  while IFS= read -r path; do
    local enabled
    enabled="$(grep -A5 "\"${path}\"" "${SEO_CONFIG_FILE}" 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[a-z]*' | sed 's/.*: *//' || echo "true")"
    
    if [[ "${enabled}" == "true" ]]; then
      local priority
      priority="$(grep -A5 "\"${path}\"" "${SEO_CONFIG_FILE}" 2>/dev/null | grep -o '"priority"[[:space:]]*:[[:space:]]*[0-9.]*' | sed 's/.*: *//' || echo "0.5")"
      local freq
      freq="$(grep -A5 "\"${path}\"" "${SEO_CONFIG_FILE}" 2>/dev/null | grep -o '"changeFrequency"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || echo "monthly")"
      
      local url_path="${path}"
      [[ "${url_path}" == "/" ]] && url_path=""
      
      cat >> "${SITEMAP_FILE}" << EOF
  <url>
    <loc>${base_url}${url_path}</loc>
    <lastmod>$(date +%Y-%m-%d)</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>
EOF
      ((count++))
    fi
  done < <(grep -o '"/[^"]*"[[:space:]]*:' "${SEO_CONFIG_FILE}" 2>/dev/null | sed 's/"//g; s/:$//' | sort -u)
  
  echo "</urlset>" >> "${SITEMAP_FILE}"
  
  log_info "Generated sitemap.xml with ${count} pages"
}

generate_robots_txt() {
  section "Robots.txt Generation"
  
  init_seo_config
  
  local base_url="https://melbourneguitarschool.com.au"
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    base_url="$(grep -o 'NEXT_PUBLIC_SITE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || echo "${base_url}")"
  fi
  
  cat > "${ROBOTS_FILE}" << EOF
# Robots.txt for Melbourne Guitar School
# Generated: $(date -Iseconds)

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /student/

Sitemap: ${base_url}/sitemap.xml
EOF
  
  log_info "Generated robots.txt"
}

# =============================================================================
# System Maintenance
# =============================================================================

clean_build_cache() {
  section "Clean Build Cache"
  
  local cleaned=0
  
  # Clean .next cache
  if [[ -d "${REPO_ROOT}/.next" ]]; then
    log_info "Removing .next cache..."
    rm -rf "${REPO_ROOT}/.next"
    ((cleaned++))
  fi
  
  # Clean node_modules/.cache
  if [[ -d "${REPO_ROOT}/node_modules/.cache" ]]; then
    log_info "Removing node_modules/.cache..."
    rm -rf "${REPO_ROOT}/node_modules/.cache"
    ((cleaned++))
  fi
  
  # Clean npm cache if needed
  if command -v npm >/dev/null 2>&1; then
    log_info "Verifying npm cache..."
    npm cache verify 2>/dev/null || true
  fi
  
  log_info "Build cache cleaned (${cleaned} items)"
}

check_database_health() {
  section "Database Health Check"
  
  if [[ ! -f "${SHARED_DIR}/.env" ]]; then
    log_error "Shared .env not found"
    return 1
  fi
  
  local database_url
  database_url="$(grep -o 'DATABASE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || true)"
  
  if [[ -z "${database_url}" ]]; then
    log_error "DATABASE_URL not found"
    return 1
  fi
  
  # Parse connection
  local db_host db_port db_name
  db_host="$(echo "${database_url}" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\1|p')"
  db_port="$(echo "${database_url}" | sed -n 's|.*@\([^:]*\):\([0-9]*\)/.*|\2|p')"
  db_name="$(echo "${database_url}" | sed -n 's|.*/\([^?]*\).*|\1|p')"
  
  db_port="${db_port:-3306}"
  
  if command -v mysql >/dev/null 2>&1; then
    if mysql -h "${db_host}" -P "${db_port}" -e "SELECT 1" "${db_name}" >/dev/null 2>&1; then
      log_info "Database connection: OK"
    else
      log_error "Database connection: FAILED"
      return 1
    fi
  else
    log_warn "mysql client not installed, skipping connection test"
  fi
  
  log_info "Database health check complete"
}

# =============================================================================
# TUI Menus
# =============================================================================

print_btop_main_menu() {
  tui_clear_screen
  
  local cpu_usage mem_usage disk_usage uptime proc_count
  cpu_usage=$(get_cpu_usage)
  mem_usage=$(get_memory_usage)
  disk_usage=$(get_disk_usage "/")
  uptime=$(get_uptime)
  proc_count=$(get_process_count)
  
  local width="${MAINTENANCE_TUI_PANEL_WIDTH}"
  local inner_width=$((width - 2))
  local i
  
  # Header
  printf "${BTOP_FG}%s" "${BOX_TL}"
  for ((i=0; i<inner_width; i++)); do printf "${BTOP_FG}%s" "${BOX_H}"; done
  printf "${BTOP_FG}%s\n" "${BOX_TR}"
  
  printf "${BTOP_FG}%s" "${BOX_V}"
  printf "%*s%s%s%*s${BTOP_FG}%s\n" $(( (inner_width - 29) / 2 )) "" "LessonFlow Maintenance" "" $(( inner_width - 29 - (inner_width - 29) / 2 - 1 )) "" "${BOX_V}"
  
  printf "${BTOP_FG}%s" "${BOX_VR}"
  for ((i=0; i<inner_width; i++)); do printf "${BTOP_FG}%s" "${BOX_H}"; done
  printf "${BTOP_FG}%s\n" "${BOX_VL}"
  
  # Stats row
  printf "${BTOP_FG}%s" "${BOX_V}"
  printf "${BTOP_FG_DIM}CPU${NC} "
  local cpu_bar; cpu_bar=$(draw_mini_bar "${cpu_usage}" 12)
  printf "${BTOP_GREEN}%s${NC} %3d%% " "${cpu_bar}" "${cpu_usage}"
  printf "${BTOP_FG_DIM}MEM${NC} "
  local mem_bar; mem_bar=$(draw_mini_bar "${mem_usage}" 12)
  printf "${BTOP_BLUE}%s${NC} %3d%% " "${mem_bar}" "${mem_usage}"
  printf "${BTOP_FG_DIM}DISK${NC} "
  local disk_bar; disk_bar=$(draw_mini_bar "${disk_usage}" 12)
  printf "${BTOP_ORANGE}%s${NC} %3d%% " "${disk_bar}" "${disk_usage}"
  printf "${BTOP_FG_DIM}Uptime:${NC} %s" "${uptime}"
  printf "${BTOP_FG}%s\n" "${BOX_V}"
  
  printf "${BTOP_FG}%s" "${BOX_BL}"
  for ((i=0; i<inner_width; i++)); do printf "${BTOP_FG}%s" "${BOX_H}"; done
  printf "${BTOP_FG}%s\n" "${BOX_BR}"
  echo ""
  
  # Status bar
  printf "${BTOP_FG}%s" "${BOX_VR}"
  for ((i=0; i<inner_width; i++)); do printf "${BTOP_FG}%s" "${BOX_H}"; done
  printf "${BTOP_FG}%s\n" "${BOX_VL}"
  
  printf "${BTOP_FG}%s" "${BOX_V}"
  printf " ${BTOP_FG_DIM}Backup:${NC} ${BTOP_GREEN}%s${BTOP_FG}  " "${BACKUP_FREQUENCY}"
  printf "${BTOP_FG_DIM}Cloud:${NC} ${BTOP_BLUE}%s${BTOP_FG}  " "${BACKUP_CLOUD_PROVIDER}"
  printf "${BTOP_FG_DIM}Last:${NC} ${BTOP_YELLOW}%s${BTOP_FG}  " "${LAST_BACKUP_DATE:-Never}"
  printf "${BTOP_FG}%s\n" "${BOX_V}"
  
  printf "${BTOP_FG}%s" "${BOX_BL}"
  for ((i=0; i<inner_width; i++)); do printf "${BTOP_FG}%s" "${BOX_H}"; done
  printf "${BTOP_FG}%s\n" "${BOX_BR}"
  echo ""
  
  # Backup Section
  draw_btop_separator "${width}" " BACKUP "
  draw_btop_menu_item "1" "Run Manual Backup" "Create backup now" "Ready" "${width}"
  draw_btop_menu_item "2" "Backup Components" "Configure what's included" "Edit" "${width}"
  draw_btop_menu_item "3" "Cloud Settings" "Google Drive / Koofr" "${BACKUP_CLOUD_PROVIDER}" "${width}"
  draw_btop_menu_item "4" "Backup Schedule" "Frequency: ${BACKUP_FREQUENCY}" "${BACKUP_FREQUENCY}" "${width}"
  echo ""
  
  # SEO Section
  draw_btop_separator "${width}" " SITEMAP & SEO "
  draw_btop_menu_item "5" "Generate Sitemap" "Create sitemap.xml" "Ready" "${width}"
  draw_btop_menu_item "6" "Generate Robots.txt" "Create robots.txt" "Ready" "${width}"
  echo ""
  
  # System Section
  draw_btop_separator "${width}" " SYSTEM "
  draw_btop_menu_item "7" "Clean Build Cache" "Remove .next, node cache" "Ready" "${width}"
  draw_btop_menu_item "8" "Database Health" "Test DB connection" "Check" "${width}"
  echo ""
  
  # Git Section
  draw_btop_separator "${width}" " GIT "
  draw_btop_menu_item "9" "Git Pull" "Update from remote" "Update" "${width}"
  echo ""
  
  # Footer
  draw_btop_separator "${width}"
  printf "${BTOP_FG}%s" "${BOX_V}"
  printf " ${BTOP_YELLOW}S${BTOP_FG}elect  ${BTOP_YELLOW}Q${BTOP_FG}uit"
  printf "${BTOP_FG}%s\n" "${BOX_V}"
  printf "${BTOP_FG}%s" "${BOX_BL}"
  for ((i=0; i<inner_width; i++)); do printf "${BTOP_FG}%s" "${BOX_H}"; done
  printf "${BTOP_FG}%s\n" "${BOX_BR}"
  echo ""
}

print_backup_components_tui() {
  while true; do
    tui_clear_screen
    print_box_banner "Backup Components"
    echo ""
    echo -e "${DIM}Configure what to include in backups (all ON by default)${NC}"
    echo ""
    print_tui_panel_rule "${MAINTENANCE_TUI_PANEL_WIDTH}"
    echo ""
    echo -e "${BOLD}Component Toggles${NC}"
    print_tui_panel_rule "${MAINTENANCE_TUI_PANEL_WIDTH}"
    echo ""
    printf "  %b[1]%b SQL Database         %s\n" "${BTOP_YELLOW}" "${NC}" "$(bool_word "${BACKUP_INCLUDE_SQL}")"
    printf "  %b[2]%b Webapp (current)      %s\n" "${BTOP_YELLOW}" "${NC}" "$(bool_word "${BACKUP_INCLUDE_WEBAPP}")"
    printf "  %b[3]%b .env file            %s\n" "${BTOP_YELLOW}" "${NC}" "$(bool_word "${BACKUP_INCLUDE_ENV}")"
    printf "  %b[4]%b Learning Materials    %s\n" "${BTOP_YELLOW}" "${NC}" "$(bool_word "${BACKUP_INCLUDE_LEARNING_MATERIALS}")"
    printf "  %b[5]%b SEO Config           %s\n" "${BTOP_YELLOW}" "${NC}" "$(bool_word "${BACKUP_INCLUDE_SEO_CONFIG}")"
    printf "  %b[6]%b Clean Old Backups    %s\n" "${BTOP_YELLOW}" "${NC}" "$(bool_word "${BACKUP_CLEAN_OLD}")"
    echo ""
    print_tui_panel_rule "${MAINTENANCE_TUI_PANEL_WIDTH}"
    echo ""
    echo "  [S] Save & Back"
    echo "  [Q] Cancel"
    echo ""
    
    read -r -p "Select option: " choice
    
    case "${choice}" in
      1) BACKUP_INCLUDE_SQL="$(toggle_bool "${BACKUP_INCLUDE_SQL}")" ;;
      2) BACKUP_INCLUDE_WEBAPP="$(toggle_bool "${BACKUP_INCLUDE_WEBAPP}")" ;;
      3) BACKUP_INCLUDE_ENV="$(toggle_bool "${BACKUP_INCLUDE_ENV}")" ;;
      4) BACKUP_INCLUDE_LEARNING_MATERIALS="$(toggle_bool "${BACKUP_INCLUDE_LEARNING_MATERIALS}")" ;;
      5) BACKUP_INCLUDE_SEO_CONFIG="$(toggle_bool "${BACKUP_INCLUDE_SEO_CONFIG}")" ;;
      6) BACKUP_CLEAN_OLD="$(toggle_bool "${BACKUP_CLEAN_OLD}")" ;;
      s|S)
        save_maintenance_settings
        log_info "Settings saved"
        return 0
        ;;
      q|Q) return 0 ;;
    esac
  done
}

run_interactive_maintenance() {
  local choice=""
  
  init_paths
  init_seo_config
  load_backup_config
  create_backup_directory
  
  while true; do
    print_btop_main_menu
    read -r -p "Select option [1-9, S, Q]: " choice
    
    case "${choice}" in
      1)
        if prompt_yes_no "Run backup now?" "y"; then
          run_backup
          read -r -n 1 -s -p "Press any key to continue..."
        fi
        ;;
      2)
        print_backup_components_tui
        ;;
      3)
        section "Cloud Backup Settings"
        echo "Current: ${BACKUP_CLOUD_PROVIDER}"
        echo ""
        echo "  [1] None (local only)"
        echo "  [2] Google Drive"
        echo "  [3] Koofr"
        echo ""
        read -r -p "Select: " cloud_choice
        case "${cloud_choice}" in
          1) BACKUP_CLOUD_PROVIDER="none" ;;
          2) BACKUP_CLOUD_PROVIDER="google-drive" ;;
          3) BACKUP_CLOUD_PROVIDER="koofr" ;;
        esac
        save_maintenance_settings
        ;;
      4)
        section "Backup Schedule"
        echo "Current: ${BACKUP_FREQUENCY}"
        echo ""
        echo "  [1] Hourly"
        echo "  [2] Daily"
        echo "  [3] Weekly"
        echo ""
        read -r -p "Select: " freq_choice
        case "${freq_choice}" in
          1) BACKUP_FREQUENCY="hourly" ;;
          2) BACKUP_FREQUENCY="daily" ;;
          3) BACKUP_FREQUENCY="weekly" ;;
        esac
        save_maintenance_settings
        ;;
      5) generate_sitemap ;;
      6) generate_robots_txt ;;
      7) clean_build_cache ;;
      8) check_database_health ;;
      9)
        if prompt_yes_no "Pull latest from git?" "y"; then
          run_git_pull
          read -r -n 1 -s -p "Press any key to continue..."
        fi
        ;;
      q|Q)
        log_info "Exiting. Settings saved."
        exit 0
        ;;
    esac
  done
}

# =============================================================================
# Main
# =============================================================================

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --interactive) INTERACTIVE=true ;;
      --skip-pull) SKIP_PULL=true ;;
      --branch) BRANCH="$2"; shift ;;
      --remote) REMOTE_NAME="$2"; shift ;;
      --allow-dirty) ALLOW_DIRTY=true ;;
      --no-color) NO_COLOR=true ;;
      --no-spinner) NO_SPINNER=true ;;
      --help|-h) show_usage; exit 0 ;;
      *) ;;
    esac
    shift
  done
}

main() {
  parse_args "$@"
  init_paths
  detect_tty_capabilities
  
  if [[ "${SKIP_PULL}" != true ]]; then
    run_git_pull || true
  fi
  
  if [[ "${INTERACTIVE}" == true || "${IS_TTY}" == true ]]; then
    run_interactive_maintenance
  else
    show_usage
  fi
}

main "$@"
