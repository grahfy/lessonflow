#!/bin/bash
# Maintenance Script for Melbourne Guitar School


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

# Resolve paths - works from any directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_SCRIPT="${SCRIPT_DIR}/update.sh"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"
REPO_ROOT=""
ORIGINAL_ARGS=( "$@" )
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
MAINTENANCE_TUI_PANEL_WIDTH=110
MAINTENANCE_TUI_PANEL_WIDTH_MAX=120

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

# btop colors - enhanced gradient palette
BTOP_FG='\033[38;5;250m'
BTOP_FG_DIM='\033[38;5;245m'
BTOP_CYAN='\033[38;5;45m'
BTOP_CYAN_BRIGHT='\033[38;5;51m'
BTOP_GREEN='\033[38;5;82m'
BTOP_GREEN_DIM='\033[38;5;77m'
BTOP_BLUE='\033[38;5;33m'
BTOP_BLUE_DIM='\033[38;5;31m'
BTOP_ORANGE='\033[38;5;208m'
BTOP_ORANGE_DIM='\033[38;5;202m'
BTOP_PURPLE='\033[38;5;141m'
BTOP_PURPLE_DIM='\033[38;5;135m'
BTOP_YELLOW='\033[1;33m'
BTOP_YELLOW_DIM='\033[38;5;178m'
BTOP_RED='\033[38;5;196m'
BTOP_RED_DIM='\033[38;5;160m'

# btop gradient colors for usage bars
BTOP_GRAD_0='\033[38;5;82m'   # green - low
BTOP_GRAD_1='\033[38;5;119m'  # light green
BTOP_GRAD_2='\033[38;5;77m'  # green-yellow
BTOP_GRAD_3='\033[38;5;178m' # yellow
BTOP_GRAD_4='\033[38;5;208m' # orange
BTOP_GRAD_5='\033[38;5;196m' # red

# Box drawing
BOX_TL='┌'
BOX_TR='┐'
BOX_BL='└'
BOX_BR='┘'
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

