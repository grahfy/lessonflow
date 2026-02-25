#!/bin/bash
# =============================================================================
# Melbourne Guitar School - Update + Deploy Script
# =============================================================================
# Pulls the latest git changes for a branch and then runs the deployment script.
# Designed for server-side updates from a persistent git clone (for example
# ~/melbourne-guitar-school) and intentionally mirrors the interactive deploy UI.
#
# Usage: ./deploy/update.sh [options]
#
# Options:
#   --branch BRANCH      Git branch to pull and deploy (default: current branch)
#   --remote REMOTE      Git remote to pull from (default: origin)
#   --skip-pull          Skip git fetch/pull and run deploy only
#   --skip-deploy        Skip deployment after updating git
#   --skip-deps          Pass through to deploy.sh (skip npm install)
#   --skip-cron          Pass through to deploy.sh (skip managed cron jobs sync)
#   --skip-migrate       Pass through to deploy.sh (skip database migrations)
#   --db-push            Pass through to deploy.sh (use prisma db push)
#   --ssl                Pass through to deploy.sh (run SSL setup post-deploy)
#   --domain DOMAIN      SSL domain (required with --ssl)
#   --email EMAIL        SSL certificate email (required with --ssl)
#   --allow-dirty        Allow git pull/deploy even if working tree is dirty
#   --sudo-deploy        Force sudo when invoking deploy.sh
#   --no-sudo-deploy     Do not use sudo when invoking deploy.sh
#   --interactive        Prompt for update/deploy options in TTY mode
#   --no-spinner         Disable spinner UI
#   --no-color           Disable colored output
#   --help, -h           Show usage
# =============================================================================

set -euo pipefail

# Resolve the deploy directory so we can invoke deploy.sh reliably even when this
# script is called from another working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy.sh"
REPO_ROOT=""
ORIGINAL_ARGS=( "$@" )

# Runtime configuration defaults. Branch defaults to the current checked-out
# branch later so server operators can simply run ./deploy/update.sh.
REMOTE_NAME="origin"
BRANCH=""
SKIP_PULL=false
SKIP_DEPLOY=false
SKIP_DEPS=false
SKIP_CRON_SETUP=false
SKIP_MIGRATE=false
DB_PUSH=false
SSL_SETUP=false
SSL_DOMAIN=""
SSL_EMAIL=""
ALLOW_DIRTY=false
FORCE_SUDO_DEPLOY=false
FORCE_NO_SUDO_DEPLOY=false
INTERACTIVE=false
NO_SPINNER=false
NO_COLOR=false
IS_TTY=false
SPINNER_PID=""
SPINNER_MSG=""
SPINNER_FRAMES=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
SUDO_DEPLOY_AUTH_READY=false
DEFAULT_BUILD_NODE_HEAP_MB="${DEFAULT_BUILD_NODE_HEAP_MB:-6144}"
LOW_RAM_1GB_AUTO_HEAP_MB="${LOW_RAM_1GB_AUTO_HEAP_MB:-3072}"
LOW_RAM_2GB_AUTO_HEAP_MB="${LOW_RAM_2GB_AUTO_HEAP_MB:-2048}"
LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560

# ANSI color palette shared with deploy.sh for consistent terminal UX.
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Prints a concise usage block suitable for operators and automation logs.
show_usage() {
  cat <<'EOF'
Melbourne Guitar School - Update + Deploy Script

Usage: ./deploy/update.sh [options]

Options:
  --branch BRANCH      Git branch to pull and deploy (default: current branch)
  --remote REMOTE      Git remote to pull from (default: origin)
  --skip-pull          Skip git fetch/pull and run deploy only
  --skip-deploy        Skip deployment after updating git
  --skip-deps          Pass through to deploy.sh (skip npm install)
  --skip-cron          Pass through to deploy.sh (skip managed cron jobs sync)
  --skip-migrate       Pass through to deploy.sh (skip database migrations)
  --db-push            Pass through to deploy.sh (use prisma db push)
  --ssl                Pass through to deploy.sh (run SSL setup post-deploy)
  --domain DOMAIN      SSL domain (required with --ssl)
  --email EMAIL        SSL certificate email (required with --ssl)
  --allow-dirty        Allow git pull/deploy even if working tree is dirty
  --sudo-deploy        Force sudo when invoking deploy.sh
  --no-sudo-deploy     Do not use sudo when invoking deploy.sh
  --interactive        Prompt for update/deploy options in TTY mode
  --no-spinner         Disable spinner UI
  --no-color           Disable colored output
  --help, -h           Show usage
EOF
}

