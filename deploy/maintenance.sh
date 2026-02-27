#!/bin/bash
# Maintenance Script for Melbourne Guitar School
# Comprehensive maintenance TUI for SEO management, backups, and system tasks.

set -euo pipefail

# Resolve paths
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
BTOP_GRAD_0='\033[38;5;82m'
BTOP_GRAD_1='\033[38;5;119m'
BTOP_GRAD_2='\033[38;5;77m'
BTOP_GRAD_3='\033[38;5;178m'
BTOP_GRAD_4='\033[38;5;208m'
BTOP_GRAD_5='\033[38;5;196m'

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
# Run wrappers
# =============================================================================

run_interactive_maintenance() {
  load_maintenance_settings; create_backup_directory;
  tui_clear_screen
  while true; do
    auto_size_tui_panel_width; print_btop_main_menu;
    local choice; choice=$(gum choose --cursor.foreground="33" --item.foreground="250" "Deploy Management" "Backup & Restore" "SEO & Database" "System Management" "Refresh" "Quit")
    case "${choice}" in
      "Deploy Management") print_deploy_menu_tui ;;
      "Backup & Restore") print_backup_menu_tui ;;
      "SEO & Database") print_seo_db_menu_tui ;;
      "System Management") print_system_menu_tui ;;
      "Refresh") : ;;
      "Quit") exit 0 ;;
    esac
  done
}

detect_tty_capabilities() {
  if [[ -t 0 && -t 1 ]]; then IS_TTY=true; fi
  if [[ "${IS_TTY}" == true ]]; then auto_size_tui_panel_width; fi
  if [[ "${NO_COLOR:-false}" == true || ! -t 1 ]]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' DIM='' NC=''
    BTOP_FG='' BTOP_FG_DIM='' BTOP_CYAN='' BTOP_CYAN_BRIGHT='' BTOP_GREEN='' BTOP_GREEN_DIM='' BTOP_BLUE='' BTOP_BLUE_DIM='' BTOP_ORANGE='' BTOP_ORANGE_DIM='' BTOP_PURPLE='' BTOP_PURPLE_DIM='' BTOP_YELLOW='' BTOP_YELLOW_DIM='' BTOP_RED='' BTOP_RED_DIM='' BTOP_GRAD_0='' BTOP_GRAD_1='' BTOP_GRAD_2='' BTOP_GRAD_3='' BTOP_GRAD_4='' BTOP_GRAD_5=''
  fi
}