tui_pad_text() {
  local text="$1" width="$2"
  local visible_len=${#text}
  local pad_len=$(( width - visible_len ))
  printf "%s" "${text}"
  if [[ $pad_len -gt 0 ]]; then
    printf "%*s" "$pad_len" ""
  fi
}

# =============================================================================
# btop Stats
# =============================================================================

get_cpu_usage() {
  [[ -f /proc/stat ]] || { echo "0"; return; }
  local cpu_line
  cpu_line=$(head -1 /proc/stat)
  local user nice system idle iowait irq softirq steal
  # Parse the line, skipping the first 'cpu' label
  read -r _ user nice system idle iowait irq softirq steal _ <<< "${cpu_line}"
  
  # Ensure they are numeric
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

get_load_average() { awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0.00"; }
get_process_count() { grep -c '^proc' /proc/stat 2>/dev/null || echo "1"; }

get_cpu_color() {
  local p="$1"
  if (( p < 30 )); then echo "${BTOP_GRAD_0}";
  elif (( p < 50 )); then echo "${BTOP_GRAD_1}";
  elif (( p < 70 )); then echo "${BTOP_GRAD_2}";
  elif (( p < 85 )); then echo "${BTOP_GRAD_3}";
  elif (( p < 95 )); then echo "${BTOP_ORANGE}";
  else echo "${BTOP_RED}"; fi;
}

get_mem_color() {
  local p="$1"
  if (( p < 50 )); then echo "${BTOP_BLUE}";
  elif (( p < 70 )); then echo "${BTOP_CYAN}";
  elif (( p < 85 )); then echo "${BTOP_YELLOW}";
  else echo "${BTOP_ORANGE}"; fi;
}

get_disk_color() {
  local p="$1"
  if (( p < 60 )); then echo "${BTOP_GREEN}";
  elif (( p < 75 )); then echo "${BTOP_YELLOW}";
  elif (( p < 90 )); then echo "${BTOP_ORANGE}";
  else echo "${BTOP_RED}"; fi;
}

draw_mini_bar() {
  local p="$1" w="${2:-12}"
  ((p = p < 0 ? 0 : p > 100 ? 100 : p))
  local filled empty bar i color
  filled=$(( (p * w) / 100 ))
  empty=$(( w - filled ))
  bar=""
  color=$(get_cpu_color "$p")
  for ((i=0; i<filled; i++)); do bar+="${color}${BLOCK_FULL}"; done
  for ((i=0; i<empty; i++)); do bar+="${BTOP_FG_DIM}${BLOCK_EMPTY}"; done
  printf "${bar}%s${NC}" ""
}

draw_cpu_graph() {
  local cpu="$1" width="${2:-20}"
  local bar
  bar=$(draw_mini_bar "$cpu" "$width")
  local color
  color=$(get_cpu_color "$cpu")
  printf "${color}%s${NC} %3d%%" "${bar}" "$cpu"
}

draw_mem_graph() {
  local mem="$1" width="${2:-20}"
  local bar
  bar=$(draw_mini_bar "$mem" "$width")
  local color
  color=$(get_mem_color "$mem")
  printf "${color}%s${NC} %3d%%" "${bar}" "$mem"
}

draw_disk_graph() {
  local disk="$1" width="${2:-20}"
  local bar
  bar=$(draw_mini_bar "$disk" "$width")
  local color
  color=$(get_disk_color "$disk")
  printf "${color}%s${NC} %3d%%" "${bar}" "$disk"
}

get_hostname() { hostname 2>/dev/null || echo "unknown"; }
get_kernel() { uname -r 2>/dev/null | cut -d- -f1 || echo "unknown"; }
get_uptime_days() {
  local uptime_secs=""
  [[ -f /proc/uptime ]] && uptime_secs=$(awk '{print int($1)}' /proc/uptime)
  [[ -z "${uptime_secs}" || "${uptime_secs}" -eq 0 ]] && { echo "0"; return; }
  echo $((uptime_secs / 86400))
}

print_btop_header() {
  local width="$1"
  local ts hn kern rule
  ts=$(date "+%Y-%m-%d %H:%M:%S")
  hn=$(get_hostname)
  kern=$(get_kernel)
  
  # Create horizontal rule
  printf -v rule "%*s" "$((width - 2))" ""
  rule="${rule// /─}"
  
  # Row 1: "⬡ Melbourne Guitar School"
  local title="⬡ Melbourne Guitar School"
  local title_len=25
  local pad1_len=$((width - 2 - 2 - title_len))
  local pad1=""
  [[ $pad1_len -gt 0 ]] && printf -v pad1 "%*s" "$pad1_len" ""
  
  # Row 2: "Maintenance Console"
  local subtitle="Maintenance Console"
  local subtitle_len=19
  local pad2_len=$((width - 2 - 1 - subtitle_len))
  local pad2=""
  [[ $pad2_len -gt 0 ]] && printf -v pad2 "%*s" "$pad2_len" ""

  # Row 3: Host & Kernel
  local h_label="Host:"
  local k_label="Kernel:"
  local host_kern_visible=$((1 + 5 + 1 + ${#hn} + 2 + 7 + 1 + ${#kern}))
  local pad3_len=$((width - 2 - host_kern_visible))
  local pad3=""
  [[ $pad3_len -gt 0 ]] && printf -v pad3 "%*s" "$pad3_len" ""

  # Row 4: Time
  local t_label="Time:"
  local time_visible=$((1 + 5 + 1 + ${#ts}))
  local pad4_len=$((width - 2 - time_visible))
  local pad4=""
  [[ $pad4_len -gt 0 ]] && printf -v pad4 "%*s" "$pad4_len" ""

  # Print it
  echo -e "${BOLD}${CYAN}╭${rule}╮${NC}"
  echo -e "${BOLD}${CYAN}│${NC}  ${BOLD}${title}${NC}${pad1}${BOLD}${CYAN}│${NC}"
  echo -e "${BOLD}${CYAN}│${NC} ${BOLD}${subtitle}${NC}${pad2}${BOLD}${CYAN}│${NC}"
  echo -e "${BOLD}${CYAN}├${rule}┤${NC}"
  echo -e "${BOLD}${CYAN}│${NC} ${DIM}${h_label}${NC} ${BTOP_CYAN_BRIGHT}${hn}${NC}  ${DIM}${k_label}${NC} ${BTOP_YELLOW}${kern}${NC}${pad3}${BOLD}${CYAN}│${NC}"
  echo -e "${BOLD}${CYAN}│${NC} ${DIM}${t_label}${NC} ${BTOP_GREEN}${ts}${NC}${pad4}${BOLD}${CYAN}│${NC}"
  echo -e "${BOLD}${CYAN}╰${rule}╯${NC}"
}

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
git_worktree_dirty() { [[ -n "$(git -C "${REPO_ROOT}" status --porcelain 2>/dev/null || true)" ]]; }

get_current_commit() { git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "unknown"; }
get_current_commit_full() { git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo "unknown"; }
get_last_commit_msg() { git -C "${REPO_ROOT}" log -1 --format=%s 2>/dev/null || echo "none"; }
get_remote_commit() {
  [[ -n "${BRANCH}" ]] || BRANCH="$(current_branch_name)"
  git -C "${REPO_ROOT}" rev-parse --short "${REMOTE_NAME}/${BRANCH}" 2>/dev/null || echo "unknown"
}
has_remote_update() {
  local local_commit remote_commit
  local_commit=$(get_current_commit)
  remote_commit=$(get_remote_commit)
  [[ "${local_commit}" != "${remote_commit}" ]]
}

should_use_sudo_for_deploy() {
  if [[ "${FORCE_NO_SUDO_DEPLOY}" == true ]]; then return 1; fi
  if [[ "${FORCE_SUDO_DEPLOY}" == true ]]; then return 0; fi
  if [[ ${EUID} -eq 0 ]]; then return 1; fi
  [[ -w "${DEPLOY_DIR}" ]] && return 1 || return 0
}

ensure_sudo_for_deploy_ready() {
  if [[ "${SUDO_DEPLOY_AUTH_READY}" == true ]]; then return 0; fi
  if sudo -n true 2>/dev/null; then SUDO_DEPLOY_AUTH_READY=true; return 0; fi
  log_info "Requesting sudo authentication..."
  sudo true && SUDO_DEPLOY_AUTH_READY=true
}

run_privileged_cmd() {
  if [[ ${EUID} -eq 0 ]]; then
    "$@"
    return $?
  fi
  if ! should_use_sudo_for_deploy; then
    "$@"
    return $?
  fi
  ensure_sudo_for_deploy_ready
  sudo "$@"
}

update_sudo_mode_label() {
  if [[ "${FORCE_NO_SUDO_DEPLOY}" == true ]]; then
    echo "forced off"
  elif [[ "${FORCE_SUDO_DEPLOY}" == true ]]; then
    echo "forced on"
  else
    echo "auto"
  fi
}

cycle_sudo_mode() {
  if [[ "${FORCE_NO_SUDO_DEPLOY}" == true ]]; then
    FORCE_NO_SUDO_DEPLOY=false
    FORCE_SUDO_DEPLOY=false
  elif [[ "${FORCE_SUDO_DEPLOY}" == true ]]; then
    FORCE_SUDO_DEPLOY=false
    FORCE_NO_SUDO_DEPLOY=true
  else
    FORCE_SUDO_DEPLOY=true
    FORCE_NO_SUDO_DEPLOY=false
  fi
}

run_git_pull() {
  section "Git Update"
  [[ -z "${BRANCH}" ]] && BRANCH="$(current_branch_name)"
  [[ "${ALLOW_DIRTY}" != true ]] && git_worktree_dirty && { log_warn "Tree dirty. Use --allow-dirty"; return 1; }
  log_info "Updating ${BRANCH} from ${REMOTE_NAME}..."
  run_step "Git Fetch" git -C "${REPO_ROOT}" fetch "${REMOTE_NAME}" "${BRANCH}" || return 1
  run_step "Git Pull" git -C "${REPO_ROOT}" pull --ff-only "${REMOTE_NAME}" "${BRANCH}" || return 1
  log_info "Updated to $(get_current_commit)"
}

run_update_script() {
  section "Run Update + Deploy"
  if [[ -x "${UPDATE_SCRIPT}" ]]; then
    if should_use_sudo_for_deploy; then
      ensure_sudo_for_deploy_ready
      sudo "${UPDATE_SCRIPT}" --interactive --branch "${BRANCH:-main}" --remote "${REMOTE_NAME}"
    else
      "${UPDATE_SCRIPT}" --interactive --branch "${BRANCH:-main}" --remote "${REMOTE_NAME}"
    fi
  else
    log_error "Update script not found: ${UPDATE_SCRIPT}"
    return 1
  fi
}

run_deploy_script() {
  section "Run Deploy"
  if [[ -x "${DEPLOY_SCRIPT}" ]]; then
    if should_use_sudo_for_deploy; then
      ensure_sudo_for_deploy_ready
      sudo "${DEPLOY_SCRIPT}" --interactive
    else
      "${DEPLOY_SCRIPT}" --interactive
    fi
  else
    log_error "Deploy script not found: ${DEPLOY_SCRIPT}"
    return 1
  fi
}

# =============================================================================
# Persistence
# =============================================================================

load_maintenance_settings() {
if [[ -f "${MAINTENANCE_CONFIG_FILE}" ]]; then
BACKUP_FREQUENCY="$(grep '^BACKUP_FREQUENCY=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "daily")"
    BACKUP_CLOUD_PROVIDER="$(grep '^BACKUP_CLOUD_PROVIDER=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "none")"
    BACKUP_CLOUD_FOLDER="$(grep '^BACKUP_CLOUD_FOLDER=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "melbourne-guitar-school-backups")"
BACKUP_INCLUDE_SQL="$(grep '^BACKUP_INCLUDE_SQL=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
BACKUP_INCLUDE_WEBAPP="$(grep '^BACKUP_INCLUDE_WEBAPP=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
BACKUP_INCLUDE_ENV="$(grep '^BACKUP_INCLUDE_ENV=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
BACKUP_INCLUDE_LEARNING_MATERIALS="$(grep '^BACKUP_INCLUDE_LEARNING_MATERIALS=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
BACKUP_INCLUDE_SEO_CONFIG="$(grep '^BACKUP_INCLUDE_SEO_CONFIG=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
BACKUP_CLEAN_OLD="$(grep '^BACKUP_CLEAN_OLD=' "${MAINTENANCE_CONFIG_FILE}" | cut -d= -f2 || echo "true")"
  fi
  
  # Always load latest credentials from .env
  GDRIVE_CLIENT_ID=$(get_env_val "GDRIVE_CLIENT_ID")
  GDRIVE_CLIENT_SECRET=$(get_env_val "GDRIVE_CLIENT_SECRET")
  GDRIVE_REFRESH_TOKEN=$(get_env_val "GDRIVE_REFRESH_TOKEN")
  KOOFR_WEBDAV_URL=$(get_env_val "KOOFR_WEBDAV_URL")
  KOOFR_USERNAME=$(get_env_val "KOOFR_USERNAME")
  KOOFR_PASSWORD=$(get_env_val "KOOFR_PASSWORD")
  
  [[ -z "${BACKUP_CLOUD_FOLDER}" ]] && BACKUP_CLOUD_FOLDER=$(get_env_val "BACKUP_CLOUD_FOLDER") || true
  [[ -z "${BACKUP_CLOUD_FOLDER}" ]] && BACKUP_CLOUD_FOLDER="melbourne-guitar-school-backups" || true
  return 0
}

save_maintenance_settings() {
cat > "${MAINTENANCE_CONFIG_FILE}" << EOF
BACKUP_FREQUENCY=${BACKUP_FREQUENCY}
BACKUP_CLOUD_PROVIDER=${BACKUP_CLOUD_PROVIDER}
BACKUP_CLOUD_FOLDER=${BACKUP_CLOUD_FOLDER}
BACKUP_INCLUDE_SQL=${BACKUP_INCLUDE_SQL}
BACKUP_INCLUDE_WEBAPP=${BACKUP_INCLUDE_WEBAPP}
BACKUP_INCLUDE_ENV=${BACKUP_INCLUDE_ENV}
BACKUP_INCLUDE_LEARNING_MATERIALS=${BACKUP_INCLUDE_LEARNING_MATERIALS}
BACKUP_INCLUDE_SEO_CONFIG=${BACKUP_INCLUDE_SEO_CONFIG}
BACKUP_CLEAN_OLD=${BACKUP_CLEAN_OLD}
EOF
}

# =============================================================================
# DB & Backups
# =============================================================================

get_env_val() {
  local key="$1"
  local file="${SHARED_DIR}/.env"
  # Fallback to local .env if shared doesn't exist
  if [[ ! -f "${file}" ]]; then
    file="${REPO_ROOT}/.env"
  fi
  
  if [[ -f "${file}" ]]; then
    if [[ -r "${file}" ]]; then
      grep "^${key}=" "${file}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
    else
      # If not readable, try with sudo if we have/can get it
      if ensure_sudo_for_deploy_ready >/dev/null 2>&1; then
        sudo grep "^${key}=" "${file}" | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
      fi
    fi
  fi
  return 0
}

get_db_creds() {
  local du; du=$(get_env_val "DATABASE_URL")
  [[ -z "${du:-}" ]] && return 1
  DB_U=$(echo "${du}" | sed -n 's|.*://\([^:]*\):.*@.*|\1|p')
  DB_P=$(echo "${du}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
  DB_H=$(echo "${du}" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  DB_PORT=$(echo "${du}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_NAME=$(echo "${du}" | sed -n 's|.*/\([^?]*\).*|\1|p')
  [[ -n "${DB_U}" && -n "${DB_NAME}" ]] || return 1
}

create_database_dump() {
  local out="$1"
  get_db_creds || return 1
  MYSQL_PWD="${DB_P}" mysqldump -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" --single-transaction --quick "${DB_NAME}" > "${out}" 2>/dev/null
}

restore_database() {
  local sf="$1"
  get_db_creds || return 1
  if command -v mysql >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mysql -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" < "${sf}" 2>/dev/null
  elif command -v mariadb >/dev/null 2>&1; then
    MYSQL_PWD="${DB_P}" mariadb -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" "${DB_NAME}" < "${sf}" 2>/dev/null
  else
    return 1
  fi
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
  local ts="$1" bn="backup-${ts}" td af
  td="$(mktemp -d)"
  af="${BACKUP_DIR}/${bn}.tar.xz"
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
    for provider in ${BACKUP_CLOUD_PROVIDER}; do
      case "${provider}" in
        google-drive) upload_to_google_drive "${af}" ;;
        koofr) upload_to_koofr "${af}" ;;
      esac
    done
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
# SEO
# =============================================================================

init_seo_config() {
  [[ -f "${SEO_CONFIG_FILE}" ]] && return
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
}

generate_sitemap() {
  section "Sitemap Generation"
  init_seo_config
  local bu="https://melbourneguitarschool.com.au"
  [[ -f "${SHARED_DIR}/.env" ]] && bu="$(grep -o 'NEXT_PUBLIC_SITE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || echo "${bu}")"
  local count=0
  cat > "${SITEMAP_FILE}" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
EOF
  while IFS= read -r path; do
    local e="$(grep -A5 "\"${path}\"" "${SEO_CONFIG_FILE}" 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[a-z]*' | sed 's/.*: *//' || echo "true")"
    [[ "${e}" == "true" ]] || continue
    local p="$(grep -A5 "\"${path}\"" "${SEO_CONFIG_FILE}" 2>/dev/null | grep -o '"priority"[[:space:]]*:[[:space:]]*[0-9.]*' | sed 's/.*: *//' || echo "0.5")"
    local f="$(grep -A5 "\"${path}\"" "${SEO_CONFIG_FILE}" 2>/dev/null | grep -o '"changeFrequency"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)"/\1/' || echo "monthly")"
    local up="${path}"; [[ "${up}" == "/" ]] && up=""
    cat >> "${SITEMAP_FILE}" << EOF
  <url>
    <loc>${bu}${up}</loc>
    <lastmod>$(date +%Y-%m-%d)</lastmod>
    <changefreq>${f}</changefreq>
    <priority>${p}</priority>
  </url>
EOF
    ((count++))
  done < <(grep -o '"/[^"]*"[[:space:]]*:' "${SEO_CONFIG_FILE}" 2>/dev/null | sed 's/"//g; s/:$//' | sort -u)
  echo "</urlset>" >> "${SITEMAP_FILE}"
  log_info "Generated ${count} pages"
}

generate_robots_txt() {
  section "Robots.txt"
  init_seo_config
  local bu="https://melbourneguitarschool.com.au"
  [[ -f "${SHARED_DIR}/.env" ]] && bu="$(grep -o 'NEXT_PUBLIC_SITE_URL[[:space:]]*=[[:space:]]*"[^"]*"' "${SHARED_DIR}/.env" 2>/dev/null | sed 's/.*= *"\([^"]*\)"/\1/' || echo "${bu}")"
  cat > "${ROBOTS_FILE}" << EOF
# Robots.txt for LessonFlow
# Generated: $(date -Iseconds)
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /student/
Sitemap: ${bu}/sitemap.xml
EOF
  log_info "Generated robots.txt"
}

# =============================================================================
# TUI Visuals
# =============================================================================

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

status_chip() {
  local label="$1"
  local state="$2"
  local color="${DIM}"
  if [[ "${state}" == "ON" || "${state}" == "Ready" || "${state}" == "enabled" || "${state}" == "migrate deploy" || "${state}" == "Run" || "${state}" == "Open" || "${state}" == "Toggle" ]]; then
    color="${GREEN}"
  elif [[ "${state}" == "OFF" || "${state}" == "Skip" || "${state}" == "disabled" || "${state}" == "skip migrations" || "${state}" == "Check" || "${state}" == "Clean" || "${state}" == "Git" ]]; then
    color="${YELLOW}"
  elif [[ "${state}" == *"db-push"* || "${state}" == *"%"* ]]; then
    color="${CYAN}"
  fi
  printf "%b[%s: %s]%b" "${color}" "${label}" "${state}" "${NC}"
}

print_tui_option_pair() {
  local left_key="$1"
  local left_label="$2"
  local left_value="$3"
  local left_desc="$4"
  local right_key="${5:-}"
  local right_label="${6:-}"
  local right_value="${7:-}"
  local right_desc="${8:-}"
  local col_width=$(( (${MAINTENANCE_TUI_PANEL_WIDTH:-110} - 4) / 2 ))
  
  local left_cell; left_cell="$(build_tui_option_cell_text "${left_key}" "${left_label}" "${left_value}" "${col_width}")"
  local left_desc_text; left_desc_text="$(tui_truncate_text "${left_desc}" "${col_width}")"
  
  local right_cell=""
  local right_desc_text=""
  if [[ -n "${right_key}" ]]; then
    right_cell="$(build_tui_option_cell_text "${right_key}" "${right_label}" "${right_value}" "${col_width}")"
    right_desc_text="$(tui_truncate_text "${right_desc}" "${col_width}")"
  fi
  
  printf "  %b" "${BOLD}${CYAN}"
  tui_pad_text "${left_cell}" "${col_width}"
  printf "%b  %b" "${NC}" "${BOLD}${GREEN}"
  tui_pad_text "${right_cell}" "${col_width}"
  printf "%b\n" "${NC}"
  
  printf "  %b" "${DIM}"
  tui_pad_text "${left_desc_text}" "${col_width}"
  printf "%b  %b" "${NC}" "${DIM}"
  tui_pad_text "${right_desc_text}" "${col_width}"
  printf "%b\n" "${NC}"
}


print_tui_action_pair() {
  local left_key="$1"
  local left_label="$2"
  local right_key="${3:-}"
  local right_label="${4:-}"
  local col_width=$(( (${MAINTENANCE_TUI_PANEL_WIDTH:-110} - 4) / 2 ))
  local left_cell=""
  local right_cell=""
  left_cell="$(tui_truncate_text "${left_key}  ${left_label}" "${col_width}")"
  if [[ -n "${right_key}" ]]; then
    right_cell="$(tui_truncate_text "${right_key}  ${right_label}" "${col_width}")"
  fi
  printf "  %b%-*s%b  %b%-*s%b\n" "${YELLOW}" "${col_width}" "${left_cell}" "${NC}" "${MAGENTA}" "${col_width}" "${right_cell}" "${NC}"
}

print_tui_hint_line() {
  local text="$1"
  local max_width=$(( ${MAINTENANCE_TUI_PANEL_WIDTH:-110} - 2 ))
  local clipped=""
  clipped="$(tui_truncate_text "${text}" "${max_width}")"
  echo -e "  ${DIM}${CYAN}${clipped}${NC}"
}

print_summary_row() {
  local label="$1"
  local value="$2"
  local value_max=$(( ${MAINTENANCE_TUI_PANEL_WIDTH:-110} - 24 ))
  local clipped_value=""
  clipped_value="$(tui_truncate_text "${value}" "${value_max}")"
  printf "  %-18b %b%s%b\n" "${DIM}${label}:${NC}" "${CYAN}" "${clipped_value}" "${NC}"
}

build_tui_option_cell_text() {
  local key="$1"
  local label="$2"
  local value="$3"
  local cell_width="$4"
  local raw="[${key}] ${label}: ${value}"
  tui_truncate_text "${raw}" "${cell_width}"
}

draw_btop_separator() {
  local width="$1" label="${2:-}"
  if [[ -z "${label}" ]]; then
    printf "${BTOP_FG}%s" "${BOX_VR}"; local i; for ((i=0; i<width-2; i++)); do printf "${BOX_H}"; done; printf "${BOX_VL}\n"
  else
    local label_len=${#label}
    local line_len=$(( (width - 2 - label_len - 4) / 2 ))
    printf "${BTOP_FG}%s" "${BOX_VR}"; local i; for ((i=0; i<line_len; i++)); do printf "${BOX_H}"; done; printf " ${BTOP_PURPLE}%s ${BTOP_FG}" "${label}"
    local remaining=$((width - 2 - line_len - label_len - 4)); for ((i=0; i<remaining; i++)); do printf "${BOX_H}"; done; printf "${BOX_VL}\n"
  fi
}

draw_btop_menu_item() {
  local key="$1" label="$2" description="$3" status="$4" width="$5"
  local label_width=28
  local desc_width=$((width - label_width - 35))
  local key_width=4
  printf "${BTOP_FG}%s" "${BOX_V}"; printf " ${BTOP_YELLOW}[${key}]${BTOP_FG} "; printf "${BTOP_CYAN_BRIGHT}%-${label_width}s${BTOP_FG}" "${label}"
  [[ -n "${status}" ]] && printf "${BTOP_GREEN}●${BTOP_FG} %-12s" "${status}" || printf "%-14s" ""
  local desc_trunc="$(tui_truncate_text "${description}" "${desc_width}")"
  printf "${BTOP_FG_DIM}%s" "${desc_trunc}"
  local used=$((3 + 4 + 1 + label_width + 1 + 14 + 1 + ${#desc_trunc}))
  local fill=$((width - used - 1)); local i; for ((i=0; i<fill; i++)); do printf " "; done; printf "${BTOP_FG}%s\n" "${BOX_V}"
}

# =============================================================================
# TUI Pages
# =============================================================================

  restore_backup_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  local src="local" rs=true rw=true re=true rmat=true rse=true rd=true
  local ch
  while true; do
    tui_clear_screen
    print_box_banner "Restore Backup"
    echo -e "${DIM}Source: ${BOLD}${src^^}${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    echo -e "${BOLD}${BLUE}  Available Backups${NC}"
    print_tui_panel_rule "${width}"
    local bks=() i=1
    if [[ "${src}" == "local" ]]; then
      while IFS= read -r b; do [[ -n "$b" ]] || continue; echo -e "  ${CYAN}[$i]${NC} $(basename "${b}") ${DIM}$(du -h "${b}" 2>/dev/null | cut -f1)${NC}"; bks+=("${b}"); ((i++)); done < <(list_local_backups)
    else
      while IFS= read -r b; do [[ -n "$b" ]] || continue; echo -e "  ${CYAN}[$i]${NC} $b"; bks+=("${b}"); ((i++)); done < <(list_cloud_backups)
    fi
    if (( ${#bks[@]} == 0 )); then
      echo -e "  ${YELLOW}No backups found${NC}"
    fi
    echo ""
    print_tui_panel_rule "${width}"
    echo -e "${BOLD}${BLUE}  Restore Options${NC}"
    print_tui_panel_rule "${width}"
    print_tui_option_pair "S" "SQL Database" "$(bool_word "${rs}")" "Restore database from SQL dump." \
      "A" "App Files" "$(bool_word "${rw}")" "Restore webapp files."
    print_tui_option_pair "E" "Env File" "$(bool_word "${re}")" "Restore .env configuration." \
      "M" "Materials" "$(bool_word "${rmat}")" "Restore learning materials."
    print_tui_option_pair "O" "SEO Config" "$(bool_word "${rse}")" "Restore SEO configuration." \
      "D" "Shared Data" "$(bool_word "${rd}")" "Restore shared data files."

    echo ""
    print_tui_panel_rule "${width}"
    print_tui_action_pair "R" "Restore Selected" "G" "Toggle Source"
    print_tui_action_pair "B" "Back to Main"
    print_tui_hint_line "Select: S,A,E,M,O,D | R:Restore, G:Source, B:Back"

    
    read -r -n 1 -s ch
    case "${ch,,}" in
      s) rs=$(toggle_bool "${rs}") ;;
      a) rw=$(toggle_bool "${rw}") ;;
      e) re=$(toggle_bool "${re}") ;;
      m) rmat=$(toggle_bool "${rmat}") ;;
      o) rse=$(toggle_bool "${rse}") ;;
      d) rd=$(toggle_bool "${rd}") ;;
g) [[ "${src}" == "local" ]] && src="cloud" || src="local" ;;

      r)
        echo -e "\n"
        read -r -p "  Enter backup number: " num
        local btr="${bks[$((num-1))]:-}"
        [[ -n "${btr}" ]] || { log_warn "Invalid selection"; sleep 1; continue; }
        if [[ "${src}" == "cloud" ]]; then
          local dp="${BACKUP_DIR}/$(basename "${btr}")"
          case "${BACKUP_CLOUD_PROVIDER}" in
            google-drive) download_from_google_drive "${btr}" "${dp}" ;;
            koofr) download_from_koofr "${btr}" "${dp}" ;;
          esac
          btr="${dp}"
        fi
        restore_backup "${btr}" "${rs}" "${rw}" "${re}" "${rmat}" "${rse}" "${rd}"
        read -r -n 1 -s -p "  Done. Press any key..." ;;
      b) return 0 ;;
      q) exit 0 ;;
    esac
  done
}

print_backup_components_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  local ch
  while true; do
    tui_clear_screen
    print_box_banner "Backup Components"
    echo -e "${DIM}Configure which elements to include in backups.${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    echo -e "${BOLD}${BLUE}  Components to Include${NC}"
    print_tui_panel_rule "${width}"
    print_tui_option_pair "S" "SQL Database" "$(bool_word "${BACKUP_INCLUDE_SQL}")" "Include database dump in backup." \
      "A" "Web App" "$(bool_word "${BACKUP_INCLUDE_WEBAPP}")" "Include Next.js app files."
    print_tui_option_pair "E" "Environment" "$(bool_word "${BACKUP_INCLUDE_ENV}")" "Include .env configuration file." \
      "M" "Materials" "$(bool_word "${BACKUP_INCLUDE_LEARNING_MATERIALS}")" "Include learning materials."
    print_tui_option_pair "O" "SEO Config" "$(bool_word "${BACKUP_INCLUDE_SEO_CONFIG}")" "Include SEO configuration." \
      "C" "Clean Old" "$(bool_word "${BACKUP_CLEAN_OLD}")" "Auto-delete backups older than retention."

    echo ""
    print_tui_panel_rule "${width}"
    print_tui_action_pair "V" "Save Settings" "B" "Back to Main"
    print_tui_hint_line "Toggle: S,A,E,M,O,C | V:Save, B:Back"

    
    read -r -n 1 -s ch
    case "${ch,,}" in
      s) BACKUP_INCLUDE_SQL=$(toggle_bool "${BACKUP_INCLUDE_SQL}") ;;
      a) BACKUP_INCLUDE_WEBAPP=$(toggle_bool "${BACKUP_INCLUDE_WEBAPP}") ;;
      e) BACKUP_INCLUDE_ENV=$(toggle_bool "${BACKUP_INCLUDE_ENV}") ;;
      m) BACKUP_INCLUDE_LEARNING_MATERIALS=$(toggle_bool "${BACKUP_INCLUDE_LEARNING_MATERIALS}") ;;
      o) BACKUP_INCLUDE_SEO_CONFIG=$(toggle_bool "${BACKUP_INCLUDE_SEO_CONFIG}") ;;
      c) BACKUP_CLEAN_OLD=$(toggle_bool "${BACKUP_CLEAN_OLD}") ;;
