#!/bin/bash
# =============================================================================
# LessonFlow - Update + Deploy Script
# =============================================================================
# Pulls the latest git changes for a branch or deploys the current archive
# source tree, then runs the deployment script. Designed for server-side source
# directories such as a persistent git clone (for example ~/lessonflow) or an
# extracted release archive managed outside /var/www/lessonflow.
# [TEST COMMIT: 2026-03-11 v3 - additional fake commit]
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
#   --domain DOMAIN      SSL domain (auto-detected from host config when omitted)
#   --email EMAIL        SSL certificate email (read from certbot config when omitted)
#   --allow-dirty        Allow git pull/deploy even if working tree is dirty
#   --sudo-deploy        Force sudo when invoking deploy.sh
#   --no-sudo-deploy     Do not use sudo when invoking deploy.sh
#   --interactive        Prompt for update/deploy options in TTY mode
#   --install-nginx      Install Nginx (if needed) using setup-packages.sh in non-interactive mode
#   --install-php-fpm-if-needed  Install PHP-FPM only if deploy nginx config indicates a PHP upstream is required
#   --install-cron       Install cron/crond scheduler (if needed) and enable/start service
#   --install-app-service  Install/update the app systemd unit and enable service
#   --install-cron-jobs  Install/update managed cron jobs and restart cron (best effort)
#   --no-auto-bootstrap  Disable automatic bootstrap detection for missing host setup
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
DETECTED_SOURCE_PATH=""
SOURCE_MODE="unknown"
SOURCE_MODE_DETAIL=""
ORIGINAL_ARGS=( "$@" )

# Runtime configuration defaults. Branch defaults to the current checked-out
# branch later for git-backed installs; archive installs simply deploy the
# current source tree.
APP_NAME="lessonflow"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/${APP_NAME}}"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
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
CLI_SSL_FLAG_SET=false
CLI_SSL_DOMAIN_SET=false
CLI_SSL_EMAIL_SET=false
ALLOW_DIRTY=false
FORCE_SUDO_DEPLOY=false
FORCE_NO_SUDO_DEPLOY=false
INTERACTIVE=false
INSTALL_NGINX_IF_NEEDED=false
INSTALL_PHP_FPM_IF_NEEDED=false
INSTALL_CRON_IF_NEEDED=false
INSTALL_APP_SERVICE_IF_NEEDED=false
INSTALL_CRON_JOBS_IF_NEEDED=false
AUTO_BOOTSTRAP=true
NO_SPINNER=false
NO_COLOR=false
IS_TTY=false
SPINNER_PID=""
SPINNER_MSG=""
SPINNER_FRAMES=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
UPDATE_TUI_PANEL_WIDTH=92
UPDATE_TUI_PANEL_WIDTH_MAX=120
SUDO_DEPLOY_AUTH_READY=false
DEFAULT_BUILD_NODE_HEAP_MB="${DEFAULT_BUILD_NODE_HEAP_MB:-6144}"
LOW_RAM_1GB_AUTO_HEAP_MB="${LOW_RAM_1GB_AUTO_HEAP_MB:-3072}"
LOW_RAM_2GB_AUTO_HEAP_MB="${LOW_RAM_2GB_AUTO_HEAP_MB:-2048}"
LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
REMOTE_UPDATE_CHECK_TTL_SECONDS=15
TUI_REMOTE_UPDATE_CACHE_KEY=""
TUI_REMOTE_UPDATE_CACHE_AT=0
TUI_REMOTE_UPDATE_STATUS="unknown"
TUI_REMOTE_UPDATE_REMOTE_SHORT=""
TUI_REMOTE_UPDATE_REMOTE_SUBJECT=""
TUI_REMOTE_UPDATE_LOCAL_SHORT=""
TUI_REMOTE_UPDATE_ERROR=""

# ANSI color palette shared with deploy.sh for consistent terminal UX.
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

# Prints a concise usage block suitable for operators and automation logs.
show_usage() {
  cat <<'EOF'
LessonFlow - Update + Deploy Script

Usage: ./deploy/update.sh [options]

Behavior:
  - In a git checkout, this script can fetch/pull and then deploy.
  - In an extracted archive source tree, this script skips git actions and deploys the current files on disk.

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
  --domain DOMAIN      SSL domain (auto-detected from host config when omitted)
  --email EMAIL        SSL certificate email (read from certbot config when omitted)
  --allow-dirty        Allow git pull/deploy even if working tree is dirty
  --sudo-deploy        Force sudo when invoking deploy.sh
  --no-sudo-deploy     Do not use sudo when invoking deploy.sh
  --interactive        Prompt for update/deploy options in TTY mode
  --install-nginx      Install Nginx (if needed) using setup-packages.sh in non-interactive mode
  --install-php-fpm-if-needed  Install PHP-FPM only when deploy nginx config uses PHP upstreams
  --install-cron       [DEPRECATED] Install cron/crond scheduler (systemd timers now used instead)
  --install-app-service  Install/update the app systemd unit and enable service
  --install-cron-jobs  Install/update systemd timer units for scheduled jobs (default: ON)
  --no-auto-bootstrap  Disable automatic bootstrap detection for missing host setup
  --no-spinner         Disable spinner UI
  --no-color           Disable colored output
  --help, -h           Show usage
EOF
}

detect_source_mode_for_path() {
  local candidate_dir="$1"
  local resolved_dir=""

  if [[ -z "${candidate_dir}" ]]; then
    DETECTED_SOURCE_PATH=""
    SOURCE_MODE="invalid"
    SOURCE_MODE_DETAIL="No source directory was provided."
    return 1
  fi

  if [[ -d "${candidate_dir}" ]]; then
    resolved_dir="$(cd "${candidate_dir}" 2>/dev/null && pwd || true)"
  fi
  if [[ -z "${resolved_dir}" ]]; then
    resolved_dir="${candidate_dir}"
  fi

  if [[ -d "${resolved_dir}/.git" ]]; then
    # RATIONALE: Git mode unlocks fetch/pull, remote-update previews, and branch
    # selection. Without `.git`, the wrapper must treat the tree as a static snapshot.
    DETECTED_SOURCE_PATH="${resolved_dir}"
    SOURCE_MODE="git"
    SOURCE_MODE_DETAIL="Persistent git checkout"
    return 0
  fi

  if [[ -f "${resolved_dir}/package.json" && -f "${resolved_dir}/package-lock.json" && -d "${resolved_dir}/deploy" ]]; then
    # NOTE: Archive mode still expects a complete app source tree, just without
    # VCS metadata. That lets update.sh skip git while still delegating to deploy.sh.
    DETECTED_SOURCE_PATH="${resolved_dir}"
    SOURCE_MODE="archive"
    SOURCE_MODE_DETAIL="Extracted release archive or copied source tree"
    return 0
  fi

  DETECTED_SOURCE_PATH="${resolved_dir}"
  SOURCE_MODE="invalid"
  SOURCE_MODE_DETAIL="Expected package.json, package-lock.json, and deploy/ in the source tree."
  return 1
}

source_mode_label() {
  case "${SOURCE_MODE}" in
    git)
      echo "git checkout"
      ;;
    archive)
      echo "archive/copy"
      ;;
    invalid)
      echo "invalid"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

resolve_source_root_for_update() {
  local resolved=""

  if git -C "${PWD}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    resolved="$(git -C "${PWD}" rev-parse --show-toplevel)"
  elif [[ -f "${PWD}/package.json" && -d "${PWD}/deploy" ]]; then
    resolved="$(cd "${PWD}" 2>/dev/null && pwd || printf '%s' "${PWD}")"
  elif [[ -f "${SCRIPT_DIR}/../package.json" && -d "${SCRIPT_DIR}/../deploy" ]]; then
    resolved="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd || printf '%s' "${SCRIPT_DIR}/..")"
  else
    # NOTE: Falling back to PWD preserves a debuggable path even when update.sh
    # is launched from an incomplete or mislocated snapshot.
    resolved="${PWD}"
  fi

  # RATIONALE: Source resolution is centralized here so every later decision
  # (pull allowed, branch default, deploy handoff) works from the same root.
  detect_source_mode_for_path "${resolved}" || true
  REPO_ROOT="${DETECTED_SOURCE_PATH:-${resolved}}"
}

# Detect terminal capabilities so the script degrades cleanly in CI/non-TTY runs.
detect_tty_capabilities() {
  if [[ -t 0 && -t 1 ]]; then
    IS_TTY=true
  fi

  if [[ "${IS_TTY}" == true ]]; then
    auto_size_tui_panel_width
  fi

  if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' BLINK='' DIM='' NC=''
  fi
}

# Sizes the TUI panel to the active terminal width while keeping a readable max
# width on wide terminals. This helps the update wrapper fit split panes and
# smaller SSH windows without manual width tweaks.
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
  if (( target_width > UPDATE_TUI_PANEL_WIDTH_MAX )); then
    target_width="${UPDATE_TUI_PANEL_WIDTH_MAX}"
  fi

  UPDATE_TUI_PANEL_WIDTH="${target_width}"
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
  print_box_banner "LessonFlow Update v${app_version}"
}

# Extracts the first useful server_name token from an nginx site config so the
# wrapper can prefill SSL domain values from an existing production host.
read_first_nginx_server_name_domain() {
  local nginx_conf="$1"

  [[ -r "${nginx_conf}" ]] || return 1

  awk '
    /^[[:space:]]*server_name[[:space:]]+/ {
      for (i = 2; i <= NF; i++) {
        gsub(/;/, "", $i)
        if ($i == "" || $i == "_" || $i == "localhost" || $i ~ /^\$/) {
          continue
        }
        print $i
        exit
      }
    }
  ' "${nginx_conf}" 2>/dev/null
}

# Extracts all useful server_name tokens from an nginx site config so the update
# wrapper can infer the canonical non-www host when both names are present.
read_nginx_server_name_domains() {
  local nginx_conf="$1"

  [[ -r "${nginx_conf}" ]] || return 1

  awk '
    /^[[:space:]]*server_name[[:space:]]+/ {
      for (i = 2; i <= NF; i++) {
        gsub(/;/, "", $i)
        if ($i == "" || $i == "_" || $i == "localhost" || $i ~ /^\$/) {
          continue
        }
        if (!seen[$i]++) {
          print $i
        }
      }
    }
  ' "${nginx_conf}" 2>/dev/null
}

# Reads the domain segment from a LetsEncrypt ssl_certificate path in nginx
# config, e.g. /etc/letsencrypt/live/example.com/fullchain.pem -> example.com.
read_letsencrypt_domain_from_nginx_config() {
  local nginx_conf="$1"

  [[ -r "${nginx_conf}" ]] || return 1

  awk '
    match($0, /ssl_certificate[[:space:]]+\/etc\/letsencrypt\/live\/([^/]+)\/fullchain\.pem/, m) {
      print m[1]
      exit
    }
  ' "${nginx_conf}" 2>/dev/null
}

