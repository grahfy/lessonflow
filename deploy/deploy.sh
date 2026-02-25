#!/bin/bash
# =============================================================================
# Melbourne Guitar School - Deployment Script
# =============================================================================
# Usage: ./deploy/deploy.sh [options]
#
# Options:
#   --skip-migrate    Skip database migrations
#   --skip-deps       Skip npm install
#   --branch BRANCH   Git branch to deploy (default: main)
#   --rollback        Rollback to previous release
#   --setup-packages  Run package installation first (requires root)
#   --ssl             Run SSL setup after deployment
#   --domain DOMAIN   Domain for SSL certificate
#   --email EMAIL     Email for SSL certificate
#   --interactive     Prompt for deploy options in TTY mode
#   --no-spinner      Disable spinner UI
#   --no-color        Disable colored output
#   --help            Show usage
#
# Prerequisites (unless --setup-packages):
#   - Node.js 20+ installed
#   - MySQL database configured
#   - Environment file at /var/www/melbourne-guitar-school/shared/.env
#   - Nginx and systemd configured
# =============================================================================

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(pwd)"

# Configuration
APP_NAME="melbourne-guitar-school"
DEPLOY_DIR="/var/www/${APP_NAME}"
RELEASES_DIR="${DEPLOY_DIR}/releases"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
KEEP_RELEASES=5
DEFAULT_BUILD_NODE_HEAP_MB="${DEFAULT_BUILD_NODE_HEAP_MB:-3072}"
LOW_RAM_1GB_AUTO_HEAP_MB="${LOW_RAM_1GB_AUTO_HEAP_MB:-3072}"
LOW_RAM_2GB_AUTO_HEAP_MB="${LOW_RAM_2GB_AUTO_HEAP_MB:-1024}"
LOW_RAM_1GB_NEXT_BUILD_HEAP_MB="${LOW_RAM_1GB_NEXT_BUILD_HEAP_MB:-768}"
LOW_RAM_2GB_NEXT_BUILD_HEAP_MB="${LOW_RAM_2GB_NEXT_BUILD_HEAP_MB:-768}"
TEMP_BUILD_SWAP_AUTO_ENABLED="${TEMP_BUILD_SWAP_AUTO_ENABLED:-true}"
LOW_RAM_1GB_TEMP_BUILD_SWAP_MB="${LOW_RAM_1GB_TEMP_BUILD_SWAP_MB:-2048}"
LOW_RAM_2GB_TEMP_BUILD_SWAP_MB="${LOW_RAM_2GB_TEMP_BUILD_SWAP_MB:-1024}"
TEMP_BUILD_SWAP_MIN_EXISTING_MB="${TEMP_BUILD_SWAP_MIN_EXISTING_MB:-512}"
TEMP_BUILD_SWAP_PATH="${TEMP_BUILD_SWAP_PATH:-/var/tmp/${APP_NAME}-build.swap}"
LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
TMP_CLEANUP_MAX_AGE_DAYS=3
BRANCH="main"
SKIP_MIGRATE=false
SKIP_DEPS=false
ROLLBACK=false
SETUP_PACKAGES=false
SSL_SETUP=false
SSL_DOMAIN=""
SSL_EMAIL=""
DB_PUSH=false
TIMESTAMP=""
NEW_RELEASE_DIR=""
INTERACTIVE=false
NO_SPINNER=false
NO_COLOR=false
IS_TTY=false
SPINNER_PID=""
SPINNER_MSG=""
SPINNER_FRAMES=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
TEMP_BUILD_SWAP_ACTIVE=false
TEMP_BUILD_SWAP_CREATED_FILE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Helper functions
# Print usage information for CLI and automation contexts.
show_usage() {
    cat <<'EOF'
Melbourne Guitar School - Deployment Script

Usage: ./deploy/deploy.sh [options]

Options:
  --skip-migrate    Skip database migrations
  --skip-deps       Skip npm install
  --branch BRANCH   Git branch to deploy (default: main)
  --rollback        Rollback to previous release
  --setup-packages  Run package installation first (requires root)
  --ssl             Run SSL setup after deployment
  --domain DOMAIN   Domain for SSL certificate
  --email EMAIL     Email for SSL certificate
  --interactive     Prompt for deploy options in TTY mode
  --no-spinner      Disable spinner UI
  --no-color        Disable colored output
  --help, -h        Show usage
EOF
}

# Detect whether we can safely render an interactive UI (spinner/prompts).
detect_tty_capabilities() {
    if [[ -t 0 && -t 1 ]]; then
        IS_TTY=true
    fi

    if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
        RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' NC=''
    fi
}