run_step() { local msg="$1"; shift; start_spinner "${msg}"; if "$@" >/dev/null 2>&1; then stop_spinner "ok" >&2; else stop_spinner "fail" >&2; return 1; fi; }
start_spinner() { local msg="$1" i=0 fc="${#SPINNER_FRAMES[@]}"; [[ "${NO_SPINNER:-false}" == true || "${IS_TTY:-false}" != true ]] && return 0; SPINNER_MSG="${msg}"; ( while true; do printf "\r${CYAN}%s${NC} %s" "${SPINNER_FRAMES[$i]}" "${SPINNER_MSG}" >&2; i=$(( (i + 1) % fc )); sleep 0.08; done ) & SPINNER_PID=$!; }
stop_spinner() { local status="$1"; [[ "${NO_SPINNER:-false}" == true || "${IS_TTY:-false}" != true ]] && return 0; if [[ -n "${SPINNER_PID:-}" ]] && kill -0 "${SPINNER_PID}" 2>/dev/null; then kill "${SPINNER_PID}" 2>/dev/null || true; wait "${SPINNER_PID}" 2>/dev/null || true; fi; printf "\r\033[K" >&2; [[ "${status}" == "ok" ]] && printf "${GREEN}✔${NC} %s\n" "${SPINNER_MSG}" >&2 || printf "${RED}✖${NC} %s\n" "${SPINNER_MSG}" >&2; }
check_database_health() { section "Database Health"; get_db_creds || { log_error "No creds"; return 1; }; log_info "Connecting to ${DB_NAME} on ${DB_H:-localhost}..."; if command -v mysql >/dev/null 2>&1; then if MYSQL_PWD="${DB_P}" mysql -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" -e "SELECT 1" "${DB_NAME}" >/dev/null 2>&1; then log_info "DB OK"; else log_error "DB Fail"; fi; elif command -v mariadb >/dev/null 2>&1; then if MYSQL_PWD="${DB_P}" mariadb -h "${DB_H:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_U}" -e "SELECT 1" "${DB_NAME}" >/dev/null 2>&1; then log_info "DB OK"; else log_error "DB Fail"; fi; else log_error "No mysql client"; fi; }
run_git_pull() { section "Git Pull"; run_step "Fetching" git -C "${REPO_ROOT}" fetch "${REMOTE_NAME}"; run_step "Pulling" git -C "${REPO_ROOT}" pull "${REMOTE_NAME}" "${BRANCH:-$(current_branch_name)}"; }
run_update_script() { section "Updating Application"; bash "${UPDATE_SCRIPT}" --sudo-deploy; }
run_deploy_script() { section "Deploying Application"; bash "${DEPLOY_SCRIPT}" --skip-pull; }
create_backup_directory() { local u; u=$(id -un); if [[ ! -d "${BACKUP_DIR}" ]]; then run_privileged_cmd mkdir -p "${BACKUP_DIR}"; run_privileged_cmd chown "${u}:${u}" "${BACKUP_DIR}" 2>/dev/null || true; fi; if [[ ! -d "${LOG_DIR}" ]]; then run_privileged_cmd mkdir -p "${LOG_DIR}"; run_privileged_cmd chown "${u}:${u}" "${LOG_DIR}" 2>/dev/null || true; fi; }
prompt_env_editor() { local se="${SHARED_DIR}/.env" ed="${VISUAL:-${EDITOR:-nano}}"; for c in nano vi vim; do if command -v "${c}" >/dev/null 2>&1; then ed="${c}"; break; fi; done; if command -v "${ed}" >/dev/null 2>&1; then if [[ -f "${se}" ]]; then "${ed}" "${se}"; else log_warn "Shared .env not found"; fi; else log_warn "No terminal editor found"; fi; }

# =============================================================================
# Utils
# =============================================================================

log_info() { echo -e "${GREEN}●${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}▲${NC} $1" >&2; }
log_error() { echo -e "${RED}✖${NC} $1" >&2; }

ensure_dependencies() {
  if command -v gum >/dev/null 2>&1 && command -v fzf >/dev/null 2>&1; then
    return 0
  fi

  if [[ "${IS_TTY}" != true ]]; then
    return 0
  fi

  start_spinner "Installing Dependencies..."
  
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    local os_id=$ID
    local os_like=${ID_LIKE:-}
  else
    stop_spinner "fail"
    return 1
  fi

  local install_cmd=""
  if [[ "$os_id" == "ubuntu" || "$os_id" == "debian" || "$os_like" == *"debian"* ]]; then
    sudo apt-get update -qq >/dev/null 2>&1 || true
    install_cmd="sudo apt-get install -y -qq"
  elif [[ "$os_id" == "arch" || "$os_id" == "cachyos" || "$os_like" == *"arch"* ]]; then
    install_cmd="sudo pacman -S --noconfirm -q"
  elif [[ "$os_id" == "fedora" || "$os_like" == *"fedora"* ]]; then
    install_cmd="sudo dnf install -y -q"
  elif [[ "$os_id" == "alpine" ]]; then
    install_cmd="sudo apk add -q"
  fi

  if [[ -n "$install_cmd" ]]; then
    if ! command -v fzf >/dev/null 2>&1; then
      $install_cmd fzf >/dev/null 2>&1 || true
    fi
    if ! command -v gum >/dev/null 2>&1; then
      if [[ "$os_id" == "ubuntu" || "$os_id" == "debian" ]]; then
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg >/dev/null 2>&1
        echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
        sudo apt-get update -qq >/dev/null 2>&1 && sudo apt-get install -y -qq gum >/dev/null 2>&1 || true
      elif [[ "$os_id" == "fedora" ]]; then
        echo '[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key' | sudo tee /etc/yum.repos.d/charm.repo >/dev/null
        sudo dnf install -y -q gum >/dev/null 2>&1 || true
      else
        $install_cmd gum >/dev/null 2>&1 || true
      fi
    fi
  fi

  if command -v gum >/dev/null 2>&1 && command -v fzf >/dev/null 2>&1; then
    stop_spinner "ok"
  else
    stop_spinner "fail"
  fi
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

prompt_value() {
  local prompt="$1"
  local default="${2:-}"
  gum input --placeholder "${prompt}" --value "${default}"
}

prompt_select() {
  local prompt="$1"
  shift
  local options=("$@")
  gum choose "${options[@]}"
}

bool_word() { [[ "$1" == true ]] && echo "ON" || echo "OFF"; }
toggle_bool() { [[ "$1" == true ]] && echo false || echo true; }

index_to_letter() {
  local idx=$1
  local letters="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  echo "${letters:$idx:1}"
}

letter_to_index() {
  local l=$1
  local letters="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  local i
  for ((i=0; i<${#letters}; i++)); do
    [[ "${letters:$i:1}" == "$l" ]] && { echo "$i"; return 0; }
  done
  return 1
}

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
  local bar; bar=$(draw_mini_bar "$cpu" "$width")
  local color; color=$(get_cpu_color "$cpu")
  printf "${color}%s${NC} %3d%%" "${bar}" "$cpu"
}

draw_mem_graph() {
  local mem="$1" width="${2:-20}"
  local bar; bar=$(draw_mini_bar "$mem" "$width")
  local color; color=$(get_mem_color "$mem")
  printf "${color}%s${NC} %3d%%" "${bar}" "$mem"
}

draw_disk_graph() {
  local disk="$1" width="${2:-20}"
  local bar; bar=$(draw_mini_bar "$disk" "$width")
  local color; color=$(get_disk_color "$disk")
  printf "${color}%s${NC} %3d%%" "${bar}" "$disk"
}

get_process_count() { ps ax | wc -l | xargs; }
get_load_average() { cut -d' ' -f1-3 /proc/loadavg; }
get_hostname() { hostname 2>/dev/null || echo "unknown"; }
get_kernel() { uname -r 2>/dev/null | cut -d- -f1 || echo "unknown"; }

print_btop_header() {
  local width="$1"
  local ts; ts=$(date "+%Y-%m-%d %H:%M:%S")
  local hn; hn=$(get_hostname)
  local kern; kern=$(get_kernel)
  
  local title; title=$(gum style --foreground "33" --bold "⬡ Melbourne Guitar School")
  local subtitle; subtitle=$(gum style --foreground "250" --italic "Maintenance Console")
  local info; info=$(printf "Host: %s | Kernel: %s | Time: %s" "$(gum style --foreground "51" "$hn")" "$(gum style --foreground "178" "$kern")" "$(gum style --foreground "82" "$ts")")
  
  gum style --border rounded --border-foreground "33" --padding "0 2" --width "$width" "$(printf "%s\n%s\n\n%s" "$title" "$subtitle" "$info")"
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
  # Try environment first, then shared .env file (with sudo if needed)
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
    run_step "Environment" run_privileged_cmd cp "${SHARED_DIR}/.env" "${td}/${bn}/" && c+="Environment " || log_warn "Environment copy failed"
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
  local up="${1:-false}" section="Backup Execution"
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
    log_info "Application files ready in: ${bd}/app"
    log_warn "Manual action required: cp -r ${bd}/app/* ${CURRENT_LINK}/"
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

# =============================================================================
# TUI Visual Components
# =============================================================================

auto_size_tui_panel_width() {
  local cols; cols=$(tput cols 2>/dev/null || echo "${COLUMNS:-110}")
  [[ ! "${cols}" =~ ^[0-9]+$ ]] && cols=110
  MAINTENANCE_TUI_PANEL_WIDTH=$(( cols < 48 ? 48 : cols > 120 ? 120 : cols ))
}

print_box_banner() {
  local content="$1"
  local inner_width=$(( ${#content} + 2 ))
  local rule; printf -v rule '%*s' "${inner_width}" ''; rule="${rule// /─}"
  echo ""
  echo -e "${BOLD}${CYAN}╭${rule}╮${NC}"
  echo -e "${BOLD}${CYAN}│${NC} ${BOLD}${content}${NC} ${BOLD}${CYAN}│${NC}"
  echo -e "${BOLD}${CYAN}╰${rule}╯${NC}"
}

print_tui_option_pair() {
  local lk="$1" ll="$2" lv="$3" ld="$4" rk="${5:-}" rl="${6:-}" rv="${7:-}" rd="${8:-}"
  local col_width=$(( (${MAINTENANCE_TUI_PANEL_WIDTH:-110} - 4) / 2 ))
  local lc; lc=$(build_tui_option_cell_text "${lk}" "${ll}" "${lv}" "${col_width}")
  local rc; rc=$(build_tui_option_cell_text "${rk}" "${rl}" "${rv}" "${col_width}")
  printf "  ${BOLD}${CYAN}"; tui_pad_text "${lc}" "${col_width}"; printf "${NC}  ${BOLD}${GREEN}"; tui_pad_text "${rc}" "${col_width}"; printf "${NC}\n"
  printf "  ${DIM}"; tui_pad_text "$(tui_truncate_text "${ld}" "${col_width}")" "${col_width}"; printf "${NC}  ${DIM}"; tui_pad_text "$(tui_truncate_text "${rd}" "${col_width}")" "${col_width}"; printf "${NC}\n"
}

print_tui_action_pair() {
  local lk="$1" ll="$2" rk="${3:-}" rl="${4:-}" cw=$(( (${MAINTENANCE_TUI_PANEL_WIDTH:-110} - 4) / 2 ))
  printf "  ${YELLOW}%-*s${NC}  ${MAGENTA}%-*s${NC}\n" "${cw}" "$(tui_truncate_text "${lk}  ${ll}" "${cw}")" "${cw}" "$(tui_truncate_text "${rk}  ${rl}" "${cw}")"
}

print_tui_hint_line() {
  local t; t=$(tui_truncate_text "$1" $((MAINTENANCE_TUI_PANEL_WIDTH-2)))
  echo -e "  ${DIM}${CYAN}${t}${NC}"
}

build_tui_option_cell_text() {
  local raw="[${1:-?}] ${2:-?}: ${3:-?}"
  tui_truncate_text "${raw}" "${4:-50}"
}

# =============================================================================
# TUI Pages
# =============================================================================

restore_backup_tui() {
  ensure_sudo_for_deploy_ready
  local src="local" rs=true rw=true re=true rmat=true rse=true rd=true ch
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "Restore Backup"
    echo -e "${DIM}Source: ${BOLD}${src^^}${NC} | Use fzf to select backup below\n"
    
    local backups=()
    if [[ "${src}" == "local" ]]; then
      while IFS= read -r b; do [[ -n "$b" ]] && backups+=("$b"); done < <(list_local_backups)
    else
      log_info "Fetching cloud backups..."
      while IFS= read -r b; do [[ -n "$b" ]] && backups+=("$b"); done < <(list_cloud_backups)
    fi

    if [[ ${#backups[@]} -eq 0 ]]; then
      echo -e "  ${YELLOW}No backups found${NC}"
      local choice; choice=$(gum choose "Toggle Source" "Back")
      [[ "$choice" == "Toggle Source" ]] && { [[ "$src" == "local" ]] && src="cloud" || src="local"; continue; }
      [[ "$choice" == "Back" ]] && return 0
      continue
    fi

    echo -e "${BOLD}${BLUE}  1. Configure Restore Options${NC}"
    local options_choice; options_choice=$(gum choose "SQL: $(bool_word "${rs}")" "App: $(bool_word "${rw}")" "Env: $(bool_word "${re}")" "Mat: $(bool_word "${rmat}")" "SEO: $(bool_word "${rse}")" "Data: $(bool_word "${rd}")" "PROCEED TO SELECT BACKUP" "Toggle Source (${src^^})" "Back")
    
    case "${options_choice}" in
      "SQL"*) rs=$(toggle_bool "${rs}") ; continue ;;
      "App"*) rw=$(toggle_bool "${rw}") ; continue ;;
      "Env"*) re=$(toggle_bool "${re}") ; continue ;;
      "Mat"*) rmat=$(toggle_bool "${rmat}") ; continue ;;
      "SEO"*) rse=$(toggle_bool "${rse}") ; continue ;;
      "Data"*) rd=$(toggle_bool "${rd}") ; continue ;;
      "Toggle Source"*) [[ "$src" == "local" ]] && src="cloud" || src="local" ; continue ;;
      "Back") return 0 ;;
      "PROCEED TO SELECT BACKUP") ;;
    esac

    local selected_backup; selected_backup=$(printf "%s\n" "${backups[@]}" | fzf --height 15 --reverse --header "Select backup to restore" --preview "echo {}")
    [[ -z "${selected_backup}" ]] && continue

    if gum confirm "Restore $(basename "${selected_backup}")?"; then
      if [[ "${src}" == "cloud" ]]; then
        local dp="${BACKUP_DIR}/$(basename "${selected_backup}")"
        download_backup_from_cloud "${selected_backup}" "${dp}" || continue
        selected_backup="${dp}"
      fi
      restore_backup "${selected_backup}" "${rs}" "${rw}" "${re}" "${rmat}" "${rse}" "${rd}"
      read -r -n 1 -s -p "  Done. Press any key..."
    fi
  done
}


download_backup_from_cloud() {
  local btr="$1" dp="$2" success=false; for p in ${BACKUP_CLOUD_PROVIDER}; do
    case "$p" in google-drive) download_from_google_drive "${btr}" "${dp}" && success=true && break ;; koofr) download_from_koofr "${btr}" "${dp}" && success=true && break ;; esac
  done; [[ "$success" == true ]] && return 0 || { log_error "Fail"; return 1; }
}