cert_files_exist_for_domain() {
  local domain="$1"

  [[ -n "${domain}" ]] || return 1
  [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" && -f "/etc/letsencrypt/live/${domain}/privkey.pem" ]]
}

ssl_email_required_for_domain() {
  local domain="$1"

  [[ -n "${domain}" ]] || return 0

  if cert_files_exist_for_domain "${domain}"; then
    return 1
  fi

  if [[ "${domain}" == www.* ]]; then
    cert_files_exist_for_domain "${domain#www.}" && return 1
  else
    cert_files_exist_for_domain "www.${domain}" && return 1
  fi

  return 0
}

# Reads the preferred SSL contact email from the deployed shared env, allowing
# operators to persist it as SSL_EMAIL and fall back to ADMIN_EMAIL when needed.
read_ssl_email_from_shared_env() {
  local shared_env_path="${SHARED_DIR}/.env"
  local shared_ssl_email=""
  local shared_admin_email=""

  [[ -f "${shared_env_path}" ]] || return 1

  shared_ssl_email="$(read_env_file_value_from_update "${shared_env_path}" "SSL_EMAIL" || true)"
  if [[ -n "${shared_ssl_email}" ]]; then
    printf '%s\n' "${shared_ssl_email}"
    return 0
  fi

  shared_admin_email="$(read_env_file_value_from_update "${shared_env_path}" "ADMIN_EMAIL" || true)"
  [[ -n "${shared_admin_email}" ]] || return 1
  printf '%s\n' "${shared_admin_email}"
}

# Best-effort host config discovery for update.sh defaults. It infers whether
# SSL is already configured on the server and pre-fills domain/email where
# readable, so operators do not need to re-toggle SSL settings every run.
detect_previous_deploy_defaults_from_host() {
  local nginx_conf=""
  local nginx_candidates=(
    "/etc/nginx/sites-available/${APP_NAME}"
    "/etc/nginx/sites-enabled/${APP_NAME}"
  )
  local ssl_detected=false
  local detected_domain=""
  local detected_cert_domain=""
  local detected_email=""
  local cli_ini="/etc/letsencrypt/cli.ini"
  local changed=false
  local candidate=""
  local domain=""
  local -a domains=()

  for candidate in "${nginx_candidates[@]}"; do
    if [[ -r "${candidate}" ]]; then
      nginx_conf="${candidate}"
      break
    fi
  done

  if [[ -n "${nginx_conf}" ]]; then
    mapfile -t domains < <(read_nginx_server_name_domains "${nginx_conf}" || true)

    if grep -E -q '^[[:space:]]*listen[[:space:]].*443|^[[:space:]]*ssl_certificate[[:space:]]+' "${nginx_conf}" 2>/dev/null; then
      ssl_detected=true
    fi

    for domain in "${domains[@]}"; do
      if [[ "${domain}" == www.* ]]; then
        local bare_domain="${domain#www.}"
        local other=""
        for other in "${domains[@]}"; do
          if [[ "${other}" == "${bare_domain}" ]]; then
            detected_domain="${bare_domain}"
            break 2
          fi
        done
      fi
    done

    if [[ -z "${detected_domain}" ]]; then
      for domain in "${domains[@]}"; do
        if [[ "${domain}" != www.* ]]; then
          detected_domain="${domain}"
          break
        fi
      done
    fi

    detected_cert_domain="$(read_letsencrypt_domain_from_nginx_config "${nginx_conf}" || true)"
    if [[ -z "${detected_domain}" && -n "${detected_cert_domain}" ]]; then
      if [[ "${detected_cert_domain}" == www.* ]]; then
        detected_domain="${detected_cert_domain#www.}"
      else
        detected_domain="${detected_cert_domain}"
      fi
    fi

    if [[ "${ssl_detected}" != true ]]; then
      for domain in "${detected_cert_domain}" "${detected_domain}" "www.${detected_domain}"; do
        if cert_files_exist_for_domain "${domain}"; then
          ssl_detected=true
          break
        fi
      done
    fi
  fi

  if [[ -z "${detected_email}" && -r "${cli_ini}" ]]; then
    detected_email="$(awk -F'=' '
      /^[[:space:]]*email[[:space:]]*=/ {
        v=$2
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        print v
        exit
      }
    ' "${cli_ini}" 2>/dev/null || true)"
  fi

  if [[ -z "${detected_email}" ]]; then
    detected_email="$(read_ssl_email_from_shared_env || true)"
  fi

  if [[ "${ssl_detected}" == true && "${CLI_SSL_FLAG_SET}" != true && "${SSL_SETUP}" != true ]]; then
    SSL_SETUP=true
    changed=true
  fi

  if [[ -n "${detected_domain}" && "${CLI_SSL_DOMAIN_SET}" != true && -z "${SSL_DOMAIN}" ]]; then
    SSL_DOMAIN="${detected_domain}"
    changed=true
  fi

  if [[ -n "${detected_email}" && "${CLI_SSL_EMAIL_SET}" != true && -z "${SSL_EMAIL}" ]]; then
    SSL_EMAIL="${detected_email}"
    changed=true
  fi

  if [[ "${changed}" == true ]]; then
    log_info "Loaded previous host SSL defaults (SSL=$(bool_word "${SSL_SETUP}"), domain=${SSL_DOMAIN:-n/a}, email=${SSL_EMAIL:-n/a})"
  fi
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
    if [[ "${IS_TTY}" == true && "${MGS_SKIP_SELF_UPDATE_KEYPRESS:-0}" != "1" ]]; then
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

# Returns 0 when the provided path resolves inside the production deploy tree.
# The update wrapper uses this to decide whether to prompt for a shared .env edit
# before delegating to deploy.sh.
path_is_within_deploy_dir() {
  local candidate="$1"
  local resolved_candidate=""

  resolved_candidate="$(cd "${candidate}" 2>/dev/null && pwd -P || true)"
  [[ -n "${resolved_candidate}" ]] || return 1
  [[ "${resolved_candidate}" == "${DEPLOY_DIR}" || "${resolved_candidate}" == "${DEPLOY_DIR}/"* ]]
}

# Chooses a terminal editor command for optional shared .env edits.
# We intentionally accept a single command token (for example nano/vi/vim).
pick_env_editor() {
  local candidate="${VISUAL:-${EDITOR:-nano}}"

  if command -v "${candidate}" >/dev/null 2>&1; then
    printf '%s\n' "${candidate}"
    return 0
  fi

  for candidate in nano vi vim; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

# Runs a privileged command for shared env maintenance. The shared deploy path
# is typically root-owned, so the wrapper escalates as needed before deploy.sh.
run_shared_env_cmd() {
  if [[ ${EUID} -eq 0 ]]; then
    "$@"
    return $?
  fi

  if ! should_use_sudo_for_deploy; then
    "$@"
    return $?
  fi

  ensure_sudo_for_deploy_ready
  if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
    echo "$MGS_SUDO_PASSWORD" | sudo -S "$@"
  else
    sudo "$@"
  fi
}

# Runs a privileged server-setup command (package install/systemctl) and fails
# clearly when neither root nor sudo deploy mode is available.
run_server_setup_cmd() {
  if [[ ${EUID} -eq 0 ]]; then
    "$@"
    return $?
  fi

  if ! should_use_sudo_for_deploy; then
    log_error "This action requires root or sudo deploy mode."
    return 1
  fi

  ensure_sudo_for_deploy_ready
  if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
    echo "$MGS_SUDO_PASSWORD" | sudo -S "$@"
  else
    sudo "$@"
  fi
}

# Runs a command that touches deployed release files/paths, using sudo when the
# deploy workflow is configured for elevation but allowing direct execution when
# the current user already has access.
run_deploy_path_cmd() {
  if [[ ${EUID} -eq 0 ]]; then
    "$@"
    return $?
  fi

  if should_use_sudo_for_deploy; then
    ensure_sudo_for_deploy_ready
    if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
      echo "$MGS_SUDO_PASSWORD" | sudo -S "$@"
    else
      sudo "$@"
    fi
    return $?
  fi

  "$@"
}

# Reads KEY=value from an env file without sourcing shell code.
read_env_file_value_from_update() {
  local env_file="$1"
  local key="$2"
  local line=""
  local value=""

  [[ -f "${env_file}" ]] || return 1

  line="$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "${env_file}" 2>/dev/null || true)"
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

# Ensures /var/www/.../shared/.env exists, copying the repo .env.example on
# first-run servers so operators have a file to review before deployment.
extract_env_assignment_key() {
  local line="$1"

  printf '%s\n' "${line}" | sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*$/\2/p'
}

ensure_shared_env_file() {
  local env_template_path="$1"
  local shared_env_path="${SHARED_DIR}/.env"

  if ! run_shared_env_cmd mkdir -p "${SHARED_DIR}"; then
    log_warn "Unable to create ${SHARED_DIR} (permissions?)."
    log_warn "deploy.sh will retry shared .env setup during deployment."
    return 1
  fi

  if [[ -f "${shared_env_path}" ]]; then
    log_info "Shared .env found: ${shared_env_path}"
  elif [[ -f "${env_template_path}" ]]; then
    if ! run_shared_env_cmd cp "${env_template_path}" "${shared_env_path}"; then
      log_warn "Unable to copy ${env_template_path} to ${shared_env_path}."
      log_warn "deploy.sh will retry shared .env setup during deployment."
      return 1
    fi
    run_shared_env_cmd chown www-data:www-data "${shared_env_path}" || true
    run_shared_env_cmd chmod 640 "${shared_env_path}" || true
    log_info "Created shared .env from template: ${shared_env_path}"
  else
    log_warn "No shared .env file found and no template available at ${env_template_path}"
    return 1
  fi

  if [[ -f "${shared_env_path}" && -f "${env_template_path}" ]]; then
    local template_line=""
    local key=""
    while IFS= read -r template_line || [[ -n "${template_line}" ]]; do
      key="$(extract_env_assignment_key "${template_line}")"
      [[ -n "${key}" ]] || continue

      if ! grep -Eq "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "${shared_env_path}"; then
        log_info "Adding missing config key to shared .env: ${key}"
        if ! printf '%s\n' "${key}=\"\"" | run_shared_env_cmd tee -a "${shared_env_path}" >/dev/null; then
          log_warn "Unable to append ${key} to ${shared_env_path}."
          log_warn "deploy.sh will retry shared .env setup during deployment."
          return 1
        fi
      fi
    done < "${env_template_path}"
    log_info "Shared .env keys synchronized with template."
  fi

  # Re-apply runtime ownership in case a previous manual edit left the file as
  # root-owned and unreadable by the app service user.
  run_shared_env_cmd chown www-data:www-data "${shared_env_path}" || true
  run_shared_env_cmd chmod 640 "${shared_env_path}" || true
  return 0
}

# Opens the shared production .env in a terminal editor on demand and restores
# app runtime ownership/permissions after the edit completes.
edit_shared_env_now() {
  local shared_env_path="${SHARED_DIR}/.env"
  local editor_cmd=""

  [[ "${IS_TTY}" == true ]] || return 0

  if [[ ! -f "${shared_env_path}" ]]; then
    log_warn "Shared .env file not found at ${shared_env_path}"
    return 1
  fi

  if ! editor_cmd="$(pick_env_editor)"; then
    log_warn "No terminal editor found (checked VISUAL/EDITOR, nano, vi, vim)."
    log_warn "Edit manually: ${shared_env_path}"
    return 0
  fi

  if [[ ${EUID} -eq 0 ]]; then
    if ! "${editor_cmd}" "${shared_env_path}"; then
      log_warn "Editor exited with an error; continuing deployment."
      return 0
    fi
  else
    if should_use_sudo_for_deploy; then
      ensure_sudo_for_deploy_ready
      if ! sudo "${editor_cmd}" "${shared_env_path}"; then
        log_warn "Editor exited with an error; continuing deployment."
        return 0
      fi
    else
      if ! "${editor_cmd}" "${shared_env_path}"; then
        log_warn "Editor exited with an error; continuing deployment."
        return 0
      fi
    fi
  fi

  run_shared_env_cmd chown www-data:www-data "${shared_env_path}" || true
  run_shared_env_cmd chmod 640 "${shared_env_path}" || true
  log_info "Shared .env review complete"
  return 0
}

maybe_edit_shared_env_before_deploy() {
  # Bypassed: Users can still edit the .env via the TUI menu if desired
  return 0
}

# Installs Nginx using the shared package installer in a minimal mode suitable
# for server bootstrap actions triggered from update.sh.
ensure_nginx_installed_from_update() {
  section "Nginx Install"

  if command -v nginx >/dev/null 2>&1; then
    log_info "Nginx already installed: $(nginx -v 2>&1)"
    return 0
  fi

  if [[ ! -x "${SCRIPT_DIR}/setup-packages.sh" ]]; then
    log_error "setup-packages.sh not found or not executable at ${SCRIPT_DIR}/setup-packages.sh"
    return 1
  fi

  if [[ ${EUID} -eq 0 ]]; then
    run_step "Installing Nginx packages" "${SCRIPT_DIR}/setup-packages.sh" --skip-node --skip-db --skip-certbot --non-interactive
    return $?
  fi

  if ! should_use_sudo_for_deploy; then
    log_error "Nginx installation requires root or sudo deploy mode. Re-run as root or enable sudo deploy mode."
    return 1
  fi

  ensure_sudo_for_deploy_ready
  run_step "Installing Nginx packages" sudo "${SCRIPT_DIR}/setup-packages.sh" --skip-node --skip-db --skip-certbot --non-interactive
}

# Detects whether the deploy nginx configs appear to require PHP/FastCGI.
php_fpm_needed_for_stack() {
  if grep -R -E -q 'fastcgi_pass|php-fpm|\.php' "${SCRIPT_DIR}"/nginx*.conf 2>/dev/null; then
    return 0
  fi
  return 1
}

# Returns a PHP-FPM binary or service-like command if present.
php_fpm_cli_bin() {
  local bin=""
  for bin in php-fpm php-fpm8.3 php-fpm8.2 php-fpm8.1 php-fpm8.0 php-fpm7.4; do
    if command -v "${bin}" >/dev/null 2>&1; then
      echo "${bin}"
      return 0
    fi
  done
  return 1
}

# Installs PHP-FPM only when nginx config indicates it is needed (currently not
# expected for this Next.js app, but included for mixed-stack servers).
ensure_php_fpm_installed_if_needed_from_update() {
  local os_id=""
  local pkg_manager=""
  local service_name=""

  section "PHP-FPM Install (if needed)"

  if ! php_fpm_needed_for_stack; then
    log_info "PHP-FPM not required by deploy nginx config for this Next.js app. Skipping."
    return 0
  fi

  if php_fpm_cli_bin >/dev/null 2>&1; then
    log_info "PHP-FPM already installed: $(php_fpm_cli_bin)"
    return 0
  fi

  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    os_id="${ID:-}"
  fi

  case "${os_id}" in
    ubuntu|debian|linuxmint|pop|elementary)
      pkg_manager="apt"
      ;;
    fedora|rhel|centos|rocky|almalinux|ol|scientific)
      if command -v dnf >/dev/null 2>&1; then
        pkg_manager="dnf"
      else
        pkg_manager="yum"
      fi
      ;;
    opensuse*|sles|suse)
      pkg_manager="zypper"
      ;;
    arch|manjaro|endeavouros|garuda)
      pkg_manager="pacman"
      ;;
    *)
      log_error "Unsupported OS for PHP-FPM auto-install in update.sh (ID='${os_id:-unknown}')."
      log_error "Install PHP-FPM manually if your nginx config actually requires it."
      return 1
      ;;
  esac

  case "${pkg_manager}" in
    apt)
      run_step "Installing PHP-FPM packages" run_server_setup_cmd apt install -y php-fpm || return 1
      ;;
    dnf)
      run_step "Installing PHP-FPM packages" run_server_setup_cmd dnf install -y php-fpm || return 1
      ;;
    yum)
      run_step "Installing PHP-FPM packages" run_server_setup_cmd yum install -y php-fpm || return 1
      ;;
    zypper)
      run_step "Installing PHP-FPM packages" run_server_setup_cmd zypper install -y php-fpm || return 1
      ;;
    pacman)
      run_step "Installing PHP-FPM packages" run_server_setup_cmd pacman -S --noconfirm php-fpm || return 1
      ;;
  esac

  for service_name in php-fpm php8.3-fpm php8.2-fpm php8.1-fpm php8.0-fpm php7.4-fpm; do
    if run_server_setup_cmd systemctl start "${service_name}" >/dev/null 2>&1; then
      run_server_setup_cmd systemctl enable "${service_name}" >/dev/null 2>&1 || true
      log_info "PHP-FPM service ready: ${service_name}"
      break
    fi
  done

  log_info "PHP-FPM install step complete"
  return 0
}