# Detect terminal capabilities so the script degrades cleanly in CI/non-TTY runs.
detect_tty_capabilities() {
  if [[ -t 0 && -t 1 ]]; then
    IS_TTY=true
  fi

  if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' NC=''
  fi
}

# Returns the application version from package.json (or "unknown" if unreadable).
get_app_version() {
  local package_json="${SCRIPT_DIR}/../package.json"
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

# Draws a dynamic-width box banner so longer titles (for example with version)
# do not break the right-hand border.
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

# Shared presentation helpers keep update.sh visually consistent with deploy.sh.
print_banner() {
  local app_version
  app_version="$(get_app_version)"
  print_box_banner "Melbourne Guitar School Update (+ deploy) v${app_version}"
}

# Informational line used for low-noise status updates.
log_info() {
  echo -e "${GREEN}●${NC} $1"
}

# Warning line for recoverable conditions and user guidance.
log_warn() {
  echo -e "${YELLOW}▲${NC} $1"
}

# Error line for terminal failures.
log_error() {
  echo -e "${RED}✖${NC} $1"
}

# Visual section markers make long update runs easier to scan.
section() {
  echo ""
  local title="$1"
  # Inner content is: two spaces + title + two spaces => title length + 4.
  local width=$(( ${#title} + 4 ))
  local rule=""
  printf -v rule '%*s' "${width}" ''
  rule="${rule// /─}"
  echo -e "${BOLD}${BLUE}╭${rule}╮${NC}"
  echo -e "${BOLD}${BLUE}│${NC}  ${BOLD}${title}${NC}  ${BOLD}${BLUE}│${NC}"
  echo -e "${BOLD}${BLUE}╰${rule}╯${NC}"
}

maybe_restart_after_self_update() {
  local before_commit="$1"
  local after_commit="$2"
  local restart_count="${MGS_UPDATE_SELF_RESTART_COUNT:-0}"

  if [[ -z "${before_commit}" || -z "${after_commit}" || "${before_commit}" == "${after_commit}" ]]; then
    return 0
  fi

  if [[ ! "${restart_count}" =~ ^[0-9]+$ ]]; then
    restart_count=0
  fi

  if (( restart_count >= 2 )); then
    log_warn "Script updated (${before_commit} -> ${after_commit}) but restart limit reached; continuing current process."
    return 0
  fi

  local commit_details=""
  commit_details="$(git log --reverse --date=local --pretty=format:'%C(yellow)%h%Creset %ad %C(cyan)%an%Creset%n  %s%n%+b' "${before_commit}..${after_commit}" 2>/dev/null || true)"
  if [[ -n "${commit_details}" ]]; then
    section "Git Changes"
    echo "${commit_details}"
    if [[ "${IS_TTY}" == true ]]; then
      echo ""
      read -r -n 1 -s -p "Press any key to reload update menu with the new script..." _
      echo ""
    fi
  fi

  log_warn "update.sh changed after git pull (${before_commit} -> ${after_commit}); restarting script and returning to the main menu..."
  export MGS_RETURN_TO_MENU_AFTER_SELF_UPDATE=1
  export MGS_UPDATE_SELF_RESTART_COUNT=$((restart_count + 1))
  exec "${SCRIPT_DIR}/update.sh" "${ORIGINAL_ARGS[@]}"
}

# Reusable prompt for yes/no interactive questions with defaults.
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

# Reusable prompt for free-form values with optional default display.
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

spinner_ui_word() {
  if [[ "${NO_SPINNER}" == true ]]; then
    echo "OFF"
  else
    echo "ON"
  fi
}

status_chip() {
  local label="$1"
  local state="$2"
  local color="${DIM}"

  if [[ "${state}" == "ON" || "${state}" == "enabled" || "${state}" == "migrate deploy" ]]; then
    color="${GREEN}"
  elif [[ "${state}" == "OFF" || "${state}" == "disabled" || "${state}" == "skip migrations" ]]; then
    color="${YELLOW}"
  elif [[ "${state}" == *"db-push"* ]]; then
    color="${CYAN}"
  fi

  printf "%b[%s: %s]%b" "${color}" "${label}" "${state}" "${NC}"
}

tui_clear_screen() {
  [[ "${IS_TTY}" == true ]] && clear
}

print_tui_panel_rule() {
  local width="${1:-84}"
  local rule=""
  printf -v rule '%*s' "${width}" ''
  rule="${rule// /─}"
  echo -e "${DIM}${rule}${NC}"
}

print_tui_option_row() {
  local key="$1"
  local label="$2"
  local value="$3"
  printf "  %b[%2s]%b %-22s %b%s%b\n" "${BOLD}" "${key}" "${NC}" "${label}" "${CYAN}" "${value}" "${NC}"
}

print_tui_option_desc() {
  local text="$1"
  echo -e "       ${DIM}${text}${NC}"
}

print_summary_row() {
  local label="$1"
  local value="$2"
  printf "  %-18b %b%s%b\n" "${DIM}${label}:${NC}" "${CYAN}" "${value}" "${NC}"
}

update_migration_mode_label() {
  if [[ "${DB_PUSH}" == true ]]; then
    echo "db-push (skip migrations)"
  elif [[ "${SKIP_MIGRATE}" == true ]]; then
    echo "skip migrations"
  else
    echo "migrate deploy"
  fi
}

cycle_update_migration_mode() {
  if [[ "${DB_PUSH}" == true ]]; then
    DB_PUSH=false
    SKIP_MIGRATE=false
  elif [[ "${SKIP_MIGRATE}" == true ]]; then
    DB_PUSH=true
    SKIP_MIGRATE=true
  else
    DB_PUSH=false
    SKIP_MIGRATE=true
  fi
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

cycle_update_sudo_mode() {
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

print_update_tui_menu() {
  tui_clear_screen
  print_box_banner "Update + Deploy TUI"
  echo -e "${DIM}btop-style menu: configure git update + deploy handoff, then run.${NC}"
  echo ""
  echo -e "  $(status_chip "Branch" "${BRANCH}")  $(status_chip "Remote" "${REMOTE_NAME}")  $(status_chip "Pull" "$(bool_word "$(toggle_bool "${SKIP_PULL}")")")  $(status_chip "Deploy" "$(bool_word "$(toggle_bool "${SKIP_DEPLOY}")")")"
  echo -e "  $(status_chip "DirtyOK" "$(bool_word "${ALLOW_DIRTY}")")  $(status_chip "Sudo" "$(update_sudo_mode_label)")  $(status_chip "Spinner" "$(spinner_ui_word)")"
  if [[ "${SKIP_DEPLOY}" == false ]]; then
    echo -e "  $(status_chip "Deps" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")")  $(status_chip "Cron" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")")  $(status_chip "DB" "$(update_migration_mode_label)")  $(status_chip "SSL" "$(bool_word "${SSL_SETUP}")")"
  fi
  echo ""
  print_tui_panel_rule 92
  echo -e "${BOLD}  Update Workflow Options${NC}"
  print_tui_panel_rule 92
  print_tui_option_row "1" "Branch" "${BRANCH}"
  print_tui_option_desc "Branch to fetch/pull and pass through to deploy.sh."
  print_tui_option_row "2" "Remote" "${REMOTE_NAME}"
  print_tui_option_desc "Git remote used for fetch/pull (usually origin)."
  print_tui_option_row "3" "Pull latest changes" "$(bool_word "$(toggle_bool "${SKIP_PULL}")")"
  print_tui_option_desc "ON performs git fetch + ff-only pull before deployment."
  print_tui_option_row "4" "Run deploy after pull" "$(bool_word "$(toggle_bool "${SKIP_DEPLOY}")")"
  print_tui_option_desc "ON runs deploy.sh after git update; OFF only updates the repo checkout."
  print_tui_option_row "5" "Allow dirty worktree" "$(bool_word "${ALLOW_DIRTY}")"
  print_tui_option_desc "ON allows update/deploy even if tracked files are modified locally."
  print_tui_option_row "6" "Sudo deploy mode" "$(update_sudo_mode_label)"
  print_tui_option_desc "Cycles deploy invocation between auto, forced sudo, and forced no-sudo."
  print_tui_option_row "7" "Dependencies" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")"
  print_tui_option_desc "ON runs normal npm install in deploy.sh. OFF passes --skip-deps (faster, riskier after package changes)."
  print_tui_option_row "8" "Cron jobs sync" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")"
  print_tui_option_desc "ON lets deploy.sh install/update managed crontab jobs. OFF passes --skip-cron."
  print_tui_option_row "9" "Spinner UI" "$(spinner_ui_word)"
  print_tui_option_desc "Animated progress spinner for git/deploy wrapper steps."
  if [[ "${SKIP_DEPLOY}" == false ]]; then
    print_tui_panel_rule 92
    echo -e "${BOLD}  Deploy Pass-through Options${NC}"
    print_tui_panel_rule 92
    print_tui_option_row "10" "Database mode" "$(update_migration_mode_label)"
    print_tui_option_desc "Cycles deploy DB behavior: migrate deploy / skip migrations / db push."
    print_tui_option_row "11" "SSL setup" "$(bool_word "${SSL_SETUP}")"
    print_tui_option_desc "Passes SSL setup flags to deploy.sh to run certbot + nginx config."
    if [[ "${SSL_SETUP}" == true ]]; then
      print_tui_option_row "12" "SSL domain" "${SSL_DOMAIN:-melbourneguitarschool.com.au}"
      print_tui_option_desc "Domain used for certificate request and nginx server_name config."
      print_tui_option_row "13" "Certbot email" "${SSL_EMAIL:-melbourneguitarschool@gmail.com}"
      print_tui_option_desc "Email for Let's Encrypt registration and renewal alerts."
    fi
  fi
  echo ""
  print_tui_panel_rule 92
  echo -e "  ${BOLD}S${NC}  Start update/deploy    ${BOLD}Q${NC}  Cancel"
  echo -e "${DIM}Tip: deploy.sh handles migrations/nginx sync/restarts; this menu configures the wrapper + pass-through flags.${NC}"
}

# Spinner start routine used by run_step for long-running git commands.
start_spinner() {
  local msg="$1"
  local i=0
  local frame_count="${#SPINNER_FRAMES[@]}"

  [[ "${NO_SPINNER}" == true || "${IS_TTY}" != true ]] && return 0

  SPINNER_MSG="${msg}"
  (
    while true; do
      printf "\r${CYAN}%s${NC} %s ${DIM}%s${NC}" "${SPINNER_FRAMES[$i]}" "${SPINNER_MSG}" "working..."
      i=$(( (i + 1) % frame_count ))
      sleep 0.08
    done
  ) &
  SPINNER_PID=$!
}

# Spinner stop routine prints a stable success/failure line after each command.
stop_spinner() {
  local status="$1"
  local final_icon=""
  local final_color=""

  [[ "${NO_SPINNER}" == true || "${IS_TTY}" != true ]] && return 0

  if [[ -n "${SPINNER_PID}" ]] && kill -0 "${SPINNER_PID}" 2>/dev/null; then
    kill "${SPINNER_PID}" 2>/dev/null || true
    wait "${SPINNER_PID}" 2>/dev/null || true
  fi

  if [[ "${status}" == "ok" ]]; then
    final_icon="✔"
    final_color="${GREEN}"
  else
    final_icon="✖"
    final_color="${RED}"
  fi

  printf "\r${final_color}%s${NC} %s%*s\n" "${final_icon}" "${SPINNER_MSG}" 10 ""
  SPINNER_PID=""
  SPINNER_MSG=""
}

# Runs a command with captured logs and spinner output; on failure prints tail.
run_step() {
  local message="$1"
  shift

  local log_file
  log_file="$(mktemp)"

  start_spinner "${message}"
  if "$@" >"${log_file}" 2>&1; then
    stop_spinner "ok"
    [[ "${NO_SPINNER}" == true || "${IS_TTY}" != true ]] && log_info "${message}"
    rm -f "${log_file}"
    return 0
  fi

  stop_spinner "fail"
  log_error "${message} failed"
  echo -e "${DIM}--- command output (tail) ---${NC}"
  tail -n 40 "${log_file}" || true
  echo -e "${DIM}-----------------------------${NC}"
  rm -f "${log_file}"
  return 1
}

# Detects total system RAM in MB using Linux or macOS system interfaces. The
# update wrapper uses this to mirror deploy.sh's build-memory safety behavior
# and to pass NODE_OPTIONS through sudo when needed.
detect_total_ram_mb() {
  local mem_kb=""

  if [[ -r "/proc/meminfo" ]]; then
    mem_kb="$(awk '/^MemTotal:/ { print $2; exit }' /proc/meminfo 2>/dev/null || true)"
    if [[ "${mem_kb}" =~ ^[0-9]+$ ]] && (( mem_kb > 0 )); then
      echo $((mem_kb / 1024))
      return 0
    fi
  fi

  if command -v sysctl >/dev/null 2>&1; then
    local mem_bytes=""
    mem_bytes="$(sysctl -n hw.memsize 2>/dev/null || true)"
    if [[ "${mem_bytes}" =~ ^[0-9]+$ ]] && (( mem_bytes > 0 )); then
      echo $((mem_bytes / 1024 / 1024))
      return 0
    fi
  fi

  return 1
}

# Mirrors deploy.sh's auto heap override so update.sh can preserve the computed
# NODE_OPTIONS value when invoking deploy.sh via sudo (which may drop env vars).
ensure_build_node_options() {
  local heap_mb="${DEFAULT_BUILD_NODE_HEAP_MB}"
  local heap_flag=""
  local total_ram_mb=""
  local should_auto_override=false

  if [[ "${NODE_OPTIONS:-}" == *"--max-old-space-size="* ]]; then
    log_info "Using existing NODE_OPTIONS heap setting"
    return 0
  fi

  total_ram_mb="$(detect_total_ram_mb)"
  if [[ -z "${total_ram_mb}" ]]; then
    log_info "Could not detect system RAM; leaving NODE_OPTIONS heap limit unchanged"
    return 0
  fi

  if (( total_ram_mb >= LOW_RAM_1GB_AUTO_HEAP_MIN_MB && total_ram_mb <= LOW_RAM_1GB_AUTO_HEAP_MAX_MB )); then
    should_auto_override=true
    heap_mb="${LOW_RAM_1GB_AUTO_HEAP_MB}"
  elif (( total_ram_mb >= LOW_RAM_2GB_AUTO_HEAP_MIN_MB && total_ram_mb <= LOW_RAM_2GB_AUTO_HEAP_MAX_MB )); then
    should_auto_override=true
    heap_mb="${LOW_RAM_2GB_AUTO_HEAP_MB}"
  fi

  if [[ "${should_auto_override}" != true ]]; then
    log_info "Detected ${total_ram_mb}MB RAM; skipping auto heap override"
    return 0
  fi

  heap_flag="--max-old-space-size=${heap_mb}"

  if [[ -n "${NODE_OPTIONS:-}" ]]; then
    export NODE_OPTIONS="${NODE_OPTIONS} ${heap_flag}"
  else
    export NODE_OPTIONS="${heap_flag}"
  fi

  log_info "Applied auto NODE_OPTIONS heap limit for ${total_ram_mb}MB RAM: ${heap_flag}"
}

# Removes local wrapper-side caches (repo build caches and the invoking user's
# npm cache) before/after delegating to deploy.sh. This keeps the persistent git
# clone from growing over time and reclaims space consumed during failed runs.
cleanup_local_install_and_build_caches() {
  local removed=0
  local path=""
  local npm_cache_root="${HOME:-/root}/.npm"

  for path in \
    "${REPO_ROOT:-$(pwd)}/.next/cache" \
    "${REPO_ROOT:-$(pwd)}/node_modules/.cache" \
    "${npm_cache_root}/_cacache" \
    "${npm_cache_root}/_logs"
  do
    [[ -e "${path}" ]] || continue
    if ! rm -rf "${path}"; then
      # When previous deploys ran with sudo, repo-local caches can become
      # root-owned. If sudo deploy is enabled and auth is already primed, retry
      # repo-path cleanup via sudo without prompting again.
      if [[ -n "${REPO_ROOT:-}" && "${path}" == "${REPO_ROOT}"/* ]] && should_use_sudo_for_deploy; then
        if sudo -n rm -rf "${path}" 2>/dev/null; then
          removed=$((removed + 1))
          log_info "Removed cache path via sudo: ${path}"
          continue
        fi
      fi

      log_warn "Failed to remove cache path: ${path}"
      continue
    fi
    removed=$((removed + 1))
    log_info "Removed cache path: ${path}"
  done

  if command -v npm >/dev/null 2>&1; then
    if npm cache clean --force >/dev/null 2>&1; then
      log_info "Cleared npm cache metadata"
    else
      log_warn "npm cache clean failed; continuing update workflow"
    fi
  fi

  if (( removed == 0 )); then
    log_info "No local install/build caches removed"
  fi
}

# Returns 0 if the git working tree has tracked or staged changes.
git_worktree_dirty() {
  ! git diff --quiet || ! git diff --cached --quiet
}

# Returns the current git branch name or empty string if HEAD is detached.
current_branch_name() {
  git branch --show-current 2>/dev/null || true
}

# Resolves whether deploy.sh should be invoked via sudo based on flags/user.
should_use_sudo_for_deploy() {
  if [[ "${FORCE_NO_SUDO_DEPLOY}" == true ]]; then
    return 1
  fi
  if [[ "${FORCE_SUDO_DEPLOY}" == true ]]; then
    return 0
  fi
  if [[ ${EUID} -eq 0 ]]; then
    return 1
  fi
  command -v sudo >/dev/null 2>&1
}

# Prompts for sudo once (or verifies cached auth in non-interactive runs) so the
# workflow fails early and subsequent sudo calls can run without extra prompts.
ensure_sudo_for_deploy_ready() {
  if ! should_use_sudo_for_deploy; then
    return 0
  fi

  if [[ "${SUDO_DEPLOY_AUTH_READY}" == true ]]; then
    return 0
  fi

  if [[ "${IS_TTY}" == true ]]; then
    log_info "Authenticating sudo for deployment..."
    if ! sudo -v; then
      log_error "Sudo authentication failed. Deployment cannot continue."
      exit 1
    fi
  else
    if ! sudo -n true 2>/dev/null; then
      log_error "Sudo access is required for deployment. Re-run interactively or configure passwordless sudo for deploy commands."
      exit 1
    fi
  fi

  SUDO_DEPLOY_AUTH_READY=true
}

# Interactive menu flow for the update wrapper. It mirrors deploy.sh options
# and adds git update controls so operators can run one command end-to-end.
run_interactive_setup() {
  local choice=""

  while true; do
    print_update_tui_menu
    read -r -p "Select option [1-13, s, q]: " choice

    case "${choice,,}" in
      1)
        BRANCH="$(prompt_value "Git branch to update/deploy" "${BRANCH}")"
        ;;
      2)
        REMOTE_NAME="$(prompt_value "Git remote" "${REMOTE_NAME}")"
        ;;
      3)
        SKIP_PULL="$(toggle_bool "${SKIP_PULL}")"
        ;;
      4)
        SKIP_DEPLOY="$(toggle_bool "${SKIP_DEPLOY}")"
        if [[ "${SKIP_DEPLOY}" == true ]]; then
          SSL_SETUP=false
        fi
        ;;
      5)
        ALLOW_DIRTY="$(toggle_bool "${ALLOW_DIRTY}")"
        ;;
      6)
        cycle_update_sudo_mode
        ;;
      7)
        if [[ "${SKIP_DEPLOY}" == false ]]; then
          SKIP_DEPS="$(toggle_bool "${SKIP_DEPS}")"
        else
          log_warn "Enable deploy first to change deploy pass-through options."
        fi
        ;;
      8)
        if [[ "${SKIP_DEPLOY}" == false ]]; then
          SKIP_CRON_SETUP="$(toggle_bool "${SKIP_CRON_SETUP}")"
        else
          log_warn "Enable deploy first to change deploy pass-through options."
        fi
        ;;
      9)
        NO_SPINNER="$(toggle_bool "${NO_SPINNER}")"
        ;;
      10)
        if [[ "${SKIP_DEPLOY}" == false ]]; then
          cycle_update_migration_mode
        else
          log_warn "Enable deploy first to change deploy pass-through options."
        fi
        ;;
      11)
        if [[ "${SKIP_DEPLOY}" == false ]]; then
          SSL_SETUP="$(toggle_bool "${SSL_SETUP}")"
          if [[ "${SSL_SETUP}" == true ]]; then
            [[ -n "${SSL_DOMAIN}" ]] || SSL_DOMAIN="melbourneguitarschool.com.au"
            [[ -n "${SSL_EMAIL}" ]] || SSL_EMAIL="melbourneguitarschool@gmail.com"
          fi
        else
          log_warn "Enable deploy first to configure SSL options."
        fi
        ;;
      12)
        if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
          SSL_DOMAIN="$(prompt_value "SSL domain" "${SSL_DOMAIN:-melbourneguitarschool.com.au}")"
        else
          log_warn "Enable deploy + SSL setup first to edit SSL domain."
        fi
        ;;
      13)
        if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
          SSL_EMAIL="$(prompt_value "Certbot email" "${SSL_EMAIL:-melbourneguitarschool@gmail.com}")"
        else
          log_warn "Enable deploy + SSL setup first to edit Certbot email."
        fi
        ;;
      s)
        break
        ;;
      q)
        log_warn "Update cancelled."
        exit 0
        ;;
      *)
        log_warn "Unknown selection. Choose a menu number, S, or Q."
        ;;
    esac
  done
}

# Prints a compact summary before execution to make operator intent explicit.
print_summary() {
  local sudo_mode="false"
  local will_pull="true"
  local will_deploy="true"
  if should_use_sudo_for_deploy; then
    sudo_mode="true"
  fi
  if [[ "${SKIP_PULL}" == true ]]; then
    will_pull="false"
  fi
  if [[ "${SKIP_DEPLOY}" == true ]]; then
    will_deploy="false"
  fi

  section "Update Summary"
  echo -e "  ${BOLD}Workflow${NC}"
  print_tui_panel_rule 62
  print_summary_row "Repo" "$(pwd)"
  print_summary_row "Remote" "${REMOTE_NAME}"
  print_summary_row "Branch" "${BRANCH}"
  print_summary_row "Git pull" "${will_pull}"
  print_summary_row "Run deploy" "${will_deploy}"
  print_summary_row "Allow dirty" "$(bool_word "${ALLOW_DIRTY}")"
  print_summary_row "Sudo mode" "$(update_sudo_mode_label)"
  print_summary_row "Spinner UI" "$(spinner_ui_word)"
  if [[ "${SKIP_DEPLOY}" == false ]]; then
    print_tui_panel_rule 62
    echo -e "  ${BOLD}Deploy Pass-through${NC}"
    print_tui_panel_rule 62
    print_summary_row "Effective sudo" "${sudo_mode}"
    print_summary_row "Install deps" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")"
    print_summary_row "Cron jobs sync" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")"
    print_summary_row "Database mode" "$(update_migration_mode_label)"
    print_summary_row "SSL setup" "$(bool_word "${SSL_SETUP}")"
    if [[ "${SSL_SETUP}" == true ]]; then
      print_summary_row "SSL domain" "${SSL_DOMAIN}"
      print_summary_row "Certbot email" "${SSL_EMAIL}"
    fi
  fi
  print_tui_panel_rule 62
}

# Builds and executes the deploy.sh command, passing through compatible flags.
# `deploy.sh` owns migrations, baseline recovery, nginx template sync, and
# service/nginx restarts; this wrapper only prepares git state and invocation.
run_deploy() {
  if [[ ! -x "${DEPLOY_SCRIPT}" ]]; then
    log_error "deploy.sh not found or not executable at ${DEPLOY_SCRIPT}"
    exit 1
  fi

  local deploy_args=()
  deploy_args+=( "--branch" "${BRANCH}" )
  [[ "${SKIP_DEPS}" == true ]] && deploy_args+=( "--skip-deps" )
  [[ "${SKIP_CRON_SETUP}" == true ]] && deploy_args+=( "--skip-cron" )
  [[ "${SKIP_MIGRATE}" == true ]] && deploy_args+=( "--skip-migrate" )
  [[ "${DB_PUSH}" == true ]] && deploy_args+=( "--db-push" )
  [[ "${SSL_SETUP}" == true ]] && deploy_args+=( "--ssl" "--domain" "${SSL_DOMAIN}" "--email" "${SSL_EMAIL}" )
  [[ "${NO_SPINNER}" == true ]] && deploy_args+=( "--no-spinner" )
  [[ "${NO_COLOR}" == true ]] && deploy_args+=( "--no-color" )

  section "Deploy"
  ensure_build_node_options
  if should_use_sudo_for_deploy; then
    ensure_sudo_for_deploy_ready
  fi
  log_info "Pre-deploy cache cleanup..."
  cleanup_local_install_and_build_caches
  log_info "Invoking ${DEPLOY_SCRIPT} ${deploy_args[*]}"

  if should_use_sudo_for_deploy; then
    # Pass through computed heap settings because `sudo` typically drops env vars
    # and deploy.sh uses them before npm/prisma/build steps begin.
    local sudo_env_args=()
    if [[ -n "${NODE_OPTIONS:-}" ]]; then
      sudo_env_args+=( "NODE_OPTIONS=${NODE_OPTIONS}" )
    fi
    if [[ -n "${NEXT_LOW_MEMORY_BUILD:-}" ]]; then
      sudo_env_args+=( "NEXT_LOW_MEMORY_BUILD=${NEXT_LOW_MEMORY_BUILD}" )
    fi

    if (( ${#sudo_env_args[@]} > 0 )); then
      sudo env "${sudo_env_args[@]}" "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
    else
      sudo "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
    fi
  else
    "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
  fi

  log_info "Post-deploy cache cleanup..."
  cleanup_local_install_and_build_caches
}

# Parse CLI arguments before interactive setup/validation.
ARG_COUNT=$#
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --remote) REMOTE_NAME="$2"; shift 2 ;;
    --skip-pull) SKIP_PULL=true; shift ;;
    --skip-deploy) SKIP_DEPLOY=true; shift ;;
    --skip-deps) SKIP_DEPS=true; shift ;;
    --skip-cron) SKIP_CRON_SETUP=true; shift ;;
    --skip-migrate) SKIP_MIGRATE=true; shift ;;
    --db-push) DB_PUSH=true; shift ;;
    --ssl) SSL_SETUP=true; shift ;;
    --domain) SSL_DOMAIN="$2"; shift 2 ;;
    --email) SSL_EMAIL="$2"; shift 2 ;;
    --allow-dirty) ALLOW_DIRTY=true; shift ;;
    --sudo-deploy) FORCE_SUDO_DEPLOY=true; shift ;;
    --no-sudo-deploy) FORCE_NO_SUDO_DEPLOY=true; shift ;;
    --interactive) INTERACTIVE=true; shift ;;
    --no-spinner) NO_SPINNER=true; shift ;;
    --no-color) NO_COLOR=true; shift ;;
    --help|-h) show_usage; exit 0 ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

detect_tty_capabilities

if [[ "${MGS_RETURN_TO_MENU_AFTER_SELF_UPDATE:-}" == "1" && "${IS_TTY}" == true ]]; then
  INTERACTIVE=true
  unset MGS_RETURN_TO_MENU_AFTER_SELF_UPDATE
fi

# Default to interactive mode for local operator runs with no flags.
if [[ "${IS_TTY}" == true && "${INTERACTIVE}" == false ]]; then
  if [[ "${ARG_COUNT}" -eq 0 ]]; then
    INTERACTIVE=true
  fi
fi

if [[ "${INTERACTIVE}" == true && "${IS_TTY}" != true ]]; then
  log_warn "--interactive requested, but no TTY detected. Continuing non-interactively."
  INTERACTIVE=false
fi

print_banner

# Validate repository context early because this script is intended for a git clone.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log_error "This script must be run from inside the application git repository."
  exit 1
fi

# Normalize to the repository root so git commands and the deploy script run from
# a stable source directory even when the operator starts this script in ./deploy.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"
log_info "Repository root: ${REPO_ROOT}"

if [[ -z "${BRANCH}" ]]; then
  BRANCH="$(current_branch_name)"
fi
if [[ -z "${BRANCH}" ]]; then
  BRANCH="main"
  log_warn "Could not determine current branch (detached HEAD). Defaulting to ${BRANCH}."
fi

if [[ "${DB_PUSH}" == true ]]; then
  SKIP_MIGRATE=true
fi

if [[ "${SSL_SETUP}" == true && ( -z "${SSL_DOMAIN}" || -z "${SSL_EMAIL}" ) && "${INTERACTIVE}" == false ]]; then
  log_error "SSL setup requires --domain and --email when running non-interactively."
  exit 1
fi

if [[ "${INTERACTIVE}" == true ]]; then
  run_interactive_setup
fi

print_summary

if [[ "${INTERACTIVE}" == true ]]; then
  if ! prompt_yes_no "Start update/deploy with these settings?" "y"; then
    log_warn "Update cancelled."
    exit 0
  fi
fi

if [[ "${SKIP_DEPLOY}" == false ]]; then
  ensure_sudo_for_deploy_ready
fi

section "Git Update"
log_info "Repository branch: $(current_branch_name)"

if [[ "${ALLOW_DIRTY}" != true ]] && git_worktree_dirty; then
  log_error "Working tree is dirty. Commit/stash changes or rerun with --allow-dirty."
  git status --short
  exit 1
fi

if [[ "${SKIP_PULL}" == false ]]; then
  local_before_pull_commit="$(git rev-parse --short=12 HEAD 2>/dev/null || true)"
  # Fetch/pull stays in the persistent repo clone; deploy.sh then rsyncs a clean
  # release directory so runtime symlink switches remain atomic.
  run_step "Fetching ${REMOTE_NAME}/${BRANCH}" git fetch "${REMOTE_NAME}" "${BRANCH}"

  if [[ "$(current_branch_name)" != "${BRANCH}" ]]; then
    run_step "Checking out ${BRANCH}" git checkout "${BRANCH}"
  fi

  # Use ff-only to avoid accidental merge commits on production clones.
  run_step "Pulling latest ${REMOTE_NAME}/${BRANCH}" git pull --ff-only "${REMOTE_NAME}" "${BRANCH}"
  local_after_pull_commit="$(git rev-parse --short=12 HEAD 2>/dev/null || true)"
  log_info "Updated to commit $(git rev-parse --short HEAD)"
  maybe_restart_after_self_update "${local_before_pull_commit}" "${local_after_pull_commit}"
else
  log_info "Skipping git pull"
fi

if [[ "${SKIP_DEPLOY}" == false ]]; then
  run_deploy
else
  section "Deploy"
  log_info "Skipping deployment"
fi

section "Complete"
log_info "Update workflow finished"