# Render a lightweight banner so manual deploy runs are easier to scan.
print_banner() {
    echo ""
    echo -e "${BOLD}${CYAN}╭──────────────────────────────────────────────╮${NC}"
    echo -e "${BOLD}${CYAN}│${NC} ${BOLD}Melbourne Guitar School Deploy${NC}${DIM} (Next.js)${NC} ${BOLD}${CYAN}│${NC}"
    echo -e "${BOLD}${CYAN}╰──────────────────────────────────────────────╯${NC}"
}

# Standardized info line for quick, readable progress output.
log_info() {
    echo -e "${GREEN}●${NC} $1"
}

# Standardized error line with stronger color contrast.
log_error() {
    echo -e "${RED}✖${NC} $1"
}

# Standardized warning line used for recoverable issues.
log_warn() {
    echo -e "${YELLOW}▲${NC} $1"
}

# Emit a section heading to visually separate deploy phases.
section() {
    echo ""
    echo -e "${BOLD}${BLUE}▶ $1${NC}"
}

# Prompt for a yes/no choice when running interactively.
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

# Prompt for a value while supporting a visible default for common deploy fields.
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

# Ask for deploy options in a TTY so one command can serve both scripted and manual deploys.
run_interactive_setup() {
    section "Interactive Options"
    BRANCH="$(prompt_value "Git branch to deploy" "${BRANCH}")"

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
}

# Print a compact summary before executing so deploy choices are explicit.
print_deploy_summary() {
    section "Deploy Summary"
    echo -e "  ${DIM}App:${NC}        ${APP_NAME}"
    echo -e "  ${DIM}Branch:${NC}     ${BRANCH}"
    echo -e "  ${DIM}Skip deps:${NC}  ${SKIP_DEPS}"
    echo -e "  ${DIM}Skip migrate:${NC} ${SKIP_MIGRATE}"
    echo -e "  ${DIM}DB push:${NC}    ${DB_PUSH}"
    echo -e "  ${DIM}SSL setup:${NC}  ${SSL_SETUP}"
    if [[ "${SSL_SETUP}" == true ]]; then
        echo -e "  ${DIM}Domain:${NC}     ${SSL_DOMAIN}"
        echo -e "  ${DIM}Email:${NC}      ${SSL_EMAIL}"
    fi
}

# Background spinner used by run_step for long-running commands while preserving command logs.
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

# Stop the spinner and render a final status line.
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

# Run a command with captured output and a spinner; on failure, print the tail of the log.
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

# Repair a corrupted npm cache (common after interrupted deploys/reboots) so a
# transient cache ENOENT does not require manual operator intervention.
repair_npm_cache() {
    log_warn "Attempting npm cache repair..."

    if run_step "Verifying npm cache" npm cache verify; then
        return 0
    fi

    log_warn "npm cache verify failed; forcing cache clean..."
    run_step "Cleaning npm cache" npm cache clean --force
}

# Run an npm command and retry once after repairing the npm cache if it fails.
run_npm_step_with_cache_repair() {
    local message="$1"
    shift

    if run_step "${message}" "$@"; then
        return 0
    fi

    log_warn "${message} failed. Retrying once after npm cache repair."
    repair_npm_cache
    run_step "${message} (retry)" "$@"
}

current_release_name() {
    if [[ -L "${CURRENT_LINK}" ]]; then
        readlink -f "${CURRENT_LINK}" 2>/dev/null | xargs basename
        return 0
    fi

    return 1
}

cleanup_old_releases() {
    if [[ ! -d "${RELEASES_DIR}" ]]; then
        return 0
    fi

    local current_release=""
    current_release="$(current_release_name 2>/dev/null || true)"
    local kept=0
    local removed=0

    while IFS= read -r release; do
        [[ -z "${release}" ]] && continue

        # Keep the newest N releases, but also preserve the active release even
        # if it is older (for example immediately after a rollback).
        if (( kept < KEEP_RELEASES )); then
            kept=$((kept + 1))
            continue
        fi

        if [[ -n "${current_release}" && "${release}" == "${current_release}" ]]; then
            log_info "Preserving active release outside keep window: ${release}"
            continue
        fi

        rm -rf "${RELEASES_DIR:?}/${release}"
        removed=$((removed + 1))
        log_info "Removed old release: ${release}"
    done < <(ls -1t "${RELEASES_DIR}" 2>/dev/null || true)

    if (( removed == 0 )); then
        log_info "No old releases removed"
    fi
}

