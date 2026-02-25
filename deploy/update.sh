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

# Runtime configuration defaults. Branch defaults to the current checked-out
# branch later so server operators can simply run ./deploy/update.sh.
REMOTE_NAME="origin"
BRANCH=""
SKIP_PULL=false
SKIP_DEPLOY=false
SKIP_DEPS=false
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

# Shared presentation helpers keep update.sh visually consistent with deploy.sh.
print_banner() {
  echo ""
  echo -e "${BOLD}${CYAN}╭──────────────────────────────────────────────╮${NC}"
  echo -e "${BOLD}${CYAN}│${NC} ${BOLD}Melbourne Guitar School Update${NC}${DIM} (+ deploy)${NC} ${BOLD}${CYAN}│${NC}"
  echo -e "${BOLD}${CYAN}╰──────────────────────────────────────────────╯${NC}"
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
  echo -e "${BOLD}${BLUE}▶ $1${NC}"
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

# Interactive prompt flow for the update wrapper. It mirrors deploy.sh options
# and adds git update controls so operators can run one command end-to-end.
run_interactive_setup() {
  section "Interactive Options"
  BRANCH="$(prompt_value "Git branch to update/deploy" "${BRANCH}")"
  REMOTE_NAME="$(prompt_value "Git remote" "${REMOTE_NAME}")"

  if prompt_yes_no "Pull latest changes from git before deploy?" "y"; then
    SKIP_PULL=false
  else
    SKIP_PULL=true
  fi

  if prompt_yes_no "Run deployment after update?" "y"; then
    SKIP_DEPLOY=false
  else
    SKIP_DEPLOY=true
  fi

  if [[ "${SKIP_DEPLOY}" == false ]]; then
    if prompt_yes_no "Skip npm install?" "n"; then
      SKIP_DEPS=true
    fi

    if prompt_yes_no "Use prisma db push instead of migrations?" "n"; then
      DB_PUSH=true
      SKIP_MIGRATE=true
    elif prompt_yes_no "Skip database migrations?" "n"; then
      SKIP_MIGRATE=true
    fi

    local ssl_default="n"
    [[ "${SSL_SETUP}" == true ]] && ssl_default="y"
    if prompt_yes_no "Run SSL setup after deploy?" "${ssl_default}"; then
      SSL_SETUP=true
      SSL_DOMAIN="$(prompt_value "SSL domain" "${SSL_DOMAIN:-melbourneguitarschool.com.au}")"
      SSL_EMAIL="$(prompt_value "Certbot email" "${SSL_EMAIL:-melbourneguitarschool@gmail.com}")"
    else
      SSL_SETUP=false
    fi
  fi
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
  echo -e "  ${DIM}Repo:${NC}        $(pwd)"
  echo -e "  ${DIM}Remote:${NC}      ${REMOTE_NAME}"
  echo -e "  ${DIM}Branch:${NC}      ${BRANCH}"
  echo -e "  ${DIM}Git pull:${NC}    ${will_pull}"
  echo -e "  ${DIM}Deploy:${NC}      ${will_deploy}"
  if [[ "${SKIP_DEPLOY}" == false ]]; then
    echo -e "  ${DIM}Use sudo:${NC}    ${sudo_mode}"
    echo -e "  ${DIM}Skip deps:${NC}   ${SKIP_DEPS}"
    echo -e "  ${DIM}Skip migrate:${NC} ${SKIP_MIGRATE}"
    echo -e "  ${DIM}DB push:${NC}     ${DB_PUSH}"
    echo -e "  ${DIM}SSL setup:${NC}   ${SSL_SETUP}"
    if [[ "${SSL_SETUP}" == true ]]; then
      echo -e "  ${DIM}Domain:${NC}      ${SSL_DOMAIN}"
      echo -e "  ${DIM}Email:${NC}       ${SSL_EMAIL}"
    fi
  fi
}

# Builds and executes the deploy.sh command, passing through compatible flags.
run_deploy() {
  if [[ ! -x "${DEPLOY_SCRIPT}" ]]; then
    log_error "deploy.sh not found or not executable at ${DEPLOY_SCRIPT}"
    exit 1
  fi

  local deploy_args=()
  deploy_args+=( "--branch" "${BRANCH}" )
  [[ "${SKIP_DEPS}" == true ]] && deploy_args+=( "--skip-deps" )
  [[ "${SKIP_MIGRATE}" == true ]] && deploy_args+=( "--skip-migrate" )
  [[ "${DB_PUSH}" == true ]] && deploy_args+=( "--db-push" )
  [[ "${SSL_SETUP}" == true ]] && deploy_args+=( "--ssl" "--domain" "${SSL_DOMAIN}" "--email" "${SSL_EMAIL}" )
  [[ "${NO_SPINNER}" == true ]] && deploy_args+=( "--no-spinner" )
  [[ "${NO_COLOR}" == true ]] && deploy_args+=( "--no-color" )

  section "Deploy"
  log_info "Invoking ${DEPLOY_SCRIPT} ${deploy_args[*]}"

  if should_use_sudo_for_deploy; then
    sudo "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
  else
    "${DEPLOY_SCRIPT}" "${deploy_args[@]}"
  fi
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

section "Git Update"
log_info "Repository branch: $(current_branch_name)"

if [[ "${ALLOW_DIRTY}" != true ]] && git_worktree_dirty; then
  log_error "Working tree is dirty. Commit/stash changes or rerun with --allow-dirty."
  git status --short
  exit 1
fi

if [[ "${SKIP_PULL}" == false ]]; then
  run_step "Fetching ${REMOTE_NAME}/${BRANCH}" git fetch "${REMOTE_NAME}" "${BRANCH}"

  if [[ "$(current_branch_name)" != "${BRANCH}" ]]; then
    run_step "Checking out ${BRANCH}" git checkout "${BRANCH}"
  fi

  # Use ff-only to avoid accidental merge commits on production clones.
  run_step "Pulling latest ${REMOTE_NAME}/${BRANCH}" git pull --ff-only "${REMOTE_NAME}" "${BRANCH}"
  log_info "Updated to commit $(git rev-parse --short HEAD)"
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