v) save_maintenance_settings; log_info "Settings saved"; sleep 1; return 0 ;;

      b) return 0 ;;
      q) exit 0 ;;
    esac
  done
}

detect_tty_capabilities() {
  if [[ -t 0 && -t 1 ]]; then
    IS_TTY=true
  fi
  if [[ "${IS_TTY}" == true ]]; then
    auto_size_tui_panel_width
  fi
  if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' DIM='' NC=''
    BTOP_FG='' BTOP_FG_DIM='' BTOP_CYAN='' BTOP_CYAN_BRIGHT='' BTOP_GREEN='' BTOP_GREEN_DIM='' BTOP_BLUE='' BTOP_BLUE_DIM='' BTOP_ORANGE='' BTOP_ORANGE_DIM='' BTOP_PURPLE='' BTOP_PURPLE_DIM='' BTOP_YELLOW='' BTOP_YELLOW_DIM='' BTOP_RED='' BTOP_RED_DIM='' BTOP_GRAD_0='' BTOP_GRAD_1='' BTOP_GRAD_2='' BTOP_GRAD_3='' BTOP_GRAD_4='' BTOP_GRAD_5=''
  fi
}

print_btop_main_menu() {
  tui_clear_screen
  local cpu=$(get_cpu_usage) mem=$(get_memory_usage) disk=$(get_disk_usage "/") up=$(get_uptime)
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  [[ -z "${BRANCH}" ]] && BRANCH="$(current_branch_name 2>/dev/null || echo "main")"
  local commit_hash local_commit remote_commit commit_msg
  commit_hash=$(get_current_commit 2>/dev/null || echo "unknown")
  commit_msg=$(get_last_commit_msg 2>/dev/null || echo "none")
  local now
  now=$(date "+%H:%M:%S")
  
  print_btop_header "$width"
  echo ""
  
  printf "  ${BTOP_FG_DIM}CPU${NC}   "; draw_cpu_graph "$cpu" 18; printf "  ${BTOP_FG_DIM}Uptime:${NC} ${BTOP_PURPLE}%s${NC}\n" "$up"
  printf "  ${BTOP_FG_DIM}MEM${NC}   "; draw_mem_graph "$mem" 18; printf "  ${BTOP_FG_DIM}Procs:${NC} ${BTOP_CYAN}%s${NC}\n" "$(get_process_count)"
  printf "  ${BTOP_FG_DIM}DISK${NC}  "; draw_disk_graph "$disk" 18; printf "  ${BTOP_FG_DIM}Load:${NC} ${BTOP_YELLOW}%s${NC}  ${BTOP_FG_DIM}Live:${NC} ${BTOP_GREEN}%s${NC}\n" "$(get_load_average)" "$now"
  
  echo ""
  print_tui_panel_rule "${width}"
  echo -e "  ${BOLD}${BTOP_CYAN}⬡${NC} ${BOLD}Git Status${NC}"
  print_tui_panel_rule "${width}"
  printf "  ${BTOP_FG_DIM}Branch:${NC} ${BTOP_GREEN}%s${NC}  ${BTOP_FG_DIM}Commit:${NC} ${BTOP_YELLOW}%s${NC}  ${BTOP_FG_DIM}Sudo:${NC} ${BTOP_PURPLE}%s${NC}\n" "${BRANCH}" "${commit_hash}" "$(update_sudo_mode_label)"
  printf "  ${BTOP_FG_DIM}Last:${NC} ${BTOP_FG}%s${NC}\n" "$(tui_truncate_text "${commit_msg}" 60)"
  
  echo ""
  print_tui_panel_rule "${width}"
  echo -e "  ${BOLD}${BTOP_CYAN}⬡${NC} ${BOLD}Deploy${NC}"
  print_tui_panel_rule "${width}"
  print_tui_option_pair "D" "Deploy" "▶ Open" "Update, deploy, and sudo settings." \
    "B" "Backup & Restore" "▶ Open" "Manage backups, cloud storage, and components."
  print_tui_option_pair "S" "SEO & Database" "▶ Open" "Sitemap, robots.txt, and DB health." \
    "Y" "System" "▶ Open" "Git operations, cache, and config editing."
  
  echo ""
  print_tui_panel_rule "${width}"
}