cleanup_old_temp_files() {
    local removed=0
    local root=""
    local path=""

    # Reclaim disk from stale build/package-manager temp directories that are
    # commonly left behind by interrupted deploys and failed builds.
    for root in /tmp /var/tmp; do
        [[ -d "${root}" ]] || continue

        while IFS= read -r -d '' path; do
            [[ -z "${path}" ]] && continue
            rm -rf "${path}" || {
                log_warn "Failed to remove temp path: ${path}"
                continue
            }
            removed=$((removed + 1))
            log_info "Removed old temp path: ${path}"
        done < <(
            find "${root}" \
                -mindepth 1 -maxdepth 1 \
                \( -type d -o -type f \) \
                \( \
                    -name 'next-*' -o \
                    -name 'npm-*' -o \
                    -name 'npx-*' -o \
                    -name 'node-*' -o \
                    -name 'corepack-*' -o \
                    -name 'pnpm-*' -o \
                    -name 'tsx-*' \
                \) \
                -mtime +"${TMP_CLEANUP_MAX_AGE_DAYS}" \
                -print0 2>/dev/null || true
        )
    done

    local npm_cache_tmp="${HOME:-/root}/.npm/_cacache/tmp"
    if [[ -d "${npm_cache_tmp}" ]]; then
        while IFS= read -r -d '' path; do
            [[ -z "${path}" ]] && continue
            rm -rf "${path}" || {
                log_warn "Failed to remove npm cache tmp path: ${path}"
                continue
            }
            removed=$((removed + 1))
            log_info "Removed old npm cache tmp path: ${path}"
        done < <(
            find "${npm_cache_tmp}" -mindepth 1 -mtime +"${TMP_CLEANUP_MAX_AGE_DAYS}" -print0 2>/dev/null || true
        )
    fi

    if (( removed == 0 )); then
        log_info "No old temp files removed"
    fi
}

# Removes install/build caches that can grow significantly during deployment.
# This runs as a best-effort cleanup so disk pressure from npm cache writes and
# Next.js build caches does not accumulate across releases or block later steps.
cleanup_install_and_build_caches() {
    local removed=0
    local path=""
    local npm_cache_root="${HOME:-/root}/.npm"

    for path in \
        ".next/cache" \
        "node_modules/.cache" \
        "${npm_cache_root}/_cacache" \
        "${npm_cache_root}/_logs"
    do
        [[ -e "${path}" ]] || continue
        rm -rf "${path}" || {
            log_warn "Failed to remove cache path: ${path}"
            continue
        }
        removed=$((removed + 1))
        log_info "Removed cache path: ${path}"
    done

    # npm's cache metadata can persist after manual directory cleanup depending
    # on the npm version, so run an explicit clean as a non-fatal final pass.
    if command -v npm >/dev/null 2>&1; then
        if npm cache clean --force >/dev/null 2>&1; then
            log_info "Cleared npm cache metadata"
        else
            log_warn "npm cache clean failed; continuing deployment"
        fi
    fi

    if (( removed == 0 )); then
        log_info "No install/build caches removed"
    fi
}

# Detects total configured swap in MB on Linux hosts. Returns empty when the
# platform does not expose the Linux /proc interface used here.
detect_total_swap_mb() {
    local swap_kb=""

    if [[ -r "/proc/meminfo" ]]; then
        swap_kb="$(awk '/^SwapTotal:/ { print $2; exit }' /proc/meminfo 2>/dev/null || true)"
        if [[ "${swap_kb}" =~ ^[0-9]+$ ]]; then
            echo $((swap_kb / 1024))
            return 0
        fi
    fi

    return 1
}