print_delete_backups_tui() {
  local width="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "Delete Backups"
    
    log_info "Loading backups..."
    local local_list=(); while IFS= read -r b; do [[ -n "$b" ]] && local_list+=("$(basename "$b")"); done < <(list_local_backups)
    local cloud_list=(); while IFS= read -r b; do [[ -n "$b" ]] && cloud_list+=("$b"); done < <(list_cloud_backups)
    
    local all_backups; mapfile -t all_backups < <(printf "%s\n" "${local_list[@]}" "${cloud_list[@]}" | sort -u -r | grep -v "^$")
    
    if [[ ${#all_backups[@]} -eq 0 ]]; then
      echo -e "  ${YELLOW}No backups found${NC}"
      sleep 1; return 0
    fi

    local selected; selected=$(printf "%s\n" "${all_backups[@]}" | fzf --multi --height 15 --reverse --header "Tab to select multiple, Enter to delete" --preview "echo {}")
    [[ -z "${selected}" ]] && return 0

    local sel_count; sel_count=$(echo "$selected" | wc -l)
    if gum confirm "Delete ${sel_count} backups from ALL locations?"; then
      ensure_sudo_for_deploy_ready
      while IFS= read -r b; do
        [[ -z "$b" ]] && continue
        local bn; bn=$(basename "$b")
        log_info "Deleting ${bn}..."
        run_privileged_cmd rm -f "${BACKUP_DIR}/${bn}" "${BACKUP_DIR}/${bn%.tar.xz}.meta" 2>/dev/null || true
        for provider in ${BACKUP_CLOUD_PROVIDER}; do
          case "$provider" in
            google-drive) delete_google_drive_backup "${bn}" ;;
            koofr) delete_koofr_backup "${bn}" ;;
          esac
        done
      done <<< "$selected"
      log_info "Deletions completed"; sleep 1
    fi
  done
}


print_backup_components_tui() {
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "Backup Components"
    local options=(
      "Database: $(bool_word "${BACKUP_INCLUDE_SQL}")"
      "Application: $(bool_word "${BACKUP_INCLUDE_WEBAPP}")"
      "Environment: $(bool_word "${BACKUP_INCLUDE_ENV}")"
      "Materials: $(bool_word "${BACKUP_INCLUDE_LEARNING_MATERIALS}")"
      "SEO Config: $(bool_word "${BACKUP_INCLUDE_SEO_CONFIG}")"
      "Clean Old: $(bool_word "${BACKUP_CLEAN_OLD}")"
      "Save & Back"
      "Cancel"
    )
    local choice; choice=$(gum choose --cursor.foreground="33" "${options[@]}")
    case "${choice}" in
      "Database"*) BACKUP_INCLUDE_SQL=$(toggle_bool "${BACKUP_INCLUDE_SQL}") ;;
      "Application"*) BACKUP_INCLUDE_WEBAPP=$(toggle_bool "${BACKUP_INCLUDE_WEBAPP}") ;;
      "Environment"*) BACKUP_INCLUDE_ENV=$(toggle_bool "${BACKUP_INCLUDE_ENV}") ;;
      "Materials"*) BACKUP_INCLUDE_LEARNING_MATERIALS=$(toggle_bool "${BACKUP_INCLUDE_LEARNING_MATERIALS}") ;;
      "SEO Config"*) BACKUP_INCLUDE_SEO_CONFIG=$(toggle_bool "${BACKUP_INCLUDE_SEO_CONFIG}") ;;
      "Clean Old"*) BACKUP_CLEAN_OLD=$(toggle_bool "${BACKUP_CLEAN_OLD}") ;;
      "Save & Back") save_maintenance_settings; return 0 ;;
      "Cancel") return 0 ;;
    esac
  done
}