print_deploy_menu_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  local ch
  while true; do
    tui_clear_screen
    print_box_banner "Deploy Management"
    echo -e "${DIM}Update and deploy the application.${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_option_pair "U" "Update + Deploy" "▶ Run" "Run update.sh then deploy.sh (git pull, build, restart)." \
      "D" "Deploy Only" "▶ Run" "Run deploy.sh directly (build + restart app)."
    print_tui_option_pair "S" "Toggle Sudo" "$(update_sudo_mode_label)" "Cycle sudo mode: auto / force on / force off."
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_action_pair "B" "Back to Main"
    print_tui_hint_line "Select U, D, S or B to go back"
    
    read -r -n 1 -s ch
    case "${ch,,}" in
      u) run_update_script; read -r -n 1 -s -p "  Done. Press any key..." ;;
      d) run_deploy_script; read -r -n 1 -s -p "  Done. Press any key..." ;;
      s) cycle_sudo_mode ;;
      b) return 0 ;;
      q) exit 0 ;;
    esac
  done
}

print_backup_menu_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  local ch
  while true; do
    tui_clear_screen
    print_box_banner "Backup & Restore"
    echo -e "${DIM}Manage local and cloud backups.${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_option_pair "R" "Run Backup" "▶ Run" "Create .tar.xz archive of app components." \
      "T" "Restore Backup" "▶ Open" "Restore from local or cloud backup."
    
    local cp_display="${BACKUP_CLOUD_PROVIDER}"
    [[ "${cp_display}" == "none" ]] || cp_display=$(echo "${cp_display}" | tr ' ' '+')
    print_tui_option_pair "C" "Components" "⚙ Set" "Configure which elements to include in backups." \
      "V" "Cloud Settings" "⚙ Set" "Configure cloud storage providers."
    print_tui_option_pair "F" "Schedule" "${BACKUP_FREQUENCY}" "Set automatic backup frequency." \
      "K" "Retention" "${BACKUP_RETENTION_DAYS}d" "Days to keep local backups."
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_action_pair "B" "Back to Main"
    print_tui_hint_line "Select R, T, C, V, F, K or B to go back"
    
    read -r -n 1 -s ch
    case "${ch,,}" in
      r) local up=false; prompt_yes_no "Upload to cloud?" "n" && up=true; run_backup "${up}"; read -r -n 1 -s -p "  Done. Press any key..." ;;
      t) restore_backup_tui ;;
      c) print_backup_components_tui ;;
      v) print_cloud_settings_tui ;;
      f) section "Frequency"; BACKUP_FREQUENCY=$(prompt_select "Select" "hourly" "daily" "weekly"); save_maintenance_settings; log_info "Settings updated"; sleep 1 ;;
      k) section "Retention"; BACKUP_RETENTION_DAYS=$(prompt_value "Days to keep" "${BACKUP_RETENTION_DAYS}"); save_maintenance_settings; log_info "Settings updated"; sleep 1 ;;
      b) return 0 ;;
      q) exit 0 ;;
    esac
  done
}