# Detects the scheduler service name used by the host (`cron` vs `crond`) so
# install and repair helpers can share the same restart/enable logic.
cron_scheduler_service_name_from_update() {
  if ! command -v systemctl >/dev/null 2>&1; then
    return 1
  fi

  if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^cron\.service'; then
    echo "cron"
    return 0
  fi
  if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^crond\.service'; then
    echo "crond"
    return 0
  fi
  if systemctl status cron >/dev/null 2>&1; then
    echo "cron"
    return 0
  fi
  if systemctl status crond >/dev/null 2>&1; then
    echo "crond"
    return 0
  fi

  return 1
}

# Enables and starts cron/crond after package installation or during repair
# runs. This is best-effort and does not fail when systemd is unavailable.
ensure_cron_scheduler_running_enabled_from_update() {
  local service_name=""

  if ! command -v systemctl >/dev/null 2>&1; then
    log_warn "systemctl not available; install/start cron manually if needed."
    return 0
  fi

  if ! service_name="$(cron_scheduler_service_name_from_update)"; then
    log_warn "Cron scheduler service (cron/crond) not detected."
    return 0
  fi

  run_server_setup_cmd systemctl enable "${service_name}" >/dev/null 2>&1 || true
  if run_server_setup_cmd systemctl start "${service_name}" >/dev/null 2>&1; then
    log_info "Cron scheduler ready: ${service_name}"
  else
    log_warn "Could not start cron scheduler service: ${service_name}"
  fi

  return 0
}

# Installs cron/crond using the OS package manager. Package names vary by
# distro (`cron` vs `cronie`), so we resolve both the package and manager.
ensure_cron_installed_from_update() {
  local os_id=""
  local pkg_manager=""
  local cron_pkg=""
  local existing_service_name=""

  section "Cron Scheduler Install"

  if command -v crontab >/dev/null 2>&1; then
    if existing_service_name="$(cron_scheduler_service_name_from_update 2>/dev/null)"; then
      log_info "crontab already installed"
      ensure_cron_scheduler_running_enabled_from_update
      return 0
    fi

    log_warn "crontab is installed, but cron/crond service is missing. Attempting package repair/install..."
  fi

  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    os_id="${ID:-}"
  fi

  case "${os_id}" in
    ubuntu|debian|linuxmint|pop|elementary)
      pkg_manager="apt"
      cron_pkg="cron"
      ;;
    fedora|rhel|centos|rocky|almalinux|ol|scientific)
      if command -v dnf >/dev/null 2>&1; then
        pkg_manager="dnf"
      else
        pkg_manager="yum"
      fi
      cron_pkg="cronie"
      ;;
    opensuse*|sles|suse)
      pkg_manager="zypper"
      cron_pkg="cron"
      ;;
    arch|manjaro|endeavouros|garuda)
      pkg_manager="pacman"
      cron_pkg="cronie"
      ;;
    *)
      log_error "Unsupported OS for cron scheduler auto-install in update.sh (ID='${os_id:-unknown}')."
      log_error "Install cron/crond manually and rerun the helper if needed."
      return 1
      ;;
  esac

  case "${pkg_manager}" in
    apt)
      run_step "Installing cron scheduler package" run_server_setup_cmd apt install -y "${cron_pkg}" || return 1
      ;;
    dnf)
      run_step "Installing cron scheduler package" run_server_setup_cmd dnf install -y "${cron_pkg}" || return 1
      ;;
    yum)
      run_step "Installing cron scheduler package" run_server_setup_cmd yum install -y "${cron_pkg}" || return 1
      ;;
    zypper)
      run_step "Installing cron scheduler package" run_server_setup_cmd zypper install -y "${cron_pkg}" || return 1
      ;;
    pacman)
      run_step "Installing cron scheduler package" run_server_setup_cmd pacman -S --noconfirm "${cron_pkg}" || return 1
      ;;
  esac

  ensure_cron_scheduler_running_enabled_from_update
  return 0
}

# Installs or updates the app's systemd unit from deploy/<app>.service and
# enables it. If a current release exists, the helper also attempts to start it.
install_app_systemd_service_from_update() {
  local service_file="/etc/systemd/system/${APP_NAME}.service"
  local service_source="${SCRIPT_DIR}/${APP_NAME}.service"

  section "App Systemd Service Install"

  if ! command -v systemctl >/dev/null 2>&1; then
    log_error "systemctl not available on this host."
    return 1
  fi

  if [[ ! -f "${service_source}" ]]; then
    log_error "Service template not found: ${service_source}"
    return 1
  fi

  if [[ ! -f "${service_file}" ]]; then
    log_info "Installing systemd service..."
    run_server_setup_cmd cp "${service_source}" "${service_file}" || return 1
    run_server_setup_cmd systemctl daemon-reload || return 1
  elif ! cmp -s "${service_source}" "${service_file}"; then
    log_info "Updating systemd service..."
    run_server_setup_cmd cp "${service_source}" "${service_file}" || return 1
    run_server_setup_cmd systemctl daemon-reload || return 1
  else
    log_info "Systemd service already up to date"
  fi

  run_server_setup_cmd systemctl enable "${APP_NAME}" >/dev/null 2>&1 || true

  if [[ -L "${CURRENT_LINK}" || -d "${CURRENT_LINK}" ]]; then
    if run_server_setup_cmd systemctl start "${APP_NAME}" >/dev/null 2>&1; then
      log_info "Systemd service ready: ${APP_NAME}"
    else
      log_warn "Systemd service installed but not started (check current release/env): ${APP_NAME}"
    fi
  else
    log_info "Current release not present yet; service installed/enabled but not started."
  fi

  return 0
}

# Mirrors deploy.sh's managed root crontab block so operators can repair or
# bootstrap cron jobs directly from update.sh without running a full deploy.
install_or_update_managed_crontab_jobs_from_update() {
  local cron_runner="${CURRENT_LINK}/deploy/cron.sh"
  local begin_marker="# BEGIN LESSONFLOW_MANAGED_CRON"
  local end_marker="# END LESSONFLOW_MANAGED_CRON"
  local legacy_begin="# BEGIN MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON"
  local legacy_end="# END MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON"
  local existing=""
  local stripped=""
  local tmp_file=""

  if ! command -v crontab >/dev/null 2>&1; then
    log_info "crontab command not available; skipping cron job install"
    return 0
  fi

  # Check if /var/spool/cron/ is writable before attempting crontab installation
  # This handles containerized or restricted environments with read-only filesystems
  local spool_cron_dir="/var/spool/cron"
  if [[ -d "${spool_cron_dir}" && ! -w "${spool_cron_dir}" ]]; then
    log_warn "Cron spool directory is read-only (${spool_cron_dir}); skipping cron job installation"
    log_warn "Cron jobs will not run automatically. Configure cron manually if needed."
    return 0
  fi

  existing="$(run_server_setup_cmd crontab -l 2>/dev/null || true)"
  stripped="$(printf '%s\n' "${existing}" | awk -v b1="${begin_marker}" -v e1="${end_marker}" -v b2="${legacy_begin}" -v e2="${legacy_end}" '
    $0 == b1 || $0 == b2 { skip=1; next }
    $0 == e1 || $0 == e2 { skip=0; next }
    !skip { print }
  ' | sed '/\/var\/www\/melbourne-guitar-school\/current\/deploy\/cron\.sh/d')"

  tmp_file="$(mktemp)"
  {
    if [[ -n "${stripped//[[:space:]]/}" ]]; then
      printf '%s\n' "${stripped}"
      echo
    fi
    printf '%s\n' "${begin_marker}"
    echo "# LessonFlow managed cron jobs (updated by update.sh)"
    echo "0 20 * * * ${cron_runner} daily-bookings-digest"
    echo "30 20 * * * ${cron_runner} invoice-reminders"
    echo "45 20 * * * ${cron_runner} admin-reports-daily"
    echo "0 8 * * 1 ${cron_runner} admin-reports-weekly"
    echo "15 8 1 * * ${cron_runner} admin-reports-monthly"
    echo "30 8 1 1 * ${cron_runner} admin-reports-yearly"
    echo "*/2 * * * * ${cron_runner} gmail-sync"
    printf '%s\n' "${end_marker}"
    echo
  } > "${tmp_file}"

  # Attempt to install crontab, but handle read-only filesystem gracefully
  if run_step "Installing/updating managed cron jobs" run_server_setup_cmd crontab "${tmp_file}"; then
    rm -f "${tmp_file}"
    return 0
  else
    local exit_code=$?
    rm -f "${tmp_file}"
    
    # Check if the failure was due to read-only filesystem
    if [[ ${exit_code} -ne 0 ]]; then
      log_warn "Crontab installation failed (exit code ${exit_code}); this may be due to a read-only filesystem"
      log_warn "Cron jobs will not run automatically. Configure cron manually if needed."
      return 0
    fi
  fi
}