print_cloud_settings_tui() {
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "Cloud Settings"
    local use_g="OFF"; [[ "${BACKUP_CLOUD_PROVIDER}" == *"google-drive"* ]] && use_g="ON"
    local use_k="OFF"; [[ "${BACKUP_CLOUD_PROVIDER}" == *"koofr"* ]] && use_k="ON"
    
    local choice; choice=$(gum choose --cursor.foreground="33" "Toggle Google Drive (Currently $use_g)" "Toggle Koofr (Currently $use_k)" "Toggle Auto-upload ($(bool_word "${BACKUP_AUTO_UPLOAD}"))" "Set Cloud Folder (${BACKUP_CLOUD_FOLDER})" "Back")
    case "${choice}" in
      "Toggle Google Drive"*) 
        if [[ "${use_g}" == "ON" ]]; then BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//google-drive/}"; else [[ "${BACKUP_CLOUD_PROVIDER}" == "none" ]] && BACKUP_CLOUD_PROVIDER=""; BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} google-drive"; fi
        BACKUP_CLOUD_PROVIDER=$(echo $BACKUP_CLOUD_PROVIDER | xargs); [[ -z "${BACKUP_CLOUD_PROVIDER}" ]] && BACKUP_CLOUD_PROVIDER="none"; save_maintenance_settings ;;
      "Toggle Koofr"*)
        if [[ "${use_k}" == "ON" ]]; then BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER//koofr/}"; else [[ "${BACKUP_CLOUD_PROVIDER}" == "none" ]] && BACKUP_CLOUD_PROVIDER=""; BACKUP_CLOUD_PROVIDER="${BACKUP_CLOUD_PROVIDER} koofr"; fi
        BACKUP_CLOUD_PROVIDER=$(echo $BACKUP_CLOUD_PROVIDER | xargs); [[ -z "${BACKUP_CLOUD_PROVIDER}" ]] && BACKUP_CLOUD_PROVIDER="none"; save_maintenance_settings ;;
      "Toggle Auto-upload"*) BACKUP_AUTO_UPLOAD=$(toggle_bool "${BACKUP_AUTO_UPLOAD}"); save_maintenance_settings ;;
      "Set Cloud Folder"*) BACKUP_CLOUD_FOLDER=$(gum input --placeholder "Folder Name" --value "${BACKUP_CLOUD_FOLDER}"); save_maintenance_settings ;;
      "Back") return 0 ;;
    esac
  done
}