print_seo_db_menu_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  local ch
  while true; do
    tui_clear_screen
    print_box_banner "SEO & Database"
    echo -e "${DIM}Manage search engine visibility and database health.${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_option_pair "M" "Generate Sitemap" "▶ Run" "Generate sitemap.xml from SEO config." \
      "G" "Generate Robots.txt" "▶ Run" "Generate robots.txt for search engines."
    print_tui_option_pair "H" "Database Health" "● Check" "Verify database connection and status."
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_action_pair "B" "Back to Main"
    print_tui_hint_line "Select M, G, H or B to go back"
    
    read -r -n 1 -s ch
    case "${ch,,}" in
      m) generate_sitemap; read -r -n 1 -s -p "  Done. Press any key..." ;;
      g) generate_robots_txt; read -r -n 1 -s -p "  Done. Press any key..." ;;
      h) check_database_health; read -r -n 1 -s -p "  Done. Press any key..." ;;
      b) return 0 ;;
      q) exit 0 ;;
    esac
  done
}

print_system_menu_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  local ch
  while true; do
    tui_clear_screen
    print_box_banner "System Management"
    echo -e "${DIM}General system operations and configuration.${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_option_pair "P" "Git Pull" "↓ Run" "Fetch and merge latest from remote." \
      "X" "Clean Cache" "✖ Run" "Remove Next.js build cache."
    print_tui_option_pair "E" "Edit Config" "◈ Open" "Edit .env or SEO config files."
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_action_pair "B" "Back to Main"
    print_tui_hint_line "Select P, X, E or B to go back"
    
    read -r -n 1 -s ch
    case "${ch,,}" in
      p) run_git_pull; read -r -n 1 -s -p "  Done. Press any key..." ;;
      x) [[ -d "${REPO_ROOT}/.next" ]] && rm -rf "${REPO_ROOT}/.next"; [[ -d "${REPO_ROOT}/node_modules/.cache" ]] && rm -rf "${REPO_ROOT}/node_modules/.cache"; log_info "Cache cleaned"; read -r -n 1 -s -p "  Done. Press any key..." ;;
      e) section "Edit Config"; prompt_env_editor; read -r -n 1 -s -p "  Done. Press any key..." ;;
      b) return 0 ;;
      q) exit 0 ;;
    esac
  done
}