# Installs and enables systemd timer units for all scheduled jobs.
# This is the preferred method for production deployments as timers work
# with read-only filesystems and integrate with systemd logging/monitoring.
install_systemd_timers_from_update() {
  if ! command -v systemctl >/dev/null 2>&1; then
    log_info "systemctl not available; skipping systemd timer installation"
    return 0
  fi

  section "Systemd Timers Install"

  local timer_dir="${SCRIPT_DIR}"
  local systemd_dir="/etc/systemd/system"
  local timer_names=(
    "lessonflow-daily-bookings"
    "lessonflow-invoice-reminders"
    "lessonflow-admin-reports-daily"
    "lessonflow-admin-reports-weekly"
    "lessonflow-admin-reports-monthly"
    "lessonflow-admin-reports-yearly"
    "lessonflow-gmail-sync"
  )

  # Copy service and timer unit files to systemd directory
  for timer_name in "${timer_names[@]}"; do
    local service_file="${timer_dir}/${timer_name}.service"
    local timer_file="${timer_dir}/${timer_name}.timer"
    local target_service="${systemd_dir}/${timer_name}.service"
    local target_timer="${systemd_dir}/${timer_name}.timer"

    if [[ ! -f "${service_file}" ]]; then
      log_warn "Service unit not found: ${service_file}; skipping ${timer_name}"
      continue
    fi
    if [[ ! -f "${timer_file}" ]]; then
      log_warn "Timer unit not found: ${timer_file}; skipping ${timer_name}"
      continue
    fi

    # Copy service unit
    if run_server_setup_cmd cp "${service_file}" "${target_service}"; then
      log_info "Installed service: ${target_service}"
    else
      log_warn "Failed to install service: ${target_service}"
      continue
    fi

    # Copy timer unit
    if run_server_setup_cmd cp "${timer_file}" "${target_timer}"; then
      log_info "Installed timer: ${target_timer}"
    else
      log_warn "Failed to install timer: ${target_timer}"
      continue
    fi
  done

  # Reload systemd daemon to pick up new units
  if ! run_server_setup_cmd systemctl daemon-reload; then
    log_warn "Failed to reload systemd daemon; timer units may not be recognized"
    return 0
  fi

  # Enable all timers
  for timer_name in "${timer_names[@]}"; do
    if run_server_setup_cmd systemctl enable "${timer_name}.timer" 2>/dev/null; then
      log_info "Enabled timer: ${timer_name}.timer"
    else
      log_warn "Failed to enable timer: ${timer_name}.timer"
    fi
  done

  # Restart all timers to apply any changes
  for timer_name in "${timer_names[@]}"; do
    if run_server_setup_cmd systemctl restart "${timer_name}.timer" 2>/dev/null; then
      log_info "Restarted timer: ${timer_name}.timer"
    else
      log_warn "Failed to restart timer: ${timer_name}.timer"
    fi
  done

  # Remove legacy cron entries to avoid duplicate job execution
  remove_legacy_cron_entries_from_update

  # Show timer status
  log_info "Timer status summary:"
  run_server_setup_cmd systemctl list-timers "${timer_names[@]/%/.timer}" 2>/dev/null || true

  return 0
}

# Removes legacy managed cron entries from root crontab to prevent duplicate
# job execution after migrating to systemd timers.
remove_legacy_cron_entries_from_update() {
  if ! command -v crontab >/dev/null 2>&1; then
    return 0
  fi

  local begin_marker="# BEGIN LESSONFLOW_MANAGED_CRON"
  local end_marker="# END LESSONFLOW_MANAGED_CRON"
  local legacy_begin="# BEGIN MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON"
  local legacy_end="# END MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON"
  local existing=""
  local stripped=""

  existing="$(run_server_setup_cmd crontab -l 2>/dev/null || true)"

  # Check if there are any managed entries to remove
  if ! printf '%s\n' "${existing}" | grep -qE "^(# BEGIN (LESSONFLOW|MELBOURNE_GUITAR_SCHOOL)_MANAGED_CRON|# END (LESSONFLOW|MELBOURNE_GUITAR_SCHOOL)_MANAGED_CRON|.*lessonflow.*/deploy/cron\.sh|.*melbourne-guitar-school.*/deploy/cron\.sh)"; then
    log_info "No legacy cron entries found; skipping cleanup"
    return 0
  fi

  # Strip both new and legacy blocks
  stripped="$(printf '%s\n' "${existing}" | awk -v b1="${begin_marker}" -v e1="${end_marker}" -v b2="${legacy_begin}" -v e2="${legacy_end}" '
    $0 == b1 || $0 == b2 { skip=1; next }
    $0 == e1 || $0 == e2 { skip=0; next }
    !skip { print }
  ' | sed '/\/var\/www\/melbourne-guitar-school\/current\/deploy\/cron\.sh/d' | sed '/\/var\/www\/lessonflow\/current\/deploy\/cron\.sh/d')"

  # Write back the cleaned crontab
  local tmp_file
  tmp_file="$(mktemp)"
  printf '%s\n' "${stripped}" > "${tmp_file}"

  if run_server_setup_cmd crontab "${tmp_file}" 2>/dev/null; then
    log_info "Removed legacy cron entries (migrated to systemd timers)"
  else
    log_warn "Failed to update crontab; legacy entries may remain"
  fi
  rm -f "${tmp_file}"
}

# Restarts cron/crond after crontab changes so hosts that rely on service
# reload/restart pick up the latest runner path and env-linked behavior quickly.
restart_cron_scheduler_if_present_from_update() {
  local service_name=""

  if ! command -v systemctl >/dev/null 2>&1; then
    log_info "systemctl not available; skipping cron scheduler restart"
    return 0
  fi

  if ! service_name="$(cron_scheduler_service_name_from_update)"; then
    log_info "Cron scheduler service not detected (cron/crond); skipping restart"
    return 0
  fi

  if ! run_step "Restarting cron scheduler (${service_name})" run_server_setup_cmd systemctl restart "${service_name}"; then
    log_warn "Cron scheduler restart failed; continuing workflow"
  fi
  return 0
}

# Installs and enables systemd timer units for all scheduled jobs.
# This is the preferred method for production deployments as timers work
# with read-only filesystems and integrate with systemd logging/monitoring.
ensure_managed_cron_jobs_installed_from_update() {
  local cron_runner="${CURRENT_LINK}/deploy/cron.sh"

  section "Systemd Timers Install"

  # Check if systemctl is available
  if ! command -v systemctl >/dev/null 2>&1; then
    log_warn "systemctl not available; falling back to traditional cron"
    install_or_update_managed_crontab_jobs_from_update || return 1
    restart_cron_scheduler_if_present_from_update
    return 0
  fi

  # Check if cron runner is available
  if [[ ! -x "${cron_runner}" ]]; then
    log_info "Cron runner not available yet (${cron_runner}); deferring timer install until post-release sync."
    return 0
  fi

  # Install systemd timers (preferred method)
  install_systemd_timers_from_update
  return 0
}

# Checks for existence of the core systemd timer that triggers lessonflow jobs.
managed_systemd_timers_present_from_update() {
  if ! command -v systemctl >/dev/null 2>&1; then
    return 1
  fi
  # We check for the daily bookings timer as a proxy for the suite
  if systemctl list-unit-files --type=timer 2>/dev/null | grep -q '^lessonflow-daily-bookings\.timer'; then
    return 0
  fi
  return 1
}

# Checks for the lessonflow managed cron block in root crontab without forcing
# an interactive sudo prompt during auto-bootstrap detection.
managed_cron_block_present_from_update() {
  local cron_dump=""

  if ! command -v crontab >/dev/null 2>&1; then
    return 1
  fi

  if [[ ${EUID} -eq 0 ]]; then
    cron_dump="$(crontab -l 2>/dev/null || true)"
  elif should_use_sudo_for_deploy; then
    if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
      cron_dump="$(echo "$MGS_SUDO_PASSWORD" | sudo -S crontab -l 2>/dev/null || true)"
    else
      cron_dump="$(sudo -n crontab -l 2>/dev/null || true)"
    fi
  else
    cron_dump="$(crontab -l 2>/dev/null || true)"
  fi

  printf '%s\n' "${cron_dump}" | grep -q '^# BEGIN LESSONFLOW_MANAGED_CRON$'
}

# Auto-enables bootstrap toggles when required host wiring is missing. This
# keeps regular update runs capable of repairing first-run VPS drift.
auto_enable_bootstrap_defaults_from_update() {
  local changed=false
  local enabled_flags=()

  if [[ "${AUTO_BOOTSTRAP}" != true ]]; then
    return 0
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    # RATIONALE: Updates still need nginx wiring on hosts that never completed
    # the original bootstrap, otherwise the app can deploy but stay unreachable.
    INSTALL_NGINX_IF_NEEDED=true
    changed=true
    enabled_flags+=( "install-nginx" )
  fi

  if ! command -v crontab >/dev/null 2>&1; then
    INSTALL_CRON_IF_NEEDED=true
    changed=true
    enabled_flags+=( "install-cron" )
  fi

  if command -v systemctl >/dev/null 2>&1; then
    if ! systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${APP_NAME}\\.service"; then
      INSTALL_APP_SERVICE_IF_NEEDED=true
      changed=true
      enabled_flags+=( "install-app-service" )
    fi
    
    # RATIONALE: We no longer auto-enable INSTALL_CRON_IF_NEEDED because cron is 
    # deprecated in favor of systemd timers. We only check for the app service.
  fi

  if [[ ! -d "${DEPLOY_DIR}" || ! -L "${CURRENT_LINK}" ]]; then
    # NOTE: Missing deploy/current structure usually means first-run setup or
    # partial host drift, so updates promote the service/timer repair path too.
    INSTALL_APP_SERVICE_IF_NEEDED=true
    INSTALL_CRON_JOBS_IF_NEEDED=true
    changed=true
    enabled_flags+=( "install-app-service" "install-cron-jobs" )
  fi

  # Auto-enable cron jobs (timers) installation if neither timers nor legacy cron block is present.
  if ! managed_systemd_timers_present_from_update && ! managed_cron_block_present_from_update; then
    # NOTE: This keeps update.sh capable of repairing older hosts that never
    # finished the migration from cron entries to managed systemd timers.
    INSTALL_CRON_JOBS_IF_NEEDED=true
    changed=true
    enabled_flags+=( "install-cron-jobs" )
  fi

  if [[ "${changed}" == true ]]; then
    log_info "Auto-bootstrap enabled missing setup flags: ${enabled_flags[*]}"
  fi
}

# Delegates Prisma update (generate/migrate) to deploy.sh using the current
# configuration and sudo settings.
update_prisma_from_update() {
  section "Prisma Update"

  if [[ ! -x "${DEPLOY_SCRIPT}" ]]; then
    log_error "deploy.sh not found or not executable at ${DEPLOY_SCRIPT}"
    return 1
  fi

  local deploy_args=()
  deploy_args+=( "--branch" "${BRANCH}" )
  # NOTE: The branch arg is still forwarded in archive mode because deploy.sh
  # ignores git-only operations after source-mode detection, keeping the call
  # shape uniform between git and snapshot deployments.
  [[ "${AUTO_BOOTSTRAP}" == false ]] && deploy_args+=( "--no-auto-bootstrap" )
  [[ "${DB_PUSH}" == true ]] && deploy_args+=( "--db-push" )
  [[ "${NO_SPINNER}" == true ]] && deploy_args+=( "--no-spinner" )
  [[ "${NO_COLOR}" == true ]] && deploy_args+=( "--no-color" )

  # RATIONALE: Prisma maintenance stays delegated to deploy.sh so one script
  # remains authoritative for env bootstrapping, sudo policy, and schema safety.
  log_info "Delegating Prisma update to deploy.sh..."
  
  if should_use_sudo_for_deploy; then
    ensure_sudo_for_deploy_ready
    if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
      echo "$MGS_SUDO_PASSWORD" | sudo -S "${DEPLOY_SCRIPT}" "${deploy_args[@]}" --update-prisma
    else
      sudo "${DEPLOY_SCRIPT}" "${deploy_args[@]}" --update-prisma
    fi
  else
    "${DEPLOY_SCRIPT}" "${deploy_args[@]}" --update-prisma
  fi
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
  [[ "${IS_TTY}" == true ]] || return 0

  if ! clear 2>/dev/null; then
    printf '\033[H\033[2J\033[3J'
  fi
}

print_tui_panel_rule() {
  local width="${1:-84}"
  local rule=""
  printf -v rule '%*s' "${width}" ''
  rule="${rule// /─}"
  echo -e "${DIM}${BLUE}${rule}${NC}"
}