# Creates temporary swap during the Next.js build on low-memory Linux hosts.
# The function is best-effort and safely skips setup when prerequisites are
# missing or when sufficient swap already exists on the machine.
ensure_temporary_build_swap() {
    local total_ram_mb=""
    local total_swap_mb="0"
    local swap_mb=""

    if [[ "${TEMP_BUILD_SWAP_AUTO_ENABLED}" != "true" ]]; then
        log_info "Temporary build swap disabled by TEMP_BUILD_SWAP_AUTO_ENABLED=${TEMP_BUILD_SWAP_AUTO_ENABLED}"
        return 0
    fi

    if [[ "${OSTYPE:-}" != linux* ]]; then
        log_info "Temporary build swap is only supported on Linux hosts"
        return 0
    fi

    if [[ ${EUID} -ne 0 ]]; then
        log_warn "Cannot create temporary build swap without root privileges"
        return 0
    fi

    if ! command -v mkswap >/dev/null 2>&1 || ! command -v swapon >/dev/null 2>&1 || ! command -v swapoff >/dev/null 2>&1; then
        log_warn "Swap tools not available (mkswap/swapon/swapoff); skipping temporary build swap"
        return 0
    fi

    total_ram_mb="$(detect_total_ram_mb || true)"
    if [[ -z "${total_ram_mb}" ]]; then
        log_info "Could not detect system RAM; skipping temporary build swap auto setup"
        return 0
    fi

    if (( total_ram_mb >= LOW_RAM_1GB_AUTO_HEAP_MIN_MB && total_ram_mb <= LOW_RAM_1GB_AUTO_HEAP_MAX_MB )); then
        swap_mb="${LOW_RAM_1GB_TEMP_BUILD_SWAP_MB}"
    elif (( total_ram_mb >= LOW_RAM_2GB_AUTO_HEAP_MIN_MB && total_ram_mb <= LOW_RAM_2GB_AUTO_HEAP_MAX_MB )); then
        swap_mb="${LOW_RAM_2GB_TEMP_BUILD_SWAP_MB}"
    else
        log_info "Detected ${total_ram_mb}MB RAM; skipping temporary build swap"
        return 0
    fi

    total_swap_mb="$(detect_total_swap_mb || echo 0)"
    if [[ "${total_swap_mb}" =~ ^[0-9]+$ ]] && (( total_swap_mb >= TEMP_BUILD_SWAP_MIN_EXISTING_MB )); then
        log_info "Detected ${total_swap_mb}MB existing swap; skipping temporary build swap"
        return 0
    fi

    if grep -qE "[[:space:]]${TEMP_BUILD_SWAP_PATH//\//\\/}([[:space:]]|$)" /proc/swaps 2>/dev/null; then
        TEMP_BUILD_SWAP_ACTIVE=true
        log_info "Temporary build swap already active: ${TEMP_BUILD_SWAP_PATH}"
        return 0
    fi

    if [[ -e "${TEMP_BUILD_SWAP_PATH}" ]]; then
        log_warn "Removing stale temporary swap file: ${TEMP_BUILD_SWAP_PATH}"
        rm -f "${TEMP_BUILD_SWAP_PATH}" || {
            log_warn "Failed to remove stale temporary swap file; skipping temporary build swap"
            return 0
        }
    fi

    log_warn "Creating temporary build swap (${swap_mb}MB) at ${TEMP_BUILD_SWAP_PATH}"
    if command -v fallocate >/dev/null 2>&1; then
        fallocate -l "${swap_mb}M" "${TEMP_BUILD_SWAP_PATH}" 2>/dev/null || dd if=/dev/zero of="${TEMP_BUILD_SWAP_PATH}" bs=1M count="${swap_mb}" status=none
    else
        dd if=/dev/zero of="${TEMP_BUILD_SWAP_PATH}" bs=1M count="${swap_mb}" status=none
    fi

    chmod 600 "${TEMP_BUILD_SWAP_PATH}"
    mkswap "${TEMP_BUILD_SWAP_PATH}" >/dev/null
    swapon "${TEMP_BUILD_SWAP_PATH}"

    TEMP_BUILD_SWAP_ACTIVE=true
    TEMP_BUILD_SWAP_CREATED_FILE=true
    log_warn "Enabled temporary build swap (${swap_mb}MB)"
}

# Removes the temporary build swap file created by this script. The function is
# idempotent so it can run both after a successful build and from the EXIT trap.
cleanup_temporary_build_swap() {
    if [[ "${TEMP_BUILD_SWAP_ACTIVE}" != true ]]; then
        return 0
    fi

    if [[ "${OSTYPE:-}" == linux* ]] && grep -qE "[[:space:]]${TEMP_BUILD_SWAP_PATH//\//\\/}([[:space:]]|$)" /proc/swaps 2>/dev/null; then
        if swapoff "${TEMP_BUILD_SWAP_PATH}" >/dev/null 2>&1; then
            log_info "Disabled temporary build swap"
        else
            log_warn "Failed to disable temporary build swap: ${TEMP_BUILD_SWAP_PATH}"
        fi
    fi

    if [[ "${TEMP_BUILD_SWAP_CREATED_FILE}" == true && -e "${TEMP_BUILD_SWAP_PATH}" ]]; then
        if rm -f "${TEMP_BUILD_SWAP_PATH}"; then
            log_info "Removed temporary build swap file"
        else
            log_warn "Failed to remove temporary build swap file: ${TEMP_BUILD_SWAP_PATH}"
        fi
    fi

    TEMP_BUILD_SWAP_ACTIVE=false
    TEMP_BUILD_SWAP_CREATED_FILE=false
}