# =============================================================================
# Runtime
# =============================================================================

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
  if [[ -n "${SPINNER_PID}" ]] && kill -0 "${SPINNER_PID}" 2>/dev/null; then
    kill "${SPINNER_PID}" 2>/dev/null || true; wait "${SPINNER_PID}" 2>/dev/null || true
  fi
  [[ "${status}" == "ok" ]] && printf "\r${GREEN}✔${NC} %s\n" "${SPINNER_MSG}" || printf "\r${RED}✖${NC} %s\n" "${SPINNER_MSG}"
}

check_database_health() {
  section "Database Health"
  get_db_creds || { log_error "No creds"; return 1; }
  log_info "Connecting to ${DB_NAME} on ${DB_H:-localhost}..."
  if command -v mysql >/dev/null 2>&1; then
    if MYSQL_PWD="${DB_P}" mysql -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" -e "SELECT 1" "${DB_NAME}" >/dev/null 2>&1; then log_info "DB OK"; else log_error "DB Fail"; fi
  elif command -v mariadb >/dev/null 2>&1; then
    if MYSQL_PWD="${DB_P}" mariadb -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" -e "SELECT 1" "${DB_NAME}" >/dev/null 2>&1; then log_info "DB OK"; else log_error "DB Fail"; fi
  else
    log_warn "mysql client not installed"; fi
}