# =============================================================================
# Main Menus
# =============================================================================

print_btop_main_menu() {
  printf "\033[H"
  local cpu=$(get_cpu_usage) mem=$(get_memory_usage) disk=$(get_disk_usage "/") up=$(get_uptime) w="${MAINTENANCE_TUI_PANEL_WIDTH:-110}"
  [[ -z "${BRANCH:-}" ]] && BRANCH="$(current_branch_name 2>/dev/null || echo "main")"; local h=$(get_current_commit 2>/dev/null || echo "???") m=$(get_last_commit_msg 2>/dev/null || echo "...")
  
  print_btop_header "$w"
  echo ""
  
  local left; left=$(printf "  ${DIM}CPU${NC}   $(draw_cpu_graph "$cpu" 18)\n  ${DIM}MEM${NC}   $(draw_mem_graph "$mem" 18)\n  ${DIM}DISK${NC}  $(draw_disk_graph "$disk" 18)")
  local right; right=$(printf "  ${DIM}Uptime:${NC} ${BTOP_PURPLE}%s${NC}\n  ${DIM}Procs:${NC}  ${BTOP_CYAN}%s${NC}\n  ${DIM}Load:${NC}   ${BTOP_YELLOW}%s${NC}" "$up" "$(get_process_count)" "$(get_load_average)")
  
  gum join --horizontal --align top --padding "0 10 0 0" "$left" "$right"
  
  echo ""; print_tui_panel_rule "$w"; echo -e "  ${BOLD}${BTOP_CYAN}⬡${NC} ${BOLD}Git Status${NC}"; print_tui_panel_rule "$w"
  printf "  ${DIM}Branch:${NC} ${BTOP_GREEN}%s${NC}  ${DIM}Commit:${NC} ${BTOP_YELLOW}%s${NC}  ${DIM}Sudo:${NC} ${BTOP_PURPLE}%s${NC}\n" "${BRANCH}" "$h" "$(update_sudo_mode_label)"
  printf "  ${DIM}Last:${NC} ${BTOP_FG}%s${NC}\n" "$(tui_truncate_text "$m" $((w-10)))"
  echo ""; print_tui_panel_rule "$w"; echo -e "  ${BOLD}${BTOP_CYAN}⬡${NC} ${BOLD}Navigation${NC}"; print_tui_panel_rule "$w"
}