# Replaces or appends the Node heap cap in NODE_OPTIONS while preserving any
# other existing Node flags that may have been provided by the operator.
set_node_heap_limit_mb() {
    local heap_mb="$1"
    local heap_flag="--max-old-space-size=${heap_mb}"
    local part=""
    local updated_node_options=""

    for part in ${NODE_OPTIONS:-}; do
        if [[ "${part}" == --max-old-space-size=* ]]; then
            continue
        fi
        updated_node_options+="${updated_node_options:+ }${part}"
    done

    if [[ -n "${updated_node_options}" ]]; then
        export NODE_OPTIONS="${updated_node_options} ${heap_flag}"
    else
        export NODE_OPTIONS="${heap_flag}"
    fi
}

# Exports deploy-only Next.js build flags for low-memory hosts to reduce peak
# RAM usage during `next build`. Lint/type-check still run in CI/local workflows.
prepare_next_build_environment() {
    export NEXT_TELEMETRY_DISABLED=1

    if [[ "${NEXT_LOW_MEMORY_BUILD:-}" == "1" ]]; then
        log_info "Using existing NEXT_LOW_MEMORY_BUILD=1 override"
        return 0
    fi

    local total_ram_mb=""
    total_ram_mb="$(detect_total_ram_mb || true)"
    if [[ -z "${total_ram_mb}" ]]; then
        log_info "Could not detect system RAM; leaving Next.js build validation enabled"
        return 0
    fi

    local build_heap_mb=""
    if (( total_ram_mb >= LOW_RAM_1GB_AUTO_HEAP_MIN_MB && total_ram_mb <= LOW_RAM_1GB_AUTO_HEAP_MAX_MB )); then
        export NEXT_LOW_MEMORY_BUILD=1
        build_heap_mb="${LOW_RAM_1GB_NEXT_BUILD_HEAP_MB}"
    elif (( total_ram_mb >= LOW_RAM_2GB_AUTO_HEAP_MIN_MB && total_ram_mb <= LOW_RAM_2GB_AUTO_HEAP_MAX_MB )); then
        export NEXT_LOW_MEMORY_BUILD=1
        build_heap_mb="${LOW_RAM_2GB_NEXT_BUILD_HEAP_MB}"
    fi

    if [[ "${NEXT_LOW_MEMORY_BUILD:-}" == "1" ]]; then
        if [[ -n "${build_heap_mb}" ]]; then
            set_node_heap_limit_mb "${build_heap_mb}"
            log_warn "Applied low-memory Next.js build heap cap for ${total_ram_mb}MB RAM host: --max-old-space-size=${build_heap_mb}"
        fi
        log_warn "Enabled low-memory Next.js build mode (skip build lint/type-check) for ${total_ram_mb}MB RAM host"
    fi
}

ensure_build_node_options() {
    local heap_mb="${DEFAULT_BUILD_NODE_HEAP_MB}"
    local heap_flag=""
    local total_ram_mb=""
    local should_auto_override=false

    # Respect an explicit heap limit if one was already provided by the caller,
    # but append a safe default when NODE_OPTIONS is unset or incomplete.
    if [[ "${NODE_OPTIONS:-}" == *"--max-old-space-size="* ]]; then
        log_info "Using existing NODE_OPTIONS heap setting"
        return 0
    fi

    total_ram_mb="$(detect_total_ram_mb)"
    if [[ -z "${total_ram_mb}" ]]; then
        log_info "Could not detect system RAM; leaving NODE_OPTIONS heap limit unchanged"
        return 0
    fi

    # Apply the larger Node heap override on low-memory hosts (commonly ~1GB or
    # ~2GB VPS plans) where Next.js builds are most likely to fail without extra
    # headroom, especially when swap is available.
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

cleanup_incomplete_release_on_exit() {
    local exit_code=$?
    trap - EXIT

    # Always clean up temporary build swap if this deploy enabled it.
    cleanup_temporary_build_swap

    # If deployment failed after creating a release directory but before it was
    # promoted to current, remove it so failed builds do not fill the disk.
    if [[ ${exit_code} -ne 0 && -n "${NEW_RELEASE_DIR:-}" && -d "${NEW_RELEASE_DIR}" ]]; then
        local current_target=""
        current_target="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"

        if [[ "${current_target}" != "${NEW_RELEASE_DIR}" ]]; then
            log_warn "Removing incomplete release after failure: ${NEW_RELEASE_DIR}"
            rm -rf "${NEW_RELEASE_DIR}" || log_warn "Failed to remove incomplete release directory"
        fi
    fi

    exit "${exit_code}"
}

trap cleanup_incomplete_release_on_exit EXIT

# Parse arguments
ARG_COUNT=$#
while [[ $# -gt 0 ]]; do
    case $1 in
        --branch) BRANCH="$2"; shift 2 ;;
        --ssl) SSL_SETUP=true; shift ;;
        --domain) SSL_DOMAIN="$2"; shift 2 ;;
        --email) SSL_EMAIL="$2"; shift 2 ;;
        --interactive) INTERACTIVE=true; shift ;;
        --no-spinner) NO_SPINNER=true; shift ;;
        --no-color) NO_COLOR=true; shift ;;
        --skip-deps) SKIP_DEPS=true; shift ;;
        --skip-migrate) SKIP_MIGRATE=true; shift ;;
        --db-push) DB_PUSH=true; shift ;;
        --rollback) ROLLBACK=true; shift ;;
        --setup-packages) SETUP_PACKAGES=true; shift ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *) log_error "Unknown argument: $1"; exit 1 ;;
    esac