print_cloud_settings_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  local ch
  while true; do
    tui_clear_screen
    print_box_banner "Cloud Settings"
    echo -e "${DIM}Configure cloud storage providers for backups.${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    echo -e "${BOLD}${BLUE}  Active Providers${NC}"
    print_tui_panel_rule "${width}"
    
    local use_gdrive="false"
    [[ "${BACKUP_CLOUD_PROVIDER}" == *"google-drive"* ]] && use_gdrive="true"
    local use_koofr="false"
    [[ "${BACKUP_CLOUD_PROVIDER}" == *"koofr"* ]] && use_koofr="true"
    
    print_tui_option_pair "1" "Google Drive" "$(bool_word "${use_gdrive}")" "Upload to Google Drive." \
      "2" "Koofr (WebDAV)" "$(bool_word "${use_koofr}")" "Upload via Koofr WebDAV."
    echo ""
    print_tui_panel_rule "${width}"
    echo -e "${BOLD}${BLUE}  Configuration${NC}"
    print_tui_panel_rule "${width}"
    echo -e "  Folder: ${BOLD}${BACKUP_CLOUD_FOLDER}${NC}"
    echo ""
    print_tui_panel_rule "${width}"
    print_tui_action_pair "F" "Edit Folder" "B" "Back to Main"
    print_tui_hint_line "Toggle with 1-2, F to change folder, B to go back"
    
    read -r -n 1 -s ch
    case "${ch,,}" in
      1) 
        if [[ "${use_gdrive}" == "true" ]]; then
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//google-drive/}"
        else
          [[ "${BACKUP_CLOUD_PROVIDER}" == "none" ]] && BACKUP_CLOUD_PROVIDER=""
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} google-drive"
        fi
        BACKUP_CLOUD_PROVIDER=$(echo $BACKUP_CLOUD_PROVIDER | xargs)
        [[ -z "${BACKUP_CLOUD_PROVIDER}" ]] && BACKUP_CLOUD_PROVIDER="none"
        save_maintenance_settings
        ;;
      2)
        if [[ "${use_koofr}" == "true" ]]; then
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//koofr/}"
        else
          [[ "${BACKUP_CLOUD_PROVIDER}" == "none" ]] && BACKUP_CLOUD_PROVIDER=""
          BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} koofr"
        fi
        BACKUP_CLOUD_PROVIDER=$(echo $BACKUP_CLOUD_PROVIDER | xargs)
        [[ -z "${BACKUP_CLOUD_PROVIDER}" ]] && BACKUP_CLOUD_PROVIDER="none"
        save_maintenance_settings
        ;;
      f) BACKUP_CLOUD_FOLDER=$(prompt_value "Cloud Folder" "${BACKUP_CLOUD_FOLDER}"); save_maintenance_settings ;;
      b) return 0 ;;
      q) exit 0 ;;
    esac
  done
}