print_tui_option_row() {
  local key="$1"
  local label="$2"
  local value="$3"
  printf "  %b[%2s]%b %b%-22s%b %b%s%b\n" "${BOLD}${MAGENTA}" "${key}" "${NC}" "${BOLD}${CYAN}" "${label}" "${NC}" "${BOLD}${GREEN}" "${value}" "${NC}"
}

print_tui_option_desc() {
  local text="$1"
  echo -e "       ${DIM}${text}${NC}"
}

# Truncates plain text to a fixed width so menu rows stay inside the panel.
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

build_tui_option_cell_text() {
  local key="$1"
  local label="$2"
  local value="$3"
  local cell_width="$4"
  local raw="[${key}] ${label}: ${value}"

  tui_truncate_text "${raw}" "${cell_width}"
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
  local col_width=$(( (UPDATE_TUI_PANEL_WIDTH - 4) / 2 ))
  local left_cell=""
  local right_cell=""
  local left_desc_text=""
  local right_desc_text=""

  left_cell="$(build_tui_option_cell_text "${left_key}" "${left_label}" "${left_value}" "${col_width}")"
  left_desc_text="$(tui_truncate_text "${left_desc}" "${col_width}")"

  if [[ -n "${right_key}" ]]; then
    right_cell="$(build_tui_option_cell_text "${right_key}" "${right_label}" "${right_value}" "${col_width}")"
    right_desc_text="$(tui_truncate_text "${right_desc}" "${col_width}")"
  fi

  printf "  %b%-*s%b  %b%-*s%b\n" "${BOLD}${CYAN}" "${col_width}" "${left_cell}" "${NC}" "${BOLD}${GREEN}" "${col_width}" "${right_cell}" "${NC}"
  printf "  %b%-*s%b  %b%-*s%b\n" "${DIM}" "${col_width}" "${left_desc_text}" "${NC}" "${DIM}" "${col_width}" "${right_desc_text}" "${NC}"
}

print_tui_action_pair() {
  local left_key="$1"
  local left_label="$2"
  local right_key="${3:-}"
  local right_label="${4:-}"
  local col_width=$(( (UPDATE_TUI_PANEL_WIDTH - 4) / 2 ))
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
  local max_width=$(( UPDATE_TUI_PANEL_WIDTH - 2 ))
  local clipped=""

  clipped="$(tui_truncate_text "${text}" "${max_width}")"
  echo -e "  ${DIM}${CYAN}${clipped}${NC}"
}

print_summary_row() {
  local label="$1"
  local value="$2"
  local value_max=$(( UPDATE_TUI_PANEL_WIDTH - 24 ))
  local clipped_value=""

  clipped_value="$(tui_truncate_text "${value}" "${value_max}")"
  printf "  %-18b %b%s%b\n" "${DIM}${label}:${NC}" "${CYAN}" "${clipped_value}" "${NC}"
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

# Best-effort remote update check for the TUI. It fetches the selected branch
# quietly (non-interactive) and caches the result so menu redraws stay fast.
# The goal is to show operators when a newer remote commit exists before they
# start the update workflow.
refresh_tui_remote_update_cache() {
  local cache_key=""
  local now_epoch=0
  local remote_ref=""
  local local_ref=""
  local local_commit=""
  local remote_commit=""
  local git_root=""

  [[ "${IS_TTY}" == true ]] || return 0
  [[ "${SOURCE_MODE}" == "git" ]] || return 0
  [[ -n "${BRANCH}" && -n "${REMOTE_NAME}" ]] || return 0

  # Resolve the git root once and use it for all git operations to ensure
  # consistent results regardless of the current working directory.
  if [[ -n "${REPO_ROOT}" && -d "${REPO_ROOT}/.git" ]]; then
    git_root="${REPO_ROOT}"
  elif [[ -d .git ]]; then
    git_root="$(pwd)"
  else
    git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  fi
  [[ -z "${git_root}" ]] && return 0

  # Include git_root in the cache key so different repo paths have separate caches.
  cache_key="${git_root}:${REMOTE_NAME}:${BRANCH}"
  now_epoch="$(date +%s 2>/dev/null || echo 0)"

  if [[ "${TUI_REMOTE_UPDATE_CACHE_KEY}" == "${cache_key}" && "${TUI_REMOTE_UPDATE_CACHE_AT}" =~ ^[0-9]+$ ]]; then
    if (( now_epoch > 0 )) && (( now_epoch - TUI_REMOTE_UPDATE_CACHE_AT < REMOTE_UPDATE_CHECK_TTL_SECONDS )); then
      return 0
    fi
  fi

  TUI_REMOTE_UPDATE_CACHE_KEY="${cache_key}"
  TUI_REMOTE_UPDATE_CACHE_AT="${now_epoch}"
  TUI_REMOTE_UPDATE_STATUS="unknown"
  TUI_REMOTE_UPDATE_REMOTE_SHORT=""
  TUI_REMOTE_UPDATE_REMOTE_SUBJECT=""
  TUI_REMOTE_UPDATE_LOCAL_SHORT=""
  TUI_REMOTE_UPDATE_ERROR=""

  if ! command -v git >/dev/null 2>&1; then
    TUI_REMOTE_UPDATE_STATUS="error"
    TUI_REMOTE_UPDATE_ERROR="git not installed"
    return 0
  fi

  # Never prompt for credentials from inside the TUI refresh loop.
  # Run git commands from the resolved git root for consistent results.
  if command -v timeout >/dev/null 2>&1; then
    if ! timeout 8s env GIT_TERMINAL_PROMPT=0 git -C "${git_root}" fetch --quiet --no-tags "${REMOTE_NAME}" "${BRANCH}" >/dev/null 2>&1; then
      TUI_REMOTE_UPDATE_STATUS="error"
      TUI_REMOTE_UPDATE_ERROR="remote check failed or timed out"
      return 0
    fi
  else
    if ! env GIT_TERMINAL_PROMPT=0 git -C "${git_root}" fetch --quiet --no-tags "${REMOTE_NAME}" "${BRANCH}" >/dev/null 2>&1; then
      TUI_REMOTE_UPDATE_STATUS="error"
      TUI_REMOTE_UPDATE_ERROR="remote check failed"
      return 0
    fi
  fi

  remote_ref="refs/remotes/${REMOTE_NAME}/${BRANCH}"
  remote_commit="$(git -C "${git_root}" rev-parse --verify "${remote_ref}" 2>/dev/null || true)"
  if [[ -z "${remote_commit}" ]]; then
    TUI_REMOTE_UPDATE_STATUS="error"
    TUI_REMOTE_UPDATE_ERROR="missing remote ref ${REMOTE_NAME}/${BRANCH}"
    return 0
  fi

  local_ref="${BRANCH}"
  local_commit="$(git -C "${git_root}" rev-parse --verify "${local_ref}" 2>/dev/null || true)"
  if [[ -z "${local_commit}" ]]; then
    local_commit="$(git -C "${git_root}" rev-parse --verify HEAD 2>/dev/null || true)"
  fi

  TUI_REMOTE_UPDATE_REMOTE_SHORT="$(git -C "${git_root}" rev-parse --short "${remote_commit}" 2>/dev/null || printf '%s' "${remote_commit:0:12}")"
  TUI_REMOTE_UPDATE_REMOTE_SUBJECT="$(git -C "${git_root}" log -1 --format=%s "${remote_ref}" 2>/dev/null || true)"

  if [[ -n "${local_commit}" ]]; then
    TUI_REMOTE_UPDATE_LOCAL_SHORT="$(git -C "${git_root}" rev-parse --short "${local_commit}" 2>/dev/null || printf '%s' "${local_commit:0:12}")"
  fi

  if [[ -n "${local_commit}" && "${local_commit}" == "${remote_commit}" ]]; then
    TUI_REMOTE_UPDATE_STATUS="up-to-date"
    return 0
  fi

  TUI_REMOTE_UPDATE_STATUS="update-available"
  return 0
}

# Renders a blinking alert line above the workflow options when the selected
# remote/branch has a newer commit than the local branch/HEAD.
print_tui_remote_update_alert() {
  local prefix=""
  local local_part=""

  refresh_tui_remote_update_cache

  [[ "${TUI_REMOTE_UPDATE_STATUS}" == "update-available" ]] || return 0

  if [[ -n "${BLINK}" ]]; then
    prefix="${BLINK}"
  fi

  if [[ -n "${TUI_REMOTE_UPDATE_LOCAL_SHORT}" ]]; then
    local_part=" (local ${TUI_REMOTE_UPDATE_LOCAL_SHORT})"
  fi

  local subject_text=""
  subject_text="$(tui_truncate_text "${TUI_REMOTE_UPDATE_REMOTE_SUBJECT}" 42)"
  echo -e "  ${prefix}${YELLOW}▲ Update:${NC} ${BOLD}${TUI_REMOTE_UPDATE_REMOTE_SHORT}${NC}${local_part} ${DIM}${subject_text}${NC}"
}

print_update_tui_menu() {
  tui_clear_screen
  print_box_banner "LessonFlow Update v$(get_app_version)"
  if [[ "${SOURCE_MODE}" == "archive" ]]; then
    echo -e "${DIM}btop-style menu: deploy the current archive source tree after replacing files in place.${NC}"
    echo ""
    echo -e "  $(status_chip "Source" "$(source_mode_label)")  $(status_chip "Deploy" "$(bool_word "$(toggle_bool "${SKIP_DEPLOY}")")")  $(status_chip "Sudo" "$(update_sudo_mode_label)")  $(status_chip "Spin" "$(spinner_ui_word)")"
    if [[ "${SKIP_DEPLOY}" == false ]]; then
      echo -e "  $(status_chip "Deps" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")")  $(status_chip "Cron" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")")  $(status_chip "DB" "$(update_migration_mode_label)")  $(status_chip "SSL" "$(bool_word "${SSL_SETUP}")")"
    fi
    echo ""
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    echo -e "  ${YELLOW}▲ Archive source:${NC} replace files in ${DIM}${REPO_ROOT}${NC} first, then deploy this source tree."
    if archive_source_requires_permission_fix; then
      echo -e "  ${YELLOW}▲ Permissions:${NC} ownership/permissions may need repair before replacing or deploying files."
    fi
    echo ""
    echo -e "${BOLD}${BLUE}  Archive Deploy Options${NC}"
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    print_tui_option_pair "1" "Run deploy" "$(bool_word "$(toggle_bool "${SKIP_DEPLOY}")")" "ON deploys the current source tree; OFF only runs helper actions." \
      "2" "Sudo deploy mode" "$(update_sudo_mode_label)" "Cycle deploy invocation: auto / force sudo / no-sudo."
    print_tui_option_pair "3" "Dependencies" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")" "ON runs npm install in deploy.sh. OFF passes --skip-deps." \
      "4" "Cron jobs sync" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")" "ON lets deploy.sh sync managed cron jobs."
    print_tui_option_pair "5" "Spinner UI" "$(spinner_ui_word)" "Animated progress spinner for deploy steps." \
      "6" "Edit shared .env" "Open editor" "Create shared .env if missing, then edit."
  else
    echo -e "${DIM}btop-style menu: configure git update + deploy handoff, then run.${NC}"
    echo ""
    echo -e "  $(status_chip "Branch" "$(tui_truncate_text "${BRANCH}" 16)")  $(status_chip "Remote" "$(tui_truncate_text "${REMOTE_NAME}" 12)")  $(status_chip "Pull" "$(bool_word "$(toggle_bool "${SKIP_PULL}")")")  $(status_chip "Deploy" "$(bool_word "$(toggle_bool "${SKIP_DEPLOY}")")")"
    if [[ "${SKIP_DEPLOY}" == false ]]; then
      echo -e "  $(status_chip "Dirty" "$(bool_word "${ALLOW_DIRTY}")")  $(status_chip "Sudo" "$(update_sudo_mode_label)")  $(status_chip "Spin" "$(spinner_ui_word)")  $(status_chip "Deps" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")")  $(status_chip "Cron" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")")  $(status_chip "DB" "$(update_migration_mode_label)")  $(status_chip "SSL" "$(bool_word "${SSL_SETUP}")")"
    else
      echo -e "  $(status_chip "Dirty" "$(bool_word "${ALLOW_DIRTY}")")  $(status_chip "Sudo" "$(update_sudo_mode_label)")  $(status_chip "Spin" "$(spinner_ui_word)")"
    fi
    echo ""
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    print_tui_remote_update_alert
    if [[ "${TUI_REMOTE_UPDATE_STATUS}" == "update-available" ]]; then
      print_tui_action_pair "R" "Grab update + reload script"
      echo ""
    fi
    echo -e "${BOLD}${BLUE}  Update Workflow Options${NC}"
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    print_tui_option_pair "1" "Branch" "${BRANCH}" "Branch to fetch/pull and pass to deploy.sh." \
      "2" "Remote" "${REMOTE_NAME}" "Git remote for fetch/pull (usually origin)."
    print_tui_option_pair "3" "Pull latest changes" "$(bool_word "$(toggle_bool "${SKIP_PULL}")")" "ON runs git fetch + ff-only pull before deploy." \
      "4" "Run deploy after pull" "$(bool_word "$(toggle_bool "${SKIP_DEPLOY}")")" "ON runs deploy.sh after update; OFF only updates repo."
    print_tui_option_pair "5" "Allow dirty worktree" "$(bool_word "${ALLOW_DIRTY}")" "ON allows update/deploy with local tracked changes." \
      "6" "Sudo deploy mode" "$(update_sudo_mode_label)" "Cycle deploy invocation: auto / force sudo / no-sudo."
    print_tui_option_pair "7" "Dependencies" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")" "ON runs npm install in deploy.sh. OFF passes --skip-deps." \
      "8" "Cron jobs sync" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")" "ON lets deploy.sh sync managed cron jobs."
    print_tui_option_pair "9" "Spinner UI" "$(spinner_ui_word)" "Animated progress spinner for update/deploy steps." \
      "10" "Edit shared .env" "Open editor" "Create shared .env if missing, then edit."
  fi
  print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
  echo -e "${BOLD}${GREEN}  Bootstrap Workflow Helpers${NC}"
  print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
  if [[ "${SOURCE_MODE}" == "archive" ]]; then
    print_tui_option_pair "7" "Install cron/crond [DEPRECATED]" "$(bool_word "${INSTALL_CRON_IF_NEEDED}")" "Deprecated: systemd timers now used instead." \
      "8" "Install app service" "$(bool_word "${INSTALL_APP_SERVICE_IF_NEEDED}")" "ON: installs/updates app systemd unit before flow."
    print_tui_option_pair "9" "Install systemd timers" "$(bool_word "${INSTALL_CRON_JOBS_IF_NEEDED}")" "ON: installs/updates systemd timer units first." \
      "10" "Install Nginx" "$(bool_word "${INSTALL_NGINX_IF_NEEDED}")" "ON: installs Nginx (if missing) before flow."
    print_tui_option_pair "11" "Install PHP-FPM" "$(bool_word "${INSTALL_PHP_FPM_IF_NEEDED}")" "ON: installs PHP-FPM only if nginx config needs it."
  else
    print_tui_option_pair "11" "Install cron/crond [DEPRECATED]" "$(bool_word "${INSTALL_CRON_IF_NEEDED}")" "Deprecated: systemd timers now used instead." \
      "12" "Install app service" "$(bool_word "${INSTALL_APP_SERVICE_IF_NEEDED}")" "ON: Start installs/updates app systemd unit before flow."
    print_tui_option_pair "13" "Install systemd timers" "$(bool_word "${INSTALL_CRON_JOBS_IF_NEEDED}")" "ON: Start installs/updates systemd timer units first." \
      "14" "Install Nginx" "$(bool_word "${INSTALL_NGINX_IF_NEEDED}")" "ON: Start installs Nginx (if missing) before flow."
    print_tui_option_pair "15" "Install PHP-FPM" "$(bool_word "${INSTALL_PHP_FPM_IF_NEEDED}")" "ON: Start installs PHP-FPM only if nginx config needs it."
  fi
  if [[ "${SKIP_DEPLOY}" == false ]]; then
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    echo -e "${BOLD}${MAGENTA}  Deploy Pass-through Options${NC}"
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    if [[ "${SOURCE_MODE}" == "archive" ]]; then
      print_tui_option_pair "12" "Database mode" "$(update_migration_mode_label)" "Cycle deploy DB mode: migrate / skip / db push." \
        "13" "SSL setup" "$(bool_word "${SSL_SETUP}")" "Pass SSL flags to deploy.sh (certbot + nginx config)."
    else
      print_tui_option_pair "16" "Database mode" "$(update_migration_mode_label)" "Cycle deploy DB mode: migrate / skip / db push." \
        "17" "SSL setup" "$(bool_word "${SSL_SETUP}")" "Pass SSL flags to deploy.sh (certbot + nginx config)."
    fi
    if [[ "${SSL_SETUP}" == true ]]; then
      if [[ "${SOURCE_MODE}" == "archive" ]]; then
        print_tui_option_pair "14" "SSL domain" "${SSL_DOMAIN:-auto-detect}" "Domain for cert request and nginx server_name." \
          "15" "Certbot email" "${SSL_EMAIL:-required for new certs}" "Email for Let's Encrypt registration and renewals."
      else
        print_tui_option_pair "18" "SSL domain" "${SSL_DOMAIN:-auto-detect}" "Domain for cert request and nginx server_name." \
          "19" "Certbot email" "${SSL_EMAIL:-required for new certs}" "Email for Let's Encrypt registration and renewals."
      fi
    fi
  fi
  echo ""
  print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
  echo -e "${BOLD}${MAGENTA}  Immediate Bootstrap Actions${NC}"
  print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
  print_tui_action_pair "J" "Install/update systemd timers" "N" "Install Nginx"
  print_tui_action_pair "P" "Install PHP-FPM (if needed)" "U" "Install/update app service"
  print_tui_action_pair "D" "Update Prisma (gen/mig)"
  print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
  if [[ "${SOURCE_MODE}" == "archive" ]]; then
    print_tui_action_pair "S" "Start deploy from current source" "Q" "Cancel"
    print_tui_hint_line "Tip: replace files in the archive source first; this menu only deploys what is already present."
  else
    print_tui_action_pair "S" "Start update + deploy" "Q" "Cancel"
    print_tui_hint_line "Tip: deploy.sh runs migrations/nginx/restarts; this menu sets wrapper + pass-through flags."
  fi
}