print_deploy_menu_tui() {
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "Deploy Management"
    echo -e "${DIM}Update and deploy.\n"; print_tui_panel_rule "${MAINTENANCE_TUI_PANEL_WIDTH}"
    local choice; choice=$(gum choose --cursor.foreground="33" "Update Application" "Deploy Application" "Toggle Sudo Mode ($(update_sudo_mode_label))" "Back")
    case "${choice}" in
      "Update Application") run_update_script; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Deploy Application") run_deploy_script; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Toggle Sudo Mode"*) cycle_sudo_mode ;;
      "Back") return 0 ;;
    esac
  done
}

print_backup_menu_tui() {
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "Backup & Restore"
    echo -e "${DIM}Manage local and cloud.\n"; print_tui_panel_rule "${MAINTENANCE_TUI_PANEL_WIDTH}"
    local choice; choice=$(gum choose --cursor.foreground="33" "Run New Backup" "Restore Backup" "Delete Backups" "Cloud Settings" "Backup Components" "Set Frequency (${BACKUP_FREQUENCY})" "Set Retention (${BACKUP_RETENTION_DAYS}d)" "Back")
    case "${choice}" in
      "Run New Backup") run_backup "${BACKUP_AUTO_UPLOAD:-false}"; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Restore Backup") restore_backup_tui ;;
      "Delete Backups") print_delete_backups_tui ;;
      "Cloud Settings") print_cloud_settings_tui ;;
      "Backup Components") print_backup_components_tui ;;
      "Set Frequency"*) BACKUP_FREQUENCY=$(gum choose "hourly" "daily" "weekly"); save_maintenance_settings ;;
      "Set Retention"*) BACKUP_RETENTION_DAYS=$(gum input --placeholder "Days (e.g. 30)" --value "${BACKUP_RETENTION_DAYS}"); save_maintenance_settings ;;
      "Back") return 0 ;;
    esac
  done
}