run_interactive_maintenance() {
  load_backup_config
  create_backup_directory
  local ch=""
  while true; do
    print_btop_main_menu
    printf "  ${BTOP_FG_DIM}Select Category (D, B, S, Y, R to refresh, Q to quit):${NC} "
    read -r -n 1 ch
    case "${ch,,}" in
      d) print_deploy_menu_tui ;;
      b) print_backup_menu_tui ;;
      s) print_seo_db_menu_tui ;;
      y) print_system_menu_tui ;;
      r) : ;;
      q) exit 0 ;;
      *) ;;
    esac
  done
}


load_backup_config() {
  load_maintenance_settings
  return 0
}

create_backup_directory() {
  local current_user; current_user=$(id -un)
  if [[ ! -d "${BACKUP_DIR}" ]]; then
    run_privileged_cmd mkdir -p "${BACKUP_DIR}"
    run_privileged_cmd chown "${current_user}:${current_user}" "${BACKUP_DIR}" 2>/dev/null || true
  fi
  if [[ ! -d "${LOG_DIR}" ]]; then
    run_privileged_cmd mkdir -p "${LOG_DIR}"
    run_privileged_cmd chown "${current_user}:${current_user}" "${LOG_DIR}" 2>/dev/null || true
  fi
}

prompt_env_editor() {
  local shared_env_path="${SHARED_DIR}/.env"
  local editor="${VISUAL:-${EDITOR:-nano}}"
  for candidate in nano vi vim; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      editor="${candidate}"
      break
    fi
  done
  if command -v "${editor}" >/dev/null 2>&1; then
    if [[ -f "${shared_env_path}" ]]; then
      "${editor}" "${shared_env_path}"
    else
      log_warn "Shared .env not found at ${shared_env_path}"
    fi
  else
    log_warn "No terminal editor found (tried nano, vi, vim)."
  fi
}

show_usage() {
  cat <<'EOF'
Melbourne Guitar School - Maintenance Script

Usage: ./deploy/maintenance.sh [options]

Options:
  --interactive     Run interactive TUI mode
  --skip-pull       Skip git pull operations
  --branch BRANCH   Git branch to use
  --remote REMOTE   Git remote (default: origin)
  --allow-dirty     Allow dirty git worktree
  --no-color        Disable colored output
  --no-spinner      Disable spinner animation
  --help, -h        Show this usage information
EOF
}


main() {
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
    esac
    shift
  done
  init_paths; detect_tty_capabilities
  if [[ "${INTERACTIVE}" != true && "${IS_TTY}" != true ]]; then
    show_usage; exit 1
  fi
  run_interactive_maintenance
}

main "$@"