# Pulls the selected branch immediately from the TUI and reloads update.sh
# without running deploy. Useful when the remote-update banner shows a newer
# script version and the operator wants the new script/menu first.
run_tui_script_update_and_reload() {
  section "Script Update"

  if [[ "${SOURCE_MODE}" != "git" ]]; then
    log_warn "Archive source detected. Replace files in ${REPO_ROOT} and restart this menu instead of using git update actions."
    return 0
  fi

  if [[ "${SKIP_PULL}" == true ]]; then
    log_warn "Enable Pull latest changes first to grab and reload the script."
    return 0
  fi

  if [[ "${ALLOW_DIRTY}" != true ]] && git_worktree_dirty; then
    log_warn "Working tree is dirty. Commit/stash changes or enable Allow dirty worktree."
    return 0
  fi

  local before_commit=""
  local after_commit=""
  before_commit="$(git rev-parse --short=12 HEAD 2>/dev/null || true)"

  run_step "Fetching ${REMOTE_NAME}/${BRANCH}" run_deploy_path_cmd git fetch "${REMOTE_NAME}" "${BRANCH}" || return 0

  if [[ "$(current_branch_name)" != "${BRANCH}" ]]; then
    run_step "Checking out ${BRANCH}" run_deploy_path_cmd git checkout "${BRANCH}" || return 0
  fi

  run_step "Merging latest ${REMOTE_NAME}/${BRANCH}" run_deploy_path_cmd git merge --ff-only "${REMOTE_NAME}/${BRANCH}" || return 0
  after_commit="$(git rev-parse --short=12 HEAD 2>/dev/null || true)"
  log_info "Repository commit: $(git rev-parse --short HEAD)"
  maybe_restart_after_self_update "${before_commit}" "${after_commit}"
  log_info "No script update applied."
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
      printf "\r\033[K${CYAN}%s${NC} %s ${DIM}%s${NC}" "${SPINNER_FRAMES[$i]}" "${SPINNER_MSG}" "working..."
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

  printf "\r\033[K${final_color}%s${NC} %s\n" "${final_icon}" "${SPINNER_MSG}"
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
        local retry_success=false
        if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
          if echo "$MGS_SUDO_PASSWORD" | sudo -S rm -rf "${path}" 2>/dev/null; then
            retry_success=true
          fi
        elif sudo -n rm -rf "${path}" 2>/dev/null; then
          retry_success=true
        fi

        if [[ "${retry_success}" == true ]]; then
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
  [[ "${SOURCE_MODE}" == "git" ]] || return 1
  ! git -C "${REPO_ROOT}" diff --quiet || ! git -C "${REPO_ROOT}" diff --cached --quiet
}

# Returns the current git branch name or empty string if HEAD is detached.
current_branch_name() {
  [[ "${SOURCE_MODE}" == "git" ]] || return 0
  git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || true
}

archive_source_requires_permission_fix() {
  [[ "${SOURCE_MODE}" == "archive" ]] || return 1

  if [[ ! -r "${REPO_ROOT}/package.json" || ! -r "${REPO_ROOT}/package-lock.json" || ! -r "${REPO_ROOT}/deploy/deploy.sh" ]]; then
    return 0
  fi

  if [[ ! -w "${REPO_ROOT}" ]]; then
    return 0
  fi

  return 1
}

print_archive_source_permission_notes() {
  [[ "${SOURCE_MODE}" == "archive" ]] || return 0

  if [[ ! -r "${REPO_ROOT}/package.json" || ! -r "${REPO_ROOT}/package-lock.json" || ! -r "${REPO_ROOT}/deploy/deploy.sh" ]]; then
    log_warn "Archive source permissions look restrictive. Ensure the operator can read ${REPO_ROOT} before deploying."
  fi

  if [[ ! -w "${REPO_ROOT}" ]]; then
    log_warn "Archive source is not writable by the current user. Replacing files in ${REPO_ROOT} may require sudo/chown first."
  fi
}