done

detect_tty_capabilities

# Auto-enable interactive prompts for local manual runs with no flags.
if [[ "${IS_TTY}" == true && "${INTERACTIVE}" == false && "${ROLLBACK}" == false ]]; then
    if [[ "${ARG_COUNT}" -eq 0 ]]; then
        INTERACTIVE=true
    fi
fi

if [[ "${INTERACTIVE}" == true && "${IS_TTY}" != true ]]; then
    log_warn "--interactive requested, but no TTY detected. Continuing non-interactively."
    INTERACTIVE=false
fi

print_banner

if [[ "${INTERACTIVE}" == true && "${ROLLBACK}" == false ]]; then
    run_interactive_setup
    print_deploy_summary
    if ! prompt_yes_no "Start deployment with these settings?" "y"; then
        log_warn "Deployment cancelled."
        exit 0
    fi
elif [[ "${ROLLBACK}" == false ]]; then
    print_deploy_summary
fi

# =============================================================================
# ROLLBACK FUNCTION
# =============================================================================
rollback() {
    log_info "Initiating rollback..."
    
    if [[ ! -d "${RELEASES_DIR}" ]]; then
        log_error "No releases directory found"
        exit 1
    fi
    
    # List releases sorted by date
    local releases=($(ls -1t "${RELEASES_DIR}"))
    
    if [[ ${#releases[@]} -lt 2 ]]; then
        log_error "No previous release available for rollback"
        exit 1
    fi
    
    local current_release=$(readlink "${CURRENT_LINK}" | xargs basename)
    local previous_release=""
    
    # Find the release before current
    for release in "${releases[@]}"; do
        if [[ "${release}" != "${current_release}" ]]; then
            previous_release="${release}"
            break
        fi
    done
    
    if [[ -z "${previous_release}" ]]; then
        log_error "Could not find previous release"
        exit 1
    fi
    
    log_info "Rolling back to release: ${previous_release}"
    
    # Update symlink
    ln -sfn "${RELEASES_DIR}/${previous_release}" "${CURRENT_LINK}"
    
    # Restart service
    systemctl restart ${APP_NAME}
    
    log_info "Rollback complete! Now running release: ${previous_release}"
    exit 0
}

# Execute rollback if requested
if [[ "${ROLLBACK}" == true ]]; then
    rollback
fi

# Run package setup if requested
if [[ "${SETUP_PACKAGES}" == true ]]; then
    section "Package Setup"
    run_step "Installing system packages" "${SCRIPT_DIR}/setup-packages.sh" --non-interactive
fi

# =============================================================================
# DEPLOYMENT
# =============================================================================
section "Deployment"
log_info "Starting deployment of branch: ${BRANCH}"
log_info "Deploy directory: ${DEPLOY_DIR}"

# Resolve the application source directory independently from the caller's cwd.
# This allows operators to run ./deploy/update.sh from inside ./deploy without
# accidentally deploying only the deploy scripts directory.
if git -C "${SOURCE_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    SOURCE_DIR="$(git -C "${SOURCE_DIR}" rev-parse --show-toplevel)"
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    SOURCE_DIR="$(git rev-parse --show-toplevel)"
elif [[ -f "${SCRIPT_DIR}/../package.json" ]]; then
    SOURCE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi

log_info "Source directory: ${SOURCE_DIR}"

# Create directories if they don't exist
mkdir -p "${RELEASES_DIR}"
mkdir -p "${SHARED_DIR}/data"
chown -R www-data:www-data "${DEPLOY_DIR}"
chmod -R 775 "${SHARED_DIR}/data"

# Prune old releases before creating a new one so a previous failed deploy
# cannot block the next build with an ENOSPC error.
log_info "Pre-deploy temp cleanup..."
cleanup_old_temp_files

log_info "Pre-deploy release cleanup..."
cleanup_old_releases

# Create release directory with timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)
NEW_RELEASE_DIR="${RELEASES_DIR}/${TIMESTAMP}"
mkdir -p "${NEW_RELEASE_DIR}"
log_info "Created release directory: ${NEW_RELEASE_DIR}"

# Clone/copy repository from the resolved source dir (not the caller's cwd).
if [[ -d "${SOURCE_DIR}/.git" ]]; then
    # Running from git repository
    git -C "${SOURCE_DIR}" archive --format=tar "${BRANCH}" | tar -x -C "${NEW_RELEASE_DIR}"
else
    # Copy current directory
    rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
          --exclude='*.log' --exclude='prisma/*.db' \
          "${SOURCE_DIR}/" "${NEW_RELEASE_DIR}/"
fi

cd "${NEW_RELEASE_DIR}"

if [[ ! -f package.json ]]; then
    log_error "Release source copy is missing package.json (source dir: ${SOURCE_DIR})."
    log_error "Run deploy from the app repository root, or use deploy/update.sh from within the repo."
    exit 1
fi

if [[ "${SKIP_DEPS}" == false && ! -f package-lock.json ]]; then
    log_error "Release source copy is missing package-lock.json (source dir: ${SOURCE_DIR})."
    log_error "npm ci requires a lockfile; verify the deploy source directory and git archive step."
    exit 1
fi

# Apply the Node heap override before any npm/npm exec commands so installs,
# Prisma operations, and the build all share the same memory configuration.
ensure_build_node_options

# Link shared environment file
if [[ -f "${SHARED_DIR}/.env" ]]; then
    ln -sf "${SHARED_DIR}/.env" "${NEW_RELEASE_DIR}/.env"
    log_info "Linked shared environment file"
else
    log_warn "No shared .env file found at ${SHARED_DIR}/.env"
fi

# Link shared data directory (learning materials, etc.)
if [[ -d "${SHARED_DIR}/data" ]]; then
    ln -sf "${SHARED_DIR}/data" "${NEW_RELEASE_DIR}/.data"
    log_info "Linked shared data directory"
fi

# Install dependencies
if [[ "${SKIP_DEPS}" == false ]]; then
    run_npm_step_with_cache_repair "Installing production dependencies (npm ci)" npm ci --omit=dev --ignore-scripts
fi

# Always install Prisma CLI (needed for generate and migrate)
run_npm_step_with_cache_repair "Installing Prisma CLI" npm install prisma --save-dev --ignore-scripts

# Generate Prisma client
run_step "Generating Prisma client" npm exec --no -- prisma generate

# Run database migrations
run_migrations() {
    # Check if migrations directory exists and has migrations
    if [[ ! -d "prisma/migrations" || -z "$(ls -A prisma/migrations 2>/dev/null)" ]]; then
        log_warn "No migrations found in prisma/migrations. Using db push instead."
        npm exec --no -- prisma db push --accept-data-loss
        return $?
    fi
    
    log_info "Running database migrations..."
    
    # Try migrate deploy first
    if npm exec --no -- prisma migrate deploy 2>&1; then
        return 0
    fi
    
    # If failed with P3005 (database not empty, needs baseline), handle it
    log_warn "Migration failed, attempting to baseline existing database..."
    
    # Get the first migration name (for baselining)
    local first_migration=$(ls -1 prisma/migrations | head -1)
    
    if [[ -z "${first_migration}" ]]; then
        log_error "No migrations found to baseline"
        return 1
    fi
    
    log_info "Resolving migration as baseline: ${first_migration}"
    npm exec --no -- prisma migrate resolve --applied "${first_migration}"
    
    # Execute the baseline migration SQL manually (resolve --applied doesn't run SQL)
    local migration_sql="prisma/migrations/${first_migration}/migration.sql"
    if [[ -f "${migration_sql}" ]]; then
        log_info "Applying baseline migration SQL via prisma db execute..."
        npm exec --no -- prisma db execute --file "${migration_sql}" --schema prisma/schema.prisma 2>&1 || log_warn "Migration SQL may have already been applied"
    fi
    
    # Apply any remaining migrations
    log_info "Applying remaining migrations..."
    npm exec --no -- prisma migrate deploy
}

if [[ "${DB_PUSH}" == true ]]; then
    log_info "Pushing database schema (db push)..."
    npm exec --no -- prisma db push --accept-data-loss
elif [[ "${SKIP_MIGRATE}" == false ]]; then
    run_migrations
else
    log_info "Skipping database migrations"
fi

# Reclaim package-manager cache before the build phase so the build has more
# free disk space available on small VPS hosts.
cleanup_install_and_build_caches

# Build the application
prepare_next_build_environment
ensure_temporary_build_swap
run_step "Building Next.js application" npm run build

# Verify build succeeded
if [[ ! -f ".next/BUILD_ID" ]]; then
    log_error "Build failed - BUILD_ID not found"
    exit 1
fi

log_info "Build successful: $(cat .next/BUILD_ID)"

# Setup standalone build (copy public and static assets)
# This is required for next/image and other static assets to work in standalone mode
if [[ -d ".next/standalone" ]]; then
    log_info "Setting up standalone build assets..."
    cp -r public ".next/standalone/"
    mkdir -p ".next/standalone/.next"
    cp -r ".next/static" ".next/standalone/.next/"
fi

# Remove transient build caches from the release after assets are copied. The
# runtime service does not need these caches, and deleting them reduces disk use.
cleanup_install_and_build_caches
cleanup_temporary_build_swap

# Update symlink atomically
log_info "Updating current symlink..."
ln -sfn "${NEW_RELEASE_DIR}" "${CURRENT_LINK}"

# Fix permissions for the entire deploy directory
# Do this AFTER everything is set up to ensure all new files are owned by www-data
log_info "Fixing permissions..."
chown -R www-data:www-data "${DEPLOY_DIR}"
chmod -R 755 "${NEW_RELEASE_DIR}"

# Ensure systemd service is installed
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
if [[ ! -f "${SERVICE_FILE}" ]]; then
    log_info "Installing systemd service..."
    cp "${NEW_RELEASE_DIR}/deploy/${APP_NAME}.service" "${SERVICE_FILE}"
    systemctl daemon-reload
    systemctl enable ${APP_NAME}
fi

# Ensure nginx config is installed (HTTP-only initially, certbot will upgrade to HTTPS)
NGINX_SITE_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"
if [[ ! -f "${NGINX_SITE_AVAILABLE}" ]]; then
    log_info "Installing nginx configuration..."
    cp "${NEW_RELEASE_DIR}/deploy/nginx-http.conf" "${NGINX_SITE_AVAILABLE}"
    ln -sf "${NGINX_SITE_AVAILABLE}" "${NGINX_SITE_ENABLED}"
    # Remove default site if it exists
    rm -f /etc/nginx/sites-enabled/default
    # Test and reload nginx
    if nginx -t; then
        systemctl reload nginx
        log_info "Nginx configuration installed and reloaded"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
fi

# Restart the service
log_info "Restarting service..."
run_step "Restarting systemd service (${APP_NAME})" systemctl restart "${APP_NAME}"

# Wait for service to start
run_step "Waiting for service warm-up" sleep 5

# Check service status
if systemctl is-active --quiet ${APP_NAME}; then
    log_info "Service started successfully"
else
    log_error "Service failed to start"
    systemctl status ${APP_NAME} --no-pager
    exit 1
fi

# Cleanup old releases
log_info "Cleaning up old releases..."
cleanup_old_releases

log_info "Deployment complete!"
log_info "Current release: ${TIMESTAMP}"

# Show release history
echo ""
echo "Release history:"
ls -1t "${RELEASES_DIR}" | head -n ${KEEP_RELEASES}

# Run SSL setup if requested
if [[ "${SSL_SETUP}" == true ]]; then
    if [[ -z "${SSL_DOMAIN}" || -z "${SSL_EMAIL}" ]]; then
        log_error "SSL setup requires --domain and --email options"
        exit 1
    fi
    log_info "Running SSL setup..."
    run_step "Provisioning SSL (certbot + nginx)" "${SCRIPT_DIR}/setup-ssl.sh" --domain "${SSL_DOMAIN}" --email "${SSL_EMAIL}"
fi