print_seo_db_menu_tui() {
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "SEO & Database"
    echo -e "${DIM}SEO and health.\n"; print_tui_panel_rule "${MAINTENANCE_TUI_PANEL_WIDTH}"
    local choice; choice=$(gum choose --cursor.foreground="33" "Generate Sitemap" "Generate Robots.txt" "Check Database Health" "Back")
    case "${choice}" in
      "Generate Sitemap") generate_sitemap; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Generate Robots.txt") generate_robots_txt; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Check Database Health") check_database_health; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Back") return 0 ;;
    esac
  done
}

print_system_menu_tui() {
  while true; do
    auto_size_tui_panel_width; tui_clear_screen; print_box_banner "System Management"
    echo -e "${DIM}Ops and config.\n"; print_tui_panel_rule "${MAINTENANCE_TUI_PANEL_WIDTH}"
    local choice; choice=$(gum choose --cursor.foreground="33" "Git Pull" "Clean Cache" "Edit Config (.env)" "Back")
    case "${choice}" in
      "Git Pull") run_git_pull; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Clean Cache") [[ -d "${REPO_ROOT}/.next" ]] && run_privileged_cmd rm -rf "${REPO_ROOT}/.next"; [[ -d "${REPO_ROOT}/node_modules/.cache" ]] && run_privileged_cmd rm -rf "${REPO_ROOT}/node_modules/.cache"; log_info "Cache cleaned"; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Edit Config (.env)") section "Edit"; prompt_env_editor; read -r -n 1 -s -p "  Done. Press any key..." ;;
      "Back") return 0 ;;
    esac
  done
}

show_usage() {
  cat <<'EOF'
Melbourne Guitar School - Maintenance Script
Usage: ./deploy/maintenance.sh [options]
Options:
  --interactive     Run interactive TUI mode
EOF
}

main() {
  while [[ $# -gt 0 ]]; do case "$1" in --interactive) INTERACTIVE=true ;; --branch) BRANCH="$2"; shift ;; --remote) REMOTE_NAME="$2"; shift ;; --help|-h) show_usage; exit 0 ;; esac; shift; done
  init_paths; detect_tty_capabilities; [[ "${INTERACTIVE:-false}" == true || "${IS_TTY:-false}" == true ]] && { ensure_dependencies; run_interactive_maintenance; } || show_usage
}
main "$@"