verify_archive_source_access_for_deploy() {
  [[ "${SOURCE_MODE}" == "archive" ]] || return 0

  local required_path=""
  local required_paths=(
    "${REPO_ROOT}"
    "${REPO_ROOT}/package.json"
    "${REPO_ROOT}/package-lock.json"
    "${REPO_ROOT}/deploy/deploy.sh"
  )

  for required_path in "${required_paths[@]}"; do
    if ! test -r "${required_path}"; then
      log_error "Archive source path is not readable: ${required_path}"
      log_error "Fix ownership/permissions in ${REPO_ROOT} before deploying the extracted archive."
      exit 1
    fi
  done

  if should_use_sudo_for_deploy; then
    ensure_sudo_for_deploy_ready
    if ! run_deploy_path_cmd test -r "${REPO_ROOT}/package.json"; then
      log_error "Deploy user cannot read ${REPO_ROOT}/package.json via sudo."
      log_error "Fix source ownership/permissions before deploying this archive source."
      exit 1
    fi
  fi
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
  # If a sudo password is provided via environment, we should use it.
  if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
    return 0
  fi
  # Default to no global sudo execution
  return 1
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
    if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
      log_info "Sudo password provided in environment (length: ${#MGS_SUDO_PASSWORD}). Attempting piped authentication..."
      if ! printf '%s\n' "$MGS_SUDO_PASSWORD" | sudo -S -v 2>/dev/null; then
        log_error "Piped sudo authentication failed. Please check the provided password."
        exit 1
      fi
      log_info "Piped sudo authentication successful."
    elif ! sudo -n true 2>/dev/null; then
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
    if [[ "${SOURCE_MODE}" == "archive" ]]; then
      read -r -p "Select option [1-15, j, n, p, u, s, q]: " choice

      case "${choice,,}" in
        1)
          SKIP_DEPLOY="$(toggle_bool "${SKIP_DEPLOY}")"
          if [[ "${SKIP_DEPLOY}" == true ]]; then
            SSL_SETUP=false
          fi
          ;;
        2)
          cycle_update_sudo_mode
          ;;
        3)
          if [[ "${SKIP_DEPLOY}" == false ]]; then
            SKIP_DEPS="$(toggle_bool "${SKIP_DEPS}")"
          else
            log_warn "Enable deploy first to change deploy pass-through options."
          fi
          ;;
        4)
          if [[ "${SKIP_DEPLOY}" == false ]]; then
            SKIP_CRON_SETUP="$(toggle_bool "${SKIP_CRON_SETUP}")"
          else
            log_warn "Enable deploy first to change deploy pass-through options."
          fi
          ;;
        5)
          NO_SPINNER="$(toggle_bool "${NO_SPINNER}")"
          ;;
        6)
          section "Environment File (.env)"
          ensure_shared_env_file "${REPO_ROOT}/.env.example" || true
          edit_shared_env_now || true
          ;;
        7)
          INSTALL_CRON_IF_NEEDED="$(toggle_bool "${INSTALL_CRON_IF_NEEDED}")"
          ;;
        8)
          INSTALL_APP_SERVICE_IF_NEEDED="$(toggle_bool "${INSTALL_APP_SERVICE_IF_NEEDED}")"
          ;;
        9)
          INSTALL_CRON_JOBS_IF_NEEDED="$(toggle_bool "${INSTALL_CRON_JOBS_IF_NEEDED}")"
          ;;
        10)
          INSTALL_NGINX_IF_NEEDED="$(toggle_bool "${INSTALL_NGINX_IF_NEEDED}")"
          ;;
        11)
          INSTALL_PHP_FPM_IF_NEEDED="$(toggle_bool "${INSTALL_PHP_FPM_IF_NEEDED}")"
          ;;
        12)
          if [[ "${SKIP_DEPLOY}" == false ]]; then
            cycle_update_migration_mode
          else
            log_warn "Enable deploy first to change deploy pass-through options."
          fi
          ;;
        13)
          if [[ "${SKIP_DEPLOY}" == false ]]; then
            SSL_SETUP="$(toggle_bool "${SSL_SETUP}")"
            if [[ "${SSL_SETUP}" == true && ( -z "${SSL_DOMAIN}" || -z "${SSL_EMAIL}" ) ]]; then
              log_warn "SSL setup will use detected live values when available. Set domain/email explicitly if this host has no existing certbot config."
            fi
          else
            log_warn "Enable deploy first to configure SSL options."
          fi
          ;;
        14)
          if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
            SSL_DOMAIN="$(prompt_value "SSL domain" "${SSL_DOMAIN:-}")"
          else
            log_warn "Enable deploy + SSL setup first to edit SSL domain."
          fi
          ;;
        15)
          if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
            SSL_EMAIL="$(prompt_value "Certbot email" "${SSL_EMAIL:-}")"
          else
            log_warn "Enable deploy + SSL setup first to edit Certbot email."
          fi
          ;;
        j)
          ensure_managed_cron_jobs_installed_from_update || true
          ;;
        d)
          update_prisma_from_update || true
          ;;
        n)
          ensure_nginx_installed_from_update || true
          ;;
        p)
          ensure_php_fpm_installed_if_needed_from_update || true
          ;;
        u)
          install_app_systemd_service_from_update || true
          ;;
        s)
          if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
            if [[ -z "${SSL_DOMAIN}" ]]; then
              log_warn "SSL setup still needs a detected or explicit domain before deploy can start."
              continue
            fi

            if [[ -z "${SSL_EMAIL}" ]] && ssl_email_required_for_domain "${SSL_DOMAIN}"; then
              log_warn "SSL setup still needs a certbot email before deploy can start because no existing live certificate was found for ${SSL_DOMAIN}."
              continue
            fi
          fi
          break
          ;;
        q)
          log_warn "Update cancelled."
          exit 0
          ;;
        *)
          log_warn "Unknown selection. Choose a menu number, J/N/P/U, S, or Q."
          ;;
      esac
    else
      read -r -p "Select option [1-19, j, n, p, r, u, s, q]: " choice

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
          section "Environment File (.env)"
          ensure_shared_env_file "${REPO_ROOT}/.env.example" || true
          edit_shared_env_now || true
          ;;
        11)
          INSTALL_CRON_IF_NEEDED="$(toggle_bool "${INSTALL_CRON_IF_NEEDED}")"
          ;;
        12)
          INSTALL_APP_SERVICE_IF_NEEDED="$(toggle_bool "${INSTALL_APP_SERVICE_IF_NEEDED}")"
          ;;
        13)
          INSTALL_CRON_JOBS_IF_NEEDED="$(toggle_bool "${INSTALL_CRON_JOBS_IF_NEEDED}")"
          ;;
        14)
          INSTALL_NGINX_IF_NEEDED="$(toggle_bool "${INSTALL_NGINX_IF_NEEDED}")"
          ;;
        15)
          INSTALL_PHP_FPM_IF_NEEDED="$(toggle_bool "${INSTALL_PHP_FPM_IF_NEEDED}")"
          ;;
        16)
          if [[ "${SKIP_DEPLOY}" == false ]]; then
            cycle_update_migration_mode
          else
            log_warn "Enable deploy first to change deploy pass-through options."
          fi
          ;;
        17)
          if [[ "${SKIP_DEPLOY}" == false ]]; then
            SSL_SETUP="$(toggle_bool "${SSL_SETUP}")"
            if [[ "${SSL_SETUP}" == true ]]; then
              if [[ -z "${SSL_DOMAIN}" || -z "${SSL_EMAIL}" ]]; then
                log_warn "SSL setup will use detected live values when available. Set domain/email explicitly if this host has no existing certbot config."
              fi
            fi
          else
            log_warn "Enable deploy first to configure SSL options."
          fi
          ;;
        18)
          if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
            SSL_DOMAIN="$(prompt_value "SSL domain" "${SSL_DOMAIN:-}")"
          else
            log_warn "Enable deploy + SSL setup first to edit SSL domain."
          fi
          ;;
        19)
          if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
            SSL_EMAIL="$(prompt_value "Certbot email" "${SSL_EMAIL:-}")"
          else
            log_warn "Enable deploy + SSL setup first to edit Certbot email."
          fi
          ;;
        j)
          ensure_managed_cron_jobs_installed_from_update || true
          ;;
        d)
          update_prisma_from_update || true
          ;;
        n)
          ensure_nginx_installed_from_update || true
          ;;
        p)
          ensure_php_fpm_installed_if_needed_from_update || true
          ;;
        r)
          run_tui_script_update_and_reload
          ;;
        u)
          install_app_systemd_service_from_update || true
          ;;
        s)
          if [[ "${SKIP_DEPLOY}" == false && "${SSL_SETUP}" == true ]]; then
            if [[ -z "${SSL_DOMAIN}" ]]; then
              log_warn "SSL setup still needs a detected or explicit domain before deploy can start."
              continue
            fi

            if [[ -z "${SSL_EMAIL}" ]] && ssl_email_required_for_domain "${SSL_DOMAIN}"; then
              log_warn "SSL setup still needs a certbot email before deploy can start because no existing live certificate was found for ${SSL_DOMAIN}."
              continue
            fi
          fi
          break
          ;;
        q)
          log_warn "Update cancelled."
          exit 0
          ;;
        *)
          log_warn "Unknown selection. Choose a menu number, J/N/P/R/U, S, or Q."
          ;;
      esac
    fi
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
  if [[ "${SOURCE_MODE}" != "git" ]]; then
    will_pull="n/a"
  fi

  section "Update Summary"
  echo -e "  ${BOLD}Workflow${NC}"
  print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
  print_summary_row "Source" "${REPO_ROOT}"
  print_summary_row "Source mode" "$(source_mode_label)"
  if [[ "${SOURCE_MODE}" == "git" ]]; then
    print_summary_row "Remote" "${REMOTE_NAME}"
    print_summary_row "Branch" "${BRANCH}"
  else
    print_summary_row "Source detail" "${SOURCE_MODE_DETAIL}"
  fi
  print_summary_row "Git pull" "${will_pull}"
  print_summary_row "Run deploy" "${will_deploy}"
  if [[ "${SOURCE_MODE}" == "git" ]]; then
    print_summary_row "Allow dirty" "$(bool_word "${ALLOW_DIRTY}")"
  fi
  print_summary_row "Auto bootstrap" "$(bool_word "${AUTO_BOOTSTRAP}")"
  print_summary_row "Sudo mode" "$(update_sudo_mode_label)"
  print_summary_row "Install cron [DEPRECATED]" "$(bool_word "${INSTALL_CRON_IF_NEEDED}")"
  print_summary_row "Install service" "$(bool_word "${INSTALL_APP_SERVICE_IF_NEEDED}")"
  print_summary_row "Install systemd timers" "$(bool_word "${INSTALL_CRON_JOBS_IF_NEEDED}")"
  print_summary_row "Install nginx" "$(bool_word "${INSTALL_NGINX_IF_NEEDED}")"
  print_summary_row "Install PHP-FPM" "$(bool_word "${INSTALL_PHP_FPM_IF_NEEDED}")"
  print_summary_row "Spinner UI" "$(spinner_ui_word)"
  if [[ "${SKIP_DEPLOY}" == false ]]; then
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    echo -e "  ${BOLD}Deploy Pass-through${NC}"
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    print_summary_row "Effective sudo" "${sudo_mode}"
    print_summary_row "Install deps" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")"
    print_summary_row "Systemd timers" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")"
    print_summary_row "Database mode" "$(update_migration_mode_label)"
    print_summary_row "SSL setup" "$(bool_word "${SSL_SETUP}")"
    if [[ "${SSL_SETUP}" == true ]]; then
      print_summary_row "SSL domain" "${SSL_DOMAIN:-auto-detect}"
      print_summary_row "Certbot email" "${SSL_EMAIL:-required for new certs}"
    fi
  fi
  if [[ "${SOURCE_MODE}" == "archive" ]]; then
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    echo -e "  ${BOLD}${YELLOW}Archive source notes${NC}"
    print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
    print_summary_row "Update path" "Replace source files in place, then deploy current source"
    if archive_source_requires_permission_fix; then
      print_summary_row "Permissions" "Review ownership/permissions before replacing or deploying files"
    fi
  fi
  print_tui_panel_rule "${UPDATE_TUI_PANEL_WIDTH}"
}

# Builds and executes the deploy.sh command, passing through compatible flags.
# `deploy.sh` owns migrations, baseline recovery, nginx template sync, and
# service/nginx restarts; this wrapper only prepares git state and invocation.
run_deploy() {
  if [[ ! -x "${DEPLOY_SCRIPT}" ]]; then
    log_error "deploy.sh not found or not executable at ${DEPLOY_SCRIPT}"
    exit 1
  fi

  verify_archive_source_access_for_deploy

  local deploy_args=()
  local effective_ssl_domain="${SSL_DOMAIN}"
  local effective_ssl_email="${SSL_EMAIL}"

  if [[ "${SSL_SETUP}" == true ]]; then
    if [[ -z "${effective_ssl_domain}" ]]; then
      log_error "SSL setup requires a detected or explicit domain. Re-run with --domain or configure the live host Nginx settings first."
      exit 1
    fi

    if [[ -z "${effective_ssl_email}" ]] && ssl_email_required_for_domain "${effective_ssl_domain}"; then
      log_error "SSL setup requires a certbot email when no existing live certificate was found for ${effective_ssl_domain}. Re-run with --email or configure certbot on the host first."
      exit 1
    fi
  fi
  deploy_args+=( "--branch" "${BRANCH}" )
  deploy_args+=( "--skip-pull" )
  [[ "${AUTO_BOOTSTRAP}" == false ]] && deploy_args+=( "--no-auto-bootstrap" )
  [[ "${SKIP_DEPS}" == true ]] && deploy_args+=( "--skip-deps" )
  [[ "${SKIP_CRON_SETUP}" == true ]] && deploy_args+=( "--skip-cron" )
  [[ "${SKIP_MIGRATE}" == true ]] && deploy_args+=( "--skip-migrate" )
  [[ "${DB_PUSH}" == true ]] && deploy_args+=( "--db-push" )
  if [[ "${SSL_SETUP}" == true ]]; then
    deploy_args+=( "--ssl" "--domain" "${effective_ssl_domain}" )
    [[ -n "${effective_ssl_email}" ]] && deploy_args+=( "--email" "${effective_ssl_email}" )
  fi
  [[ "${INSTALL_NGINX_IF_NEEDED}" == true ]] && deploy_args+=( "--install-nginx" )
  [[ "${INSTALL_PHP_FPM_IF_NEEDED}" == true ]] && deploy_args+=( "--install-php-fpm-if-needed" )
  [[ "${INSTALL_CRON_IF_NEEDED}" == true ]] && deploy_args+=( "--install-cron" )
  [[ "${INSTALL_APP_SERVICE_IF_NEEDED}" == true ]] && deploy_args+=( "--install-app-service" )
  [[ "${INSTALL_CRON_JOBS_IF_NEEDED}" == true ]] && deploy_args+=( "--install-cron-jobs" )
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
    sudo_env_args+=( "MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT=1" )
    if [[ "${MGS_SKIP_SELF_UPDATE_KEYPRESS:-0}" == "1" ]]; then
      sudo_env_args+=( "MGS_SKIP_SELF_UPDATE_KEYPRESS=1" )
    fi
    if [[ -n "${NODE_OPTIONS:-}" ]]; then
      sudo_env_args+=( "NODE_OPTIONS=${NODE_OPTIONS}" )
    fi
    if [[ -n "${NEXT_LOW_MEMORY_BUILD:-}" ]]; then
      sudo_env_args+=( "NEXT_LOW_MEMORY_BUILD=${NEXT_LOW_MEMORY_BUILD}" )
    fi

    if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
      sudo_env_args+=( "MGS_SUDO_PASSWORD=${MGS_SUDO_PASSWORD}" )
    fi
    if [[ -n "${MGS_SUDO_USER:-}" ]]; then
      sudo_env_args+=( "MGS_SUDO_USER=${MGS_SUDO_USER}" )
    fi

    if (( ${#sudo_env_args[@]} > 0 )); then
      if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
        printf '%s\n' "$MGS_SUDO_PASSWORD" | sudo -S -p '' env "${sudo_env_args[@]}" "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
      else
        sudo env "${sudo_env_args[@]}" "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
      fi
    else
      if [[ -n "${MGS_SUDO_PASSWORD:-}" ]]; then
        printf '%s\n' "$MGS_SUDO_PASSWORD" | sudo -S -p '' "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
      else
        sudo "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
      fi
    fi
  else
    MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT=1 "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
  fi

  log_info "Post-deploy cache cleanup..."
  cleanup_local_install_and_build_caches
}

# Ensures the deployed standalone runtime has the Documentation markdown files
# used by /admin/manual, even when the wrapper is driving deploy.sh. deploy.sh
# now performs this copy itself, but this post-deploy sync keeps wrapper runs
# resilient and makes the behavior explicit in both scripts.
sync_manual_docs_into_current_standalone_from_update() {
  local docs_src="${REPO_ROOT}/Documentation"
  local standalone_dir="${CURRENT_LINK}/.next/standalone"
  local docs_dst="${standalone_dir}/Documentation"

  if [[ ! -d "${docs_src}" ]]; then
    log_warn "Documentation source not found at ${docs_src}; skipping manual docs sync."
    return 0
  fi

  if [[ ! -d "${standalone_dir}" ]]; then
    log_warn "Standalone runtime not found at ${standalone_dir}; skipping manual docs sync."
    return 0
  fi

  # deploy.sh now copies Documentation into the standalone runtime directly.
  # Keep this wrapper helper as a fallback only, and avoid re-copying files
  # when the target docs already exist after deploy.sh completes.
  if [[ -d "${docs_dst}" ]] && compgen -G "${docs_dst}/*.md" >/dev/null 2>&1; then
    log_info "Manual docs already present in standalone runtime; skipping wrapper sync."
    return 0
  fi

  section "Manual Docs"
  log_info "Syncing Documentation markdown files into standalone runtime..."

  run_deploy_path_cmd rm -rf "${docs_dst}"
  run_deploy_path_cmd cp -r "${docs_src}" "${standalone_dir}/"

  log_info "Manual docs synced to ${docs_dst}"
}

# Notifies the admin and generates a public announcement file after a successful
# update. It delegates the logic to a Node.js script that uses the application's
# mail service and templates.
notify_updates() {
  section "Notifications"
  log_info "Sending system update notifications..."

  local notify_repo_root="${CURRENT_LINK}"
  local shared_env_path="${SHARED_DIR}/.env"
  local notify_database_url=""
  local notify_cmd=""

  if [[ ! -d "${notify_repo_root}" ]]; then
    log_warn "Current release path not found (${notify_repo_root}); falling back to source repo for notifications."
    notify_repo_root="${REPO_ROOT}"
  fi

  if [[ -f "${shared_env_path}" ]]; then
    notify_database_url="$(read_env_file_value_from_update "${shared_env_path}" "DATABASE_URL" || true)"
  fi

  # Run notification script from the deployed release so runtime dependencies
  # (including Prisma adapter packages) resolve from the deployed node_modules.
  notify_cmd="cd '${notify_repo_root}' && npx tsx scripts/notify-updates.ts"

  if [[ -n "${notify_database_url}" ]]; then
    if ! run_deploy_path_cmd env REPO_ROOT="${notify_repo_root}" SHARED_DIR="${SHARED_DIR}" DATABASE_URL="${notify_database_url}" bash -lc "${notify_cmd}"; then
      log_warn "System update notification script failed; continuing."
      return 0
    fi
  elif ! run_deploy_path_cmd env REPO_ROOT="${notify_repo_root}" SHARED_DIR="${SHARED_DIR}" bash -lc "${notify_cmd}"; then
    log_warn "System update notification script failed; continuing."
    return 0
  fi

  log_info "Update notifications complete"
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
    --ssl) SSL_SETUP=true; CLI_SSL_FLAG_SET=true; shift ;;
    --domain) SSL_DOMAIN="$2"; CLI_SSL_DOMAIN_SET=true; shift 2 ;;
    --email) SSL_EMAIL="$2"; CLI_SSL_EMAIL_SET=true; shift 2 ;;
    --allow-dirty) ALLOW_DIRTY=true; shift ;;
    --sudo-deploy) FORCE_SUDO_DEPLOY=true; shift ;;
    --no-sudo-deploy) FORCE_NO_SUDO_DEPLOY=true; shift ;;
    --interactive) INTERACTIVE=true; shift ;;
    --install-nginx) INSTALL_NGINX_IF_NEEDED=true; shift ;;
    --install-php-fpm-if-needed) INSTALL_PHP_FPM_IF_NEEDED=true; shift ;;
    --install-cron) INSTALL_CRON_IF_NEEDED=true; shift ;;
    --install-app-service) INSTALL_APP_SERVICE_IF_NEEDED=true; shift ;;
    --install-cron-jobs) INSTALL_CRON_JOBS_IF_NEEDED=true; shift ;;
    --no-auto-bootstrap) AUTO_BOOTSTRAP=false; shift ;;
    --no-spinner) NO_SPINNER=true; shift ;;
    --no-color) NO_COLOR=true; shift ;;
    --help|-h) show_usage; exit 0 ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

detect_tty_capabilities

# Validate source context early so the wrapper can run against either a git
# checkout or an extracted archive source tree.
resolve_source_root_for_update
if [[ "${SOURCE_MODE}" == "invalid" ]]; then
  log_error "This script must be run from a deployable source tree."
  log_error "${SOURCE_MODE_DETAIL}"
  exit 1
fi

# Normalize to the detected source root so deploy/update behavior remains stable
# even when the operator starts this script from ./deploy.
cd "${REPO_ROOT}"
log_info "Source root: ${REPO_ROOT}"
log_info "Source mode: $(source_mode_label)"
log_info "Source detail: ${SOURCE_MODE_DETAIL}"
print_archive_source_permission_notes

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

if [[ "${SOURCE_MODE}" == "git" && -z "${BRANCH}" ]]; then
  BRANCH="$(current_branch_name)"
fi
if [[ -z "${BRANCH}" ]]; then
  BRANCH="main"
  if [[ "${SOURCE_MODE}" == "git" ]]; then
    log_warn "Could not determine current branch (detached HEAD). Defaulting to ${BRANCH}."
  fi
fi

detect_previous_deploy_defaults_from_host
auto_enable_bootstrap_defaults_from_update

if [[ "${DB_PUSH}" == true ]]; then
  SKIP_MIGRATE=true
fi

if [[ "${SSL_SETUP}" == true && "${INTERACTIVE}" == false ]]; then
  if [[ -z "${SSL_DOMAIN}" ]]; then
    log_error "SSL setup requires a detected or explicit domain when running non-interactively."
    exit 1
  fi

  if [[ -z "${SSL_EMAIL}" ]] && ssl_email_required_for_domain "${SSL_DOMAIN}"; then
    log_error "SSL setup requires a certbot email when no existing live certificate was found for ${SSL_DOMAIN}."
    exit 1
  fi
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

if [[ "${SKIP_DEPLOY}" == true ]]; then
  if [[ "${INSTALL_NGINX_IF_NEEDED}" == true ]]; then
    ensure_nginx_installed_from_update
  fi

  if [[ "${INSTALL_PHP_FPM_IF_NEEDED}" == true ]]; then
    ensure_php_fpm_installed_if_needed_from_update
  fi

  # --install-cron is deprecated: systemd timers no longer require cron/crond package.
  # This flag is kept for backward compatibility but now shows a deprecation notice.
  if [[ "${INSTALL_CRON_IF_NEEDED}" == true ]]; then
    log_warn "--install-cron is deprecated: systemd timers are now used instead."
    log_warn "The cron/crond package is no longer required for scheduled jobs."
    log_warn "Use --install-cron-jobs to install systemd timers (default behavior)."
  fi

  if [[ "${INSTALL_APP_SERVICE_IF_NEEDED}" == true ]]; then
    install_app_systemd_service_from_update
  fi

  if [[ "${INSTALL_CRON_JOBS_IF_NEEDED}" == true ]]; then
    ensure_managed_cron_jobs_installed_from_update
  fi
fi

if [[ "${SOURCE_MODE}" == "git" ]]; then
  section "Git Update"
  log_info "Repository branch: $(current_branch_name)"

  if [[ "${ALLOW_DIRTY}" != true ]] && git_worktree_dirty; then
    log_error "Working tree is dirty. Commit/stash changes or rerun with --allow-dirty."
    git -C "${REPO_ROOT}" status --short
    exit 1
  fi

  if [[ "${SKIP_PULL}" == false ]]; then
    local_before_pull_commit="$(git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || true)"
    # Fetch/pull stays in the persistent repo clone; deploy.sh then rsyncs a clean
    # release directory so runtime symlink switches remain atomic.
    run_step "Fetching ${REMOTE_NAME}/${BRANCH}" run_deploy_path_cmd git -C "${REPO_ROOT}" fetch "${REMOTE_NAME}" "${BRANCH}"

    if [[ "$(current_branch_name)" != "${BRANCH}" ]]; then
      run_step "Checking out ${BRANCH}" run_deploy_path_cmd git -C "${REPO_ROOT}" checkout "${BRANCH}"
    fi

    # Use ff-only to avoid accidental merge commits on production clones.
    run_step "Merging latest ${REMOTE_NAME}/${BRANCH}" run_deploy_path_cmd git -C "${REPO_ROOT}" merge --ff-only "${REMOTE_NAME}/${BRANCH}"
    local_after_pull_commit="$(git -C "${REPO_ROOT}" rev-parse --short=12 HEAD 2>/dev/null || true)"
    log_info "Updated to commit $(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
    maybe_restart_after_self_update "${local_before_pull_commit}" "${local_after_pull_commit}"
  else
    log_info "Skipping git pull"
  fi
else
  section "Archive Source"
  log_info "Archive source mode detected. Git pull/update actions are unavailable."
  log_info "Replace files in ${REPO_ROOT}, then re-run this wrapper to deploy the updated source tree."
fi

if [[ "${SKIP_DEPLOY}" == false ]]; then
  section "Environment File (.env)"
  ensure_shared_env_file "${REPO_ROOT}/.env.example" || true
  maybe_edit_shared_env_before_deploy "${REPO_ROOT}"
  run_deploy
  sync_manual_docs_into_current_standalone_from_update
  notify_updates
else
  section "Deploy"
  log_info "Skipping deployment"
fi

section "Complete"
log_info "Update workflow finished"
