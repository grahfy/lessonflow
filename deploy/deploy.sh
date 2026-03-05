#!/bin/bash
# =============================================================================
# LessonFlow - Deployment Script
# =============================================================================
# Usage: ./deploy/deploy.sh [options]
#
# Options:
#   --skip-migrate    Skip database migrations
#   --skip-deps       Skip npm install
#   --skip-cron       Skip managed cron jobs sync
#   --branch BRANCH   Git branch to deploy (default: main)
#   --rollback        Rollback to previous release
#   --setup-packages  Run package installation first (requires root)
#   --setup-mysql-db-from-env  Install local MySQL/MariaDB (if needed) and create DB from shared .env DATABASE_URL
#   --install-nginx   Install Nginx (if needed) using setup-packages.sh in non-interactive mode
#   --install-php-fpm-if-needed  Install PHP-FPM only if deploy nginx config indicates a PHP upstream is required
#   --install-cron    Install cron/crond scheduler (if needed) and enable/start service
#   --install-app-service  Install/update the app systemd unit and enable service
#   --install-cron-jobs  Install/update managed cron jobs and restart cron (best effort)
#   --no-auto-bootstrap  Disable automatic bootstrap detection for missing host setup
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
#   - .env.example present in the repo (script bootstraps shared/.env if missing)
#   - Nginx and systemd configured
# =============================================================================

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(pwd)"
ORIGINAL_ARGS=( "$@" )

# Configuration
APP_NAME="lessonflow"
DEPLOY_DIR="/var/www/${APP_NAME}"
RELEASES_DIR="${DEPLOY_DIR}/releases"
SHARED_DIR="${DEPLOY_DIR}/shared"
CURRENT_LINK="${DEPLOY_DIR}/current"
KEEP_RELEASES=2
DEFAULT_BUILD_NODE_HEAP_MB="${DEFAULT_BUILD_NODE_HEAP_MB:-6144}"
LOW_RAM_1GB_AUTO_HEAP_MB="${LOW_RAM_1GB_AUTO_HEAP_MB:-3072}"
LOW_RAM_2GB_AUTO_HEAP_MB="${LOW_RAM_2GB_AUTO_HEAP_MB:-2048}"
LOW_RAM_1GB_NEXT_BUILD_HEAP_MB="${LOW_RAM_1GB_NEXT_BUILD_HEAP_MB:-1024}"
LOW_RAM_2GB_NEXT_BUILD_HEAP_MB="${LOW_RAM_2GB_NEXT_BUILD_HEAP_MB:-1536}"
TEMP_BUILD_SWAP_AUTO_ENABLED="${TEMP_BUILD_SWAP_AUTO_ENABLED:-true}"
LOW_RAM_1GB_TARGET_TOTAL_SWAP_MB="${LOW_RAM_1GB_TARGET_TOTAL_SWAP_MB:-2048}"
LOW_RAM_2GB_TARGET_TOTAL_SWAP_MB="${LOW_RAM_2GB_TARGET_TOTAL_SWAP_MB:-1024}"
TEMP_BUILD_SWAP_MIN_CREATE_MB="${TEMP_BUILD_SWAP_MIN_CREATE_MB:-128}"
TEMP_BUILD_SWAP_PATH="${TEMP_BUILD_SWAP_PATH:-/var/tmp/${APP_NAME}-build.swap}"
LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
TMP_CLEANUP_MAX_AGE_DAYS=3
BRANCH="main"
SKIP_MIGRATE=false
SKIP_DEPS=false
SKIP_CRON_SETUP=false
ROLLBACK=false
SETUP_PACKAGES=false
SETUP_MYSQL_DB_FROM_ENV=false
INSTALL_NGINX_IF_NEEDED=false
INSTALL_PHP_FPM_IF_NEEDED=false
INSTALL_CRON_IF_NEEDED=false
INSTALL_APP_SERVICE_IF_NEEDED=false
INSTALL_CRON_JOBS_IF_NEEDED=false
AUTO_BOOTSTRAP=true
UPDATE_PRISMA_ONLY=false
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
DEPLOY_TUI_PANEL_WIDTH=92
DEPLOY_TUI_PANEL_WIDTH_MAX=120
TEMP_BUILD_SWAP_ACTIVE=false
TEMP_BUILD_SWAP_CREATED_FILE=false
DEPLOY_GIT_REPO_ROOT=""
DEPLOY_PREVIOUS_COMMIT_HASH=""
DEPLOY_TARGET_COMMIT_HASH=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Helper functions
# Print usage information for CLI and automation contexts.
show_usage() {
    cat <<'EOF'
LessonFlow - Deployment Script

Usage: ./deploy/deploy.sh [options]

Options:
  --skip-migrate    Skip database migrations
  --skip-deps       Skip npm install
  --skip-cron       Skip managed cron jobs sync
  --branch BRANCH   Git branch to deploy (default: main)
  --rollback        Rollback to previous release
  --setup-packages  Run package installation first (requires root)
  --setup-mysql-db-from-env  Install local MySQL/MariaDB (if needed) and create DB from shared .env DATABASE_URL
  --install-nginx   Install Nginx (if needed) using setup-packages.sh in non-interactive mode
  --install-php-fpm-if-needed  Install PHP-FPM only when deploy nginx config uses PHP upstreams
  --install-cron    Install cron/crond scheduler (if needed) and enable/start service
  --install-app-service  Install/update the app systemd unit and enable service
  --install-cron-jobs  Install/update managed cron jobs and restart cron (best effort)
  --no-auto-bootstrap  Disable automatic bootstrap detection for missing host setup
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

    if [[ "${IS_TTY}" == true ]]; then
        auto_size_tui_panel_width
    fi

    if [[ "${NO_COLOR}" == true || ! -t 1 ]]; then
        RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' DIM='' NC=''
    fi
}

# Sizes the TUI panel to the active terminal width while keeping a readable max
# width on very wide terminals. This lets the deploy menu adapt to SSH windows
# and split panes without manually editing script constants.
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
    if (( target_width > DEPLOY_TUI_PANEL_WIDTH_MAX )); then
        target_width="${DEPLOY_TUI_PANEL_WIDTH_MAX}"
    fi

    DEPLOY_TUI_PANEL_WIDTH="${target_width}"
}

# Re-runs the deploy script with sudo when root privileges are required but the
# operator started it without sudo on the command line.
reexec_with_sudo_if_needed() {
    if [[ ${EUID} -eq 0 ]]; then
        return 0
    fi

    if ! command -v sudo >/dev/null 2>&1; then
        log_error "This deployment script requires root privileges and sudo is not available."
        exit 1
    fi

    local sudo_env_args=()
    local env_name=""
    for env_name in \
        NODE_OPTIONS \
        NEXT_LOW_MEMORY_BUILD \
        MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT \
        DEFAULT_BUILD_NODE_HEAP_MB \
        LOW_RAM_1GB_AUTO_HEAP_MB \
        LOW_RAM_2GB_AUTO_HEAP_MB \
        LOW_RAM_1GB_NEXT_BUILD_HEAP_MB \
        LOW_RAM_2GB_NEXT_BUILD_HEAP_MB \
        TEMP_BUILD_SWAP_AUTO_ENABLED \
        LOW_RAM_1GB_TARGET_TOTAL_SWAP_MB \
        LOW_RAM_2GB_TARGET_TOTAL_SWAP_MB \
        TEMP_BUILD_SWAP_MIN_CREATE_MB \
        TEMP_BUILD_SWAP_PATH
    do
        if [[ -v "${env_name}" ]]; then
            sudo_env_args+=( "${env_name}=${!env_name}" )
        fi
    done

    log_info "Root privileges required. Re-running deployment with sudo..."
    if (( ${#sudo_env_args[@]} > 0 )); then
        exec sudo env "${sudo_env_args[@]}" "${SCRIPT_DIR}/deploy.sh" "${ORIGINAL_ARGS[@]}"
    fi

    exec sudo "${SCRIPT_DIR}/deploy.sh" "${ORIGINAL_ARGS[@]}"
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

# Render a lightweight banner so manual deploy runs are easier to scan.
print_banner() {
    local app_version
    app_version="$(get_app_version)"
    print_box_banner "LessonFlow Deploy v1.0"
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

# Returns 0 when the provided path resolves inside the production deploy tree.
# This is used to decide whether to offer an .env edit prompt for ad-hoc deploys
# started from a non-production checkout (for example a home-directory clone).
path_is_within_deploy_dir() {
    local candidate="$1"
    local resolved_candidate=""
    local resolved_deploy=""

    resolved_candidate="$(cd "${candidate}" 2>/dev/null && pwd -P || true)"
    resolved_deploy="${DEPLOY_DIR}"

    [[ -n "${resolved_candidate}" ]] || return 1
    [[ "${resolved_candidate}" == "${resolved_deploy}" || "${resolved_candidate}" == "${resolved_deploy}/"* ]]
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

# Ensures the shared production .env file exists, bootstrapping it from the
# repository .env.example when missing. If it exists, it merges any missing
# keys from the template to ensure updates include new config variables.
ensure_shared_env_file() {
    local env_template_path="$1"
    local shared_env_path="${SHARED_DIR}/.env"

    mkdir -p "${SHARED_DIR}"

    if [[ ! -f "${env_template_path}" ]]; then
        log_warn "No .env template available at ${env_template_path}"
        return 1
    fi

    if [[ ! -f "${shared_env_path}" ]]; then
        cp "${env_template_path}" "${shared_env_path}"
        chown www-data:www-data "${shared_env_path}" 2>/dev/null || true
        chmod 640 "${shared_env_path}" 2>/dev/null || true
        log_info "Created shared .env from template: ${shared_env_path}"
    else
        # Merge missing keys from template into existing shared env
        local temp_env
        temp_env="$(mktemp)"
        cp "${shared_env_path}" "${temp_env}"
        
        local key=""
        local value=""
        while IFS='=' read -r key value || [[ -n "$key" ]]; do
            # Skip comments and empty lines
            [[ "$key" =~ ^[[:space:]]*# ]] && continue
            [[ -z "${key//[[:space:]]/}" ]] && continue
            
            # Remove whitespace and potential export prefix
            key="${key#export }"
            key="${key//[[:space:]]/}"
            
            if ! grep -q "^[[:space:]]*${key}=" "${shared_env_path}"; then
                log_info "Adding missing config key to shared .env: ${key}"
                echo "${key}=${value}" >> "${shared_env_path}"
            fi
        done < "${env_template_path}"
        rm -f "${temp_env}"
        log_info "Shared .env keys synchronized with template."
    fi

    # Re-apply runtime ownership in case the file was previously edited as root.
    chown www-data:www-data "${shared_env_path}" 2>/dev/null || true
    chmod 640 "${shared_env_path}" 2>/dev/null || true
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

    if ! "${editor_cmd}" "${shared_env_path}"; then
        log_warn "Editor exited with an error; continuing deployment."
        return 0
    fi

    chown www-data:www-data "${shared_env_path}" 2>/dev/null || true
    chmod 640 "${shared_env_path}" 2>/dev/null || true
    log_info "Shared .env review complete"
    return 0
}

maybe_edit_shared_env_before_deploy() {
    local source_path="$1"
    local shared_env_path="${SHARED_DIR}/.env"

    [[ "${IS_TTY}" == true ]] || return 0
    [[ -f "${shared_env_path}" ]] || return 0
    [[ "${MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT:-}" == "1" ]] && return 0

    if path_is_within_deploy_dir "${source_path}"; then
        return 0
    fi

    log_warn "Deploy source is outside ${DEPLOY_DIR}; review shared .env before deploying."
    if ! prompt_yes_no "Open ${shared_env_path} in an editor now?" "y"; then
        return 0
    fi

    edit_shared_env_now || true
}

# Reads a single KEY=value assignment from a .env file without sourcing it.
# This keeps deploy-time bootstrap actions safe from arbitrary shell code while
# still supporting the common quoted formats used in env templates.
read_env_file_value() {
    local env_file="$1"
    local key="$2"
    local line=""
    local value=""

    if [[ ! -f "${env_file}" ]]; then
        return 1
    fi

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

# Parses a mysql:// DATABASE_URL into shell variables used for local bootstrap.
# We intentionally keep this strict and only support hostname/IPv4 formats
# because the target use-case is first-time VPS setup on a local DB server.
parse_mysql_database_url() {
    local url="$1"
    local rest=""
    local authority=""
    local path_and_query=""
    local credentials=""
    local host_port=""

    DB_URL_USER=""
    DB_URL_PASS=""
    DB_URL_HOST=""
    DB_URL_PORT="3306"
    DB_URL_NAME=""

    if [[ -z "${url}" || "${url}" != mysql://* ]]; then
        log_error "DATABASE_URL must start with mysql://"
        return 1
    fi

    rest="${url#mysql://}"
    if [[ "${rest}" != */* ]]; then
        log_error "DATABASE_URL is missing the database name path."
        return 1
    fi

    authority="${rest%%/*}"
    path_and_query="${rest#*/}"
    DB_URL_NAME="${path_and_query%%\?*}"

    if [[ -z "${DB_URL_NAME}" ]]; then
        log_error "DATABASE_URL database name is empty."
        return 1
    fi

    if [[ "${authority}" != *@* ]]; then
        log_error "DATABASE_URL is missing user/host credentials (expected user[:pass]@host[:port])."
        return 1
    fi

    credentials="${authority%@*}"
    host_port="${authority#*@}"

    if [[ "${credentials}" == *:* ]]; then
        DB_URL_USER="${credentials%%:*}"
        DB_URL_PASS="${credentials#*:}"
    else
        DB_URL_USER="${credentials}"
        DB_URL_PASS=""
    fi

    if [[ -z "${DB_URL_USER}" ]]; then
        log_error "DATABASE_URL username is empty."
        return 1
    fi

    if [[ "${host_port}" == *"["* || "${host_port}" == *"]"* ]]; then
        log_error "IPv6 DATABASE_URL hosts are not supported by this helper yet. Edit the DB manually."
        return 1
    fi

    if [[ "${host_port}" == *:* ]]; then
        DB_URL_HOST="${host_port%%:*}"
        DB_URL_PORT="${host_port#*:}"
    else
        DB_URL_HOST="${host_port}"
    fi

    if [[ -z "${DB_URL_HOST}" ]]; then
        log_error "DATABASE_URL host is empty."
        return 1
    fi

    if [[ -n "${DB_URL_PORT}" && ! "${DB_URL_PORT}" =~ ^[0-9]+$ ]]; then
        log_error "DATABASE_URL port must be numeric."
        return 1
    fi

    return 0
}

# Returns the preferred MySQL/MariaDB CLI available on the host.
mysql_cli_bin() {
    if command -v mysql >/dev/null 2>&1; then
        echo "mysql"
        return 0
    fi
    if command -v mariadb >/dev/null 2>&1; then
        echo "mariadb"
        return 0
    fi
    return 1
}

# Returns the preferred MySQL dump binary available on the host.
mysql_dump_bin() {
    if command -v mysqldump >/dev/null 2>&1; then
        echo "mysqldump"
        return 0
    fi
    if command -v mariadb-dump >/dev/null 2>&1; then
        echo "mariadb-dump"
        return 0
    fi
    return 1
}

# Returns true when this deploy run will mutate schema state and therefore needs
# a protective SQL backup before Prisma migration/db push.
database_backup_required_for_deploy() {
    if [[ "${DB_PUSH}" == true ]]; then
        return 0
    fi
    if [[ "${SKIP_MIGRATE}" == false ]]; then
        return 0
    fi
    return 1
}

# Creates a compressed SQL dump before Prisma schema mutations. The backup is
# stored under shared/data so it survives release rotations and rollback events.
backup_database_before_schema_change() {
    local shared_env_path="${SHARED_DIR}/.env"
    local database_url=""
    local mysql_bin=""
    local dump_bin=""
    local backup_dir=""
    local timestamp=""
    local backup_file=""
    local restore_note=""
    local dump_args_base=()
    local dump_args_attempt=()
    local dump_stderr_file=""
    local dump_temp_file=""
    local dump_stderr_excerpt=""
    local no_tablespaces_supported=false
    local use_no_tablespaces=false
    local dump_success=false
    local retry_attempt=1
    local max_attempts=3

    if ! database_backup_required_for_deploy; then
        return 0
    fi

    section "Database Backup"

    if [[ ! -f "${shared_env_path}" ]]; then
        log_error "Shared .env not found at ${shared_env_path}"
        return 1
    fi

    database_url="$(read_env_file_value "${shared_env_path}" "DATABASE_URL" || true)"
    if [[ -z "${database_url}" ]]; then
        log_error "DATABASE_URL is missing in ${shared_env_path}"
        return 1
    fi

    if ! parse_mysql_database_url "${database_url}"; then
        log_error "Unable to parse DATABASE_URL from ${shared_env_path}."
        return 1
    fi

    if ! mysql_bin="$(mysql_cli_bin)"; then
        log_error "MySQL/MariaDB CLI is required to validate DB connectivity before migration."
        return 1
    fi

    if ! dump_bin="$(mysql_dump_bin)"; then
        log_error "mysqldump or mariadb-dump is required before migration."
        return 1
    fi

    dump_args_base=( --single-transaction --quick --lock-tables=false )
    if "${dump_bin}" --help 2>/dev/null | grep -q -- '--no-tablespaces'; then
        no_tablespaces_supported=true
        use_no_tablespaces=true
    fi

    log_info "Checking database connectivity (${DB_URL_HOST}:${DB_URL_PORT}/${DB_URL_NAME})..."
    if [[ -n "${DB_URL_PASS}" ]]; then
        if ! MYSQL_PWD="${DB_URL_PASS}" "${mysql_bin}" -h "${DB_URL_HOST}" -P "${DB_URL_PORT}" -u "${DB_URL_USER}" -e "SELECT 1" "${DB_URL_NAME}" >/dev/null 2>&1; then
            log_error "Database connectivity check failed; aborting before schema change."
            return 1
        fi
    else
        if ! "${mysql_bin}" -h "${DB_URL_HOST}" -P "${DB_URL_PORT}" -u "${DB_URL_USER}" -e "SELECT 1" "${DB_URL_NAME}" >/dev/null 2>&1; then
            log_error "Database connectivity check failed; aborting before schema change."
            return 1
        fi
    fi

    timestamp="$(date +%Y%m%d%H%M%S)"
    backup_dir="${SHARED_DIR}/data/deploy/db-backups"
    backup_file="${backup_dir}/pre-schema-${timestamp}.sql.gz"
    restore_note="${backup_dir}/pre-schema-${timestamp}.restore.txt"

    mkdir -p "${backup_dir}"
    chown -R www-data:www-data "${SHARED_DIR}/data" >/dev/null 2>&1 || true

    rm -f "${backup_file}" 2>/dev/null || true

    while (( retry_attempt <= max_attempts )); do
        dump_args_attempt=( "${dump_args_base[@]}" )
        if [[ "${use_no_tablespaces}" == true ]]; then
            dump_args_attempt+=( --no-tablespaces )
        fi

        dump_stderr_file="$(mktemp)"
        dump_temp_file="$(mktemp "${backup_file}.attempt${retry_attempt}.XXXXXX")"

        log_info "Creating DB backup (attempt ${retry_attempt}/${max_attempts}): ${backup_file}"

        if [[ -n "${DB_URL_PASS}" ]]; then
            if ! MYSQL_PWD="${DB_URL_PASS}" "${dump_bin}" -h "${DB_URL_HOST}" -P "${DB_URL_PORT}" -u "${DB_URL_USER}" "${dump_args_attempt[@]}" "${DB_URL_NAME}" 2>"${dump_stderr_file}" | gzip -9 > "${dump_temp_file}"; then
                dump_stderr_excerpt="$(head -n 1 "${dump_stderr_file}" 2>/dev/null || true)"

                if [[ "${use_no_tablespaces}" == true ]] \
                    && grep -Eqi 'unknown option.*no-tablespaces|unrecognized option.*no-tablespaces' "${dump_stderr_file}"; then
                    log_warn "Dump client rejected --no-tablespaces; retrying without it."
                    use_no_tablespaces=false
                    rm -f "${dump_stderr_file}" "${dump_temp_file}"
                    retry_attempt=$((retry_attempt + 1))
                    continue
                fi

                if [[ "${use_no_tablespaces}" != true && "${no_tablespaces_supported}" == true ]] \
                    && grep -Eqi 'PROCESS privilege|dump tablespaces|tablespace' "${dump_stderr_file}"; then
                    log_warn "Tablespace privilege error detected; retrying with --no-tablespaces."
                    use_no_tablespaces=true
                    rm -f "${dump_stderr_file}" "${dump_temp_file}"
                    retry_attempt=$((retry_attempt + 1))
                    continue
                fi

                rm -f "${dump_stderr_file}" "${dump_temp_file}"
                break
            fi
        else
            if ! "${dump_bin}" -h "${DB_URL_HOST}" -P "${DB_URL_PORT}" -u "${DB_URL_USER}" "${dump_args_attempt[@]}" "${DB_URL_NAME}" 2>"${dump_stderr_file}" | gzip -9 > "${dump_temp_file}"; then
                dump_stderr_excerpt="$(head -n 1 "${dump_stderr_file}" 2>/dev/null || true)"

                if [[ "${use_no_tablespaces}" == true ]] \
                    && grep -Eqi 'unknown option.*no-tablespaces|unrecognized option.*no-tablespaces' "${dump_stderr_file}"; then
                    log_warn "Dump client rejected --no-tablespaces; retrying without it."
                    use_no_tablespaces=false
                    rm -f "${dump_stderr_file}" "${dump_temp_file}"
                    retry_attempt=$((retry_attempt + 1))
                    continue
                fi

                if [[ "${use_no_tablespaces}" != true && "${no_tablespaces_supported}" == true ]] \
                    && grep -Eqi 'PROCESS privilege|dump tablespaces|tablespace' "${dump_stderr_file}"; then
                    log_warn "Tablespace privilege error detected; retrying with --no-tablespaces."
                    use_no_tablespaces=true
                    rm -f "${dump_stderr_file}" "${dump_temp_file}"
                    retry_attempt=$((retry_attempt + 1))
                    continue
                fi

                rm -f "${dump_stderr_file}" "${dump_temp_file}"
                break
            fi
        fi

        if [[ ! -s "${dump_temp_file}" ]]; then
            dump_stderr_excerpt="dump output file was empty"
            rm -f "${dump_stderr_file}" "${dump_temp_file}"
            break
        fi

        if [[ "${use_no_tablespaces}" != true && "${no_tablespaces_supported}" == true ]] \
            && grep -Eqi 'PROCESS privilege|dump tablespaces|tablespace' "${dump_stderr_file}"; then
            log_warn "Tablespace privilege warning detected; retrying with --no-tablespaces."
            use_no_tablespaces=true
            rm -f "${dump_stderr_file}" "${dump_temp_file}"
            retry_attempt=$((retry_attempt + 1))
            continue
        fi

        mv -f "${dump_temp_file}" "${backup_file}"
        rm -f "${dump_stderr_file}"
        dump_success=true
        break
    done

    if [[ "${dump_success}" != true ]]; then
        if [[ -n "${dump_stderr_excerpt}" ]]; then
            log_error "Database backup failed: ${dump_stderr_excerpt}"
        fi
        log_error "Database backup failed; aborting deploy."
        return 1
    fi

    if [[ "${use_no_tablespaces}" == true ]]; then
        log_info "Database backup used --no-tablespaces compatibility mode."
    fi

    {
        echo "Backup file: ${backup_file}"
        echo "Restore command:"
        echo "  gunzip -c \"${backup_file}\" | ${mysql_bin} -h \"${DB_URL_HOST}\" -P \"${DB_URL_PORT}\" -u \"${DB_URL_USER}\" \"${DB_URL_NAME}\""
    } > "${restore_note}"

    chmod 640 "${backup_file}" "${restore_note}" 2>/dev/null || true
    chown www-data:www-data "${backup_file}" "${restore_note}" 2>/dev/null || true
    log_info "Database backup complete."
    log_info "Restore note: ${restore_note}"
    return 0
}

# Installs local MySQL/MariaDB packages in DB-only mode when the CLI is absent.
# deploy.sh re-execs as root early, so this helper intentionally runs commands
# directly instead of relying on update.sh's sudo wrapper helpers.
ensure_mysql_installed_for_env_db_setup() {
    if mysql_cli_bin >/dev/null 2>&1; then
        log_info "MySQL/MariaDB CLI already installed: $(mysql_cli_bin)"
        return 0
    fi

    if [[ ! -x "${SCRIPT_DIR}/setup-packages.sh" ]]; then
        log_error "setup-packages.sh not found or not executable at ${SCRIPT_DIR}/setup-packages.sh"
        return 1
    fi

    if [[ ${EUID} -ne 0 ]]; then
        log_error "MySQL installation helper requires root (deploy.sh should have re-execed with sudo already)."
        return 1
    fi

    run_step "Installing MySQL/MariaDB packages" "${SCRIPT_DIR}/setup-packages.sh" --skip-node --skip-nginx --skip-certbot --non-interactive
}

# Best-effort start/enable of common local MySQL/MariaDB services so DB create
# can run immediately after package installation.
ensure_mysql_service_running_for_env_db_setup() {
    local service_name=""
    local started=false

    if ! command -v systemctl >/dev/null 2>&1; then
        log_warn "systemctl not available; skipping automatic MySQL/MariaDB service start."
        return 0
    fi

    for service_name in mysql mariadb mysqld; do
        if systemctl start "${service_name}" >/dev/null 2>&1; then
            systemctl enable "${service_name}" >/dev/null 2>&1 || true
            log_info "Database service ready: ${service_name}"
            started=true
            break
        fi
    done

    if [[ "${started}" != true ]]; then
        log_warn "Could not start a mysql/mariadb systemd service automatically."
        log_warn "If the database server is already running, continuing anyway."
    fi
}

# Executes SQL as the local DB admin through the host MySQL/MariaDB CLI.
# This helper is limited to local-server bootstrap use and does not manage
# remote hosts or privilege grants.
mysql_admin_exec_local() {
    local sql="$1"
    local mysql_bin=""

    if ! mysql_bin="$(mysql_cli_bin)"; then
        log_error "MySQL/MariaDB CLI is not installed."
        return 1
    fi

    if [[ ${EUID} -ne 0 ]]; then
        log_error "Local database bootstrap requires root (deploy.sh should have re-execed with sudo already)."
        return 1
    fi

    "${mysql_bin}" --batch --skip-column-names -e "${sql}"
}

# Reads DATABASE_URL from shared/.env, installs local MySQL if needed, and
# creates the referenced database only when it does not already exist.
# This intentionally does not create DB users or grants.
setup_mysql_and_database_from_shared_env() {
    local shared_env_path="${SHARED_DIR}/.env"
    local database_url=""
    local escaped_db_name=""
    local db_identifier=""
    local existing_db=""
    local exists_sql=""
    local create_sql=""

    section "MySQL Install + DB Create (shared .env)"

    if [[ ! -f "${shared_env_path}" ]]; then
        log_error "Shared .env not found at ${shared_env_path}"
        log_error "Use the shared .env editor action first."
        return 1
    fi

    database_url="$(read_env_file_value "${shared_env_path}" "DATABASE_URL" || true)"
    if [[ -z "${database_url}" ]]; then
        log_error "DATABASE_URL is missing in ${shared_env_path}"
        log_error "Edit the shared .env file and set a mysql:// URL first."
        return 1
    fi

    if ! parse_mysql_database_url "${database_url}"; then
        log_error "Unable to parse DATABASE_URL from ${shared_env_path}."
        return 1
    fi

    case "${DB_URL_HOST}" in
        localhost|127.0.0.1)
            ;;
        *)
            log_error "DATABASE_URL host is '${DB_URL_HOST}', which is not a local MySQL host."
            log_error "This helper only installs a local MySQL server and creates a local database."
            return 1
            ;;
    esac

    log_info "DATABASE_URL host: ${DB_URL_HOST}:${DB_URL_PORT}"
    log_info "DATABASE_URL database: ${DB_URL_NAME}"
    log_info "DATABASE_URL user: ${DB_URL_USER}"

    ensure_mysql_installed_for_env_db_setup
    ensure_mysql_service_running_for_env_db_setup

    escaped_db_name="${DB_URL_NAME//\'/\'\'}"
    db_identifier="${DB_URL_NAME//\`/\`\`}"
    exists_sql="SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${escaped_db_name}' LIMIT 1;"
    existing_db="$(mysql_admin_exec_local "${exists_sql}" 2>/dev/null || true)"

    if [[ "${existing_db}" == "${DB_URL_NAME}" ]]; then
        log_info "Database already exists. Skipping create: ${DB_URL_NAME}"
        return 0
    fi

    create_sql="CREATE DATABASE \`${db_identifier}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    mysql_admin_exec_local "${create_sql}"
    log_info "Database created: ${DB_URL_NAME}"
    log_warn "Database user/permissions are not created by this helper. Ensure '${DB_URL_USER}' has access."
    return 0
}

# Run database migrations.
# This wrapper prefers `prisma migrate deploy` and only performs automatic
# baseline recovery for explicitly recognized "existing schema" cases.
# It intentionally does not execute baseline SQL against non-empty databases.
run_migrations() {
    # Check if migrations directory exists and has migrations
    if [[ ! -d "prisma/migrations" || -z "$(ls -A prisma/migrations 2>/dev/null)" ]]; then
        log_warn "No migrations found in prisma/migrations. Using db push instead."
        npm exec --no -- prisma db push --accept-data-loss
        return $?
    fi
    
    log_info "Running database migrations..."

    # Determine the first migration directory for safe baseline recovery on
    # already-initialized databases.
    local first_migration=""
    local migration_dir=""
    for migration_dir in prisma/migrations/*; do
        [[ -d "${migration_dir}" ]] || continue
        first_migration="$(basename "${migration_dir}")"
        break
    done

    if [[ -z "${first_migration}" ]]; then
        log_error "No migration directories found to baseline"
        return 1
    fi

    # Try migrate deploy first and capture output so we can detect safe baseline
    # recovery cases precisely instead of baselining on every migration failure.
    local migrate_output=""
    if migrate_output="$(npm exec --no -- prisma migrate deploy 2>&1)"; then
        [[ -n "${migrate_output}" ]] && echo "${migrate_output}"
        return 0
    fi
    local migrate_status=$?

    [[ -n "${migrate_output}" ]] && echo "${migrate_output}"

    local should_baseline=false

    # Prisma P3005: database schema is not empty and needs baselining.
    if printf '%s' "${migrate_output}" | grep -q "P3005"; then
        should_baseline=true
    fi

    # Prisma P3018 + MySQL 1050/\"already exists\" for the first migration is also
    # a safe baseline case (existing schema, newly-added baseline migration).
    if [[ "${should_baseline}" == false ]] \
        && printf '%s' "${migrate_output}" | grep -q "P3018" \
        && printf '%s' "${migrate_output}" | grep -q "Migration name: ${first_migration}" \
        && (printf '%s' "${migrate_output}" | grep -q "Database error code: 1050" \
            || printf '%s' "${migrate_output}" | grep -q "already exists"); then
        should_baseline=true
    fi

    if [[ "${should_baseline}" == false ]]; then
        log_error "Migration failed for a non-baseline reason. Aborting automatic recovery."
        return "${migrate_status}"
    fi

    log_warn "Migration failed, attempting to baseline existing database..."
    log_info "Resolving migration as baseline: ${first_migration}"
    npm exec --no -- prisma migrate resolve --applied "${first_migration}"

    # IMPORTANT: Do not execute baseline SQL on an existing database. Baseline
    # recovery only records the migration as applied, then Prisma applies any
    # later migrations that are still pending.
    log_info "Baseline marked as applied. Re-running prisma migrate deploy for remaining migrations..."
    npm exec --no -- prisma migrate deploy
}

# Resolves the Prisma CLI package spec to install when devDependencies are
# omitted in production deploys. This enforces Prisma major version 7 while
# honoring the repo's configured prisma version/range when present.
resolve_prisma_cli_install_spec() {
    local configured_version=""
    local detected_major=""

    configured_version="$(node -e '
        const fs = require("node:fs");
        try {
            const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
            const v = (pkg.devDependencies && pkg.devDependencies.prisma)
                || (pkg.dependencies && pkg.dependencies.prisma)
                || "";
            process.stdout.write(v);
        } catch {
            process.stdout.write("");
        }
    ' 2>/dev/null || true)"

    if [[ -z "${configured_version}" ]]; then
        echo "prisma@^7"
        return 0
    fi

    detected_major="$(printf '%s' "${configured_version}" | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
    if [[ ! "${detected_major}" =~ ^[0-9]+$ ]]; then
        echo "prisma@^7"
        return 0
    fi

    if [[ "${detected_major}" != "7" ]]; then
        log_warn "Configured prisma version '${configured_version}' is not major 7; enforcing prisma@^7 in deploy."
        echo "prisma@^7"
        return 0
    fi

    echo "prisma@${configured_version}"
}

# Updates Prisma state: generates client and applies migrations or schema push.
# Consolidates all Prisma ORM operations for deployment and manual maintenance.
# Skips generation/migrations if no changes are detected since previous deploy.
update_prisma() {
    section "Prisma Update"
    
    # Check if we are in a release directory or the source root
    if [[ ! -f package.json ]]; then
        log_error "package.json not found in current directory. update_prisma must run from app root."
        return 1
    fi

    local needs_update=false
    local client_dir="src/generated/prisma"

    # 1. Always update if the generated client is missing (fresh release)
    if [[ ! -d "${client_dir}" ]] || [[ -z "$(ls -A "${client_dir}" 2>/dev/null)" ]]; then
        log_info "Prisma client missing; update required."
        needs_update=true
    fi

    # 2. Check for schema or migration changes if git metadata is available
    if [[ "${needs_update}" == false ]] && [[ -n "${DEPLOY_GIT_REPO_ROOT}" && -n "${DEPLOY_TARGET_COMMIT_HASH}" ]]; then
        local diff_range=""
        if [[ -n "${DEPLOY_PREVIOUS_COMMIT_HASH}" ]]; then
            diff_range="${DEPLOY_PREVIOUS_COMMIT_HASH}..${DEPLOY_TARGET_COMMIT_HASH}"
        else
            # First deploy with git tracking; assume update needed
            needs_update=true
        fi

        if [[ "${needs_update}" == false && -n "${diff_range}" ]]; then
            # Check if prisma/ directory or prisma version in package.json changed
            if ! git -C "${DEPLOY_GIT_REPO_ROOT}" diff --quiet "${diff_range}" -- prisma/ package.json; then
                log_info "Changes detected in prisma/ or package.json; update required."
                needs_update=true
            fi
        fi
    fi

    # 3. Force update if DB_PUSH is enabled
    if [[ "${DB_PUSH}" == true ]]; then
        log_info "Database push requested; forcing Prisma update."
        needs_update=true
    fi

    if [[ "${needs_update}" == false ]]; then
        log_info "No changes detected in Prisma schema or migrations. Skipping update."
        return 0
    fi

    # Ensure Prisma CLI is available before trying to use it
    if ! npm list prisma >/dev/null 2>&1 && [[ ! -d "node_modules/prisma" ]]; then
        local prisma_cli_spec=""
        prisma_cli_spec="$(resolve_prisma_cli_install_spec)"
        run_npm_step_with_cache_repair "Installing Prisma CLI (${prisma_cli_spec})" npm install --no-save --package-lock=false --ignore-scripts "${prisma_cli_spec}"
    fi

    run_step "Generating Prisma client" npm exec --no -- prisma generate

    if [[ "${DB_PUSH}" == true ]]; then
        backup_database_before_schema_change
        log_info "Pushing database schema (db push)..."
        npm exec --no -- prisma db push --accept-data-loss
    elif [[ "${SKIP_MIGRATE}" == false ]]; then
        backup_database_before_schema_change
        run_migrations
    else
        log_info "Skipping database migrations"
    fi

    # Seed whitelabel defaults for CMS and templates
    local seed_database_url="${DATABASE_URL:-}"
    if [[ -z "${seed_database_url}" ]] && [[ -f ".env" ]]; then
        seed_database_url="$(read_env_file_value ".env" "DATABASE_URL" || true)"
    fi

    if [[ -n "${seed_database_url}" ]]; then
        run_step "Seeding whitelabel defaults" env DATABASE_URL="${seed_database_url}" npx tsx scripts/seed-whitelabel-defaults.ts
    else
        log_warn "DATABASE_URL not found in process env or .env before seeding."
        run_step "Seeding whitelabel defaults" npx tsx scripts/seed-whitelabel-defaults.ts
    fi
}

# Installs Nginx in a minimal mode through the shared package setup helper.
# This mirrors update.sh's targeted bootstrap action so operators can call the
# same capability directly through deploy.sh in automation.
ensure_nginx_installed_from_deploy() {
    section "Nginx Install"

    if command -v nginx >/dev/null 2>&1; then
        log_info "Nginx already installed: $(nginx -v 2>&1)"
        return 0
    fi

    if [[ ! -x "${SCRIPT_DIR}/setup-packages.sh" ]]; then
        log_error "setup-packages.sh not found or not executable at ${SCRIPT_DIR}/setup-packages.sh"
        return 1
    fi

    if [[ ${EUID} -ne 0 ]]; then
        log_error "Nginx installation helper requires root (deploy.sh should have re-execed with sudo already)."
        return 1
    fi

    run_step "Installing Nginx packages" "${SCRIPT_DIR}/setup-packages.sh" --skip-node --skip-db --skip-certbot --non-interactive
}

# Detects whether the deploy nginx configs appear to require PHP/FastCGI.
# For this Next.js stack the expected result is "not needed", but we keep the
# helper for mixed-stack VPS hosts and parity with update.sh.
php_fpm_needed_for_stack() {
    if grep -R -E -q 'fastcgi_pass|php-fpm|\.php' "${SCRIPT_DIR}"/nginx*.conf 2>/dev/null; then
        return 0
    fi
    return 1
}

# Returns a PHP-FPM binary if one is already installed.
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

# Installs PHP-FPM only when the deploy nginx configs indicate it is needed.
# The package manager is selected from /etc/os-release to keep the helper
# portable across common VPS images used for self-hosting.
ensure_php_fpm_installed_if_needed_from_deploy() {
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

    if [[ ${EUID} -ne 0 ]]; then
        log_error "PHP-FPM installation helper requires root (deploy.sh should have re-execed with sudo already)."
        return 1
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
            log_error "Unsupported OS for PHP-FPM auto-install in deploy.sh (ID='${os_id:-unknown}')."
            log_error "Install PHP-FPM manually if your nginx config actually requires it."
            return 1
            ;;
    esac

    case "${pkg_manager}" in
        apt)
            run_step "Installing PHP-FPM packages" apt install -y php-fpm || return 1
            ;;
        dnf)
            run_step "Installing PHP-FPM packages" dnf install -y php-fpm || return 1
            ;;
        yum)
            run_step "Installing PHP-FPM packages" yum install -y php-fpm || return 1
            ;;
        zypper)
            run_step "Installing PHP-FPM packages" zypper install -y php-fpm || return 1
            ;;
        pacman)
            run_step "Installing PHP-FPM packages" pacman -S --noconfirm php-fpm || return 1
            ;;
    esac

    if command -v systemctl >/dev/null 2>&1; then
        for service_name in php-fpm php8.3-fpm php8.2-fpm php8.1-fpm php8.0-fpm php7.4-fpm; do
            if systemctl start "${service_name}" >/dev/null 2>&1; then
                systemctl enable "${service_name}" >/dev/null 2>&1 || true
                log_info "PHP-FPM service ready: ${service_name}"
                break
            fi
        done
    fi

    log_info "PHP-FPM install step complete"
    return 0
}

# Detects whether the host uses `cron` or `crond` as the scheduler service.
# We keep this in one place so both install and repair helpers can reuse it.
cron_scheduler_service_name() {
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

# Enables and starts the cron scheduler after installation (or during repair
# runs) so managed crontab entries will actually execute.
ensure_cron_scheduler_running_enabled() {
    local service_name=""

    if ! command -v systemctl >/dev/null 2>&1; then
        log_warn "systemctl not available; install/start cron manually if needed."
        return 0
    fi

    if ! service_name="$(cron_scheduler_service_name)"; then
        log_warn "Cron scheduler service (cron/crond) not detected."
        return 0
    fi

    systemctl enable "${service_name}" >/dev/null 2>&1 || true
    if systemctl start "${service_name}" >/dev/null 2>&1; then
        log_info "Cron scheduler ready: ${service_name}"
    else
        log_warn "Could not start cron scheduler service: ${service_name}"
    fi
    return 0
}

# Installs cron/crond using the host package manager. Package names differ by
# distro, so this helper resolves both the manager and package name.
ensure_cron_installed_from_deploy() {
    local os_id=""
    local pkg_manager=""
    local cron_pkg=""
    local existing_service_name=""

    section "Cron Scheduler Install"

    if command -v crontab >/dev/null 2>&1; then
        if existing_service_name="$(cron_scheduler_service_name 2>/dev/null)"; then
            log_info "crontab already installed"
            ensure_cron_scheduler_running_enabled
            return 0
        fi

        log_warn "crontab is installed, but cron/crond service is missing. Attempting package repair/install..."
    fi

    if [[ ${EUID} -ne 0 ]]; then
        log_error "Cron installation helper requires root (deploy.sh should have re-execed with sudo already)."
        return 1
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
            log_error "Unsupported OS for cron scheduler auto-install in deploy.sh (ID='${os_id:-unknown}')."
            log_error "Install cron/crond manually and rerun the helper if needed."
            return 1
            ;;
    esac

    case "${pkg_manager}" in
        apt)
            run_step "Installing cron scheduler package" apt install -y "${cron_pkg}" || return 1
            ;;
        dnf)
            run_step "Installing cron scheduler package" dnf install -y "${cron_pkg}" || return 1
            ;;
        yum)
            run_step "Installing cron scheduler package" yum install -y "${cron_pkg}" || return 1
            ;;
        zypper)
            run_step "Installing cron scheduler package" zypper install -y "${cron_pkg}" || return 1
            ;;
        pacman)
            run_step "Installing cron scheduler package" pacman -S --noconfirm "${cron_pkg}" || return 1
            ;;
    esac

    ensure_cron_scheduler_running_enabled
    return 0
}

# Installs or updates the app's systemd unit using the repository template in
# deploy/. This allows first-time server bootstrap before a full deploy.
install_app_systemd_service_from_deploy() {
    local service_file="/etc/systemd/system/${APP_NAME}.service"
    local service_source="${SCRIPT_DIR}/app.service.template"
    local static_service_source="${SCRIPT_DIR}/${APP_NAME}.service"
    local brand_name="${NEXT_PUBLIC_BRAND_NAME:-LessonFlow}"

    section "App Systemd Service Install"

    if [[ ${EUID} -ne 0 ]]; then
        log_error "Systemd service helper requires root (deploy.sh should have re-execed with sudo already)."
        return 1
    fi

    if ! command -v systemctl >/dev/null 2>&1; then
        log_error "systemctl not available on this host."
        return 1
    fi

    local tmp_service
    tmp_service="$(mktemp)"
    if [[ -f "${static_service_source}" ]]; then
        cp "${static_service_source}" "${tmp_service}"
    else
        if [[ ! -f "${service_source}" ]]; then
            log_error "Service template not found: ${service_source}"
            rm -f "${tmp_service}"
            return 1
        fi

        sed -e "s/{{APP_NAME}}/${APP_NAME}/g" \
            -e "s/{{BRAND_NAME}}/${brand_name}/g" \
            "${service_source}" > "${tmp_service}"
    fi

    if [[ ! -f "${service_file}" ]] || ! cmp -s "${tmp_service}" "${service_file}"; then
        log_info "Updating systemd service: ${service_file}"
        cp "${tmp_service}" "${service_file}"
        systemctl daemon-reload
    else
        log_info "Systemd service already up to date"
    fi
    rm -f "${tmp_service}"

    systemctl enable "${APP_NAME}" >/dev/null 2>&1 || true

    if [[ -L "${CURRENT_LINK}" || -d "${CURRENT_LINK}" ]]; then
        if systemctl start "${APP_NAME}" >/dev/null 2>&1; then
            log_info "Systemd service ready: ${APP_NAME}"
        else
            log_warn "Systemd service installed but not started (check current release/env): ${APP_NAME}"
        fi
    else
        log_info "Current release not present yet; service installed/enabled but not started."
    fi

    return 0
}

# Installs/updates the managed root crontab block and restarts cron so the
# latest current/deploy/cron.sh path is picked up immediately.
ensure_managed_cron_jobs_installed_from_deploy() {
    local cron_runner="${CURRENT_LINK}/deploy/cron.sh"
    local cron_service_name=""

    section "Managed Cron Jobs Install"

    # Match update.sh behavior: if a scheduler unit is missing but crontab is
    # present, install/enable cron/crond before writing managed jobs.
    if command -v systemctl >/dev/null 2>&1; then
        if ! cron_service_name="$(cron_scheduler_service_name)"; then
            ensure_cron_installed_from_deploy || return 1
        fi
    fi

    if ! command -v crontab >/dev/null 2>&1; then
        ensure_cron_installed_from_deploy || return 1
    fi

    if [[ ! -x "${cron_runner}" ]]; then
        log_info "Cron runner not available yet (${cron_runner}); deferring managed cron install until post-release sync."
        return 0
    fi

    install_or_update_managed_crontab_jobs
    restart_cron_scheduler_if_present
    return 0
}

# Checks whether the managed lessonflow cron block already exists in root's
# crontab. Used by auto-bootstrap detection to avoid redundant installs.
managed_cron_block_present_in_root() {
    if ! command -v crontab >/dev/null 2>&1; then
        return 1
    fi

    crontab -l 2>/dev/null | grep -q '^# BEGIN LESSONFLOW_MANAGED_CRON$'
}

# Auto-enables bootstrap/install flags when common production prerequisites are
# missing, so standard deploy runs can also recover first-time VPS setup drift.
auto_enable_bootstrap_defaults_deploy() {
    local changed=false
    local enabled_flags=()

    if [[ "${AUTO_BOOTSTRAP}" != true ]]; then
        return 0
    fi

    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        SETUP_PACKAGES=true
        changed=true
        enabled_flags+=( "setup-packages(node/npm)" )
    fi

    if ! mysql_cli_bin >/dev/null 2>&1; then
        SETUP_PACKAGES=true
        changed=true
        enabled_flags+=( "setup-packages(mysql-client)" )
    fi

    if ! command -v nginx >/dev/null 2>&1; then
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

        if ! cron_scheduler_service_name >/dev/null 2>&1; then
            INSTALL_CRON_IF_NEEDED=true
            changed=true
            enabled_flags+=( "install-cron" )
        fi
    fi

    if [[ ! -d "${DEPLOY_DIR}" || ! -L "${CURRENT_LINK}" ]]; then
        INSTALL_APP_SERVICE_IF_NEEDED=true
        INSTALL_CRON_JOBS_IF_NEEDED=true
        changed=true
        enabled_flags+=( "install-app-service" "install-cron-jobs" )
    fi

    if ! managed_cron_block_present_in_root; then
        INSTALL_CRON_JOBS_IF_NEEDED=true
        changed=true
        enabled_flags+=( "install-cron-jobs" )
    fi

    if [[ "${changed}" == true ]]; then
        log_info "Auto-bootstrap enabled missing setup flags: ${enabled_flags[*]}"
    fi
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
    local width="${1:-72}"
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

# Truncates plain text to a fixed width so menu cells stay within the panel.
# This keeps long labels/descriptions from spilling past the horizontal rule.
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

    if (( max_width == 1 )); then
        printf '.'
        return 0
    fi

    if (( max_width == 2 )); then
        printf '..'
        return 0
    fi

    printf '%s...' "${text:0:max_width-3}"
}

# Builds a compact one-line option cell used by the two-column TUI renderer.
# The text is intentionally plain (no inline ANSI colors) so width alignment is
# stable when we place two cells on the same line.
build_tui_option_cell_text() {
    local key="$1"
    local label="$2"
    local value="$3"
    local cell_width="$4"
    local raw="[${key}] ${label}: ${value}"

    tui_truncate_text "${raw}" "${cell_width}"
}

# Prints a pair of options and their descriptions in two columns. Descriptions
# are truncated per column to preserve panel width and avoid wrap-induced drift.
print_tui_option_pair() {
    local left_key="$1"
    local left_label="$2"
    local left_value="$3"
    local left_desc="$4"
    local right_key="${5:-}"
    local right_label="${6:-}"
    local right_value="${7:-}"
    local right_desc="${8:-}"

    local col_width=$(( (DEPLOY_TUI_PANEL_WIDTH - 4) / 2 ))
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
    local col_width=$(( (DEPLOY_TUI_PANEL_WIDTH - 4) / 2 ))
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
    local max_width=$(( DEPLOY_TUI_PANEL_WIDTH - 2 ))
    local clipped=""

    clipped="$(tui_truncate_text "${text}" "${max_width}")"
    echo -e "  ${DIM}${CYAN}${clipped}${NC}"
}

print_summary_row() {
    local label="$1"
    local value="$2"
    local value_max=$(( DEPLOY_TUI_PANEL_WIDTH - 22 ))
    local clipped_value=""

    clipped_value="$(tui_truncate_text "${value}" "${value_max}")"
    printf "  %-16b %b%s%b\n" "${DIM}${label}:${NC}" "${CYAN}" "${clipped_value}" "${NC}"
}

deploy_migration_mode_label() {
    if [[ "${DB_PUSH}" == true ]]; then
        echo "db-push (skip migrations)"
    elif [[ "${SKIP_MIGRATE}" == true ]]; then
        echo "skip migrations"
    else
        echo "migrate deploy"
    fi
}

deploy_cycle_migration_mode() {
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

print_deploy_tui_menu() {
    tui_clear_screen
    print_box_banner "LessonFlow Deploy v1.0"
    echo -e "${DIM}btop-style menu: edit values, review live status, then start.${NC}"
    echo ""
    echo -e "  $(status_chip "Branch" "$(tui_truncate_text "${BRANCH}" 18)")  $(status_chip "DB" "$(deploy_migration_mode_label)")  $(status_chip "Deps" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")")  $(status_chip "Cron" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")")"
    echo -e "  $(status_chip "Pkg" "$(bool_word "${SETUP_PACKAGES}")")  $(status_chip "EnvDB" "$(bool_word "${SETUP_MYSQL_DB_FROM_ENV}")")  $(status_chip "SSL" "$(bool_word "${SSL_SETUP}")")  $(status_chip "Spin" "$(spinner_ui_word)")"
    echo ""
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    echo -e "${BOLD}${BLUE}  Main Options${NC}"
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    print_tui_option_pair "1" "Branch" "${BRANCH}" "Git branch to package into the release and deploy." \
        "2" "Dependencies" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")" "ON runs npm install. OFF skips it (faster, riskier)."
    print_tui_option_pair "3" "Cron jobs sync" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")" "ON syncs managed cron jobs. OFF skips cron sync." \
        "4" "Database mode" "$(deploy_migration_mode_label)" "Cycle DB mode: migrate / skip / prisma db push."
    print_tui_option_pair "5" "Package setup" "$(bool_word "${SETUP_PACKAGES}")" "Run setup-packages.sh before deploy (Node/Nginx/system)." \
        "6" "SSL setup" "$(bool_word "${SSL_SETUP}")" "Run certbot + nginx SSL setup after deploy."
    if [[ "${SSL_SETUP}" == true ]]; then
        print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
        echo -e "${BOLD}${MAGENTA}  SSL Options${NC}"
        print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
        print_tui_option_pair "7" "SSL domain" "${SSL_DOMAIN:-melbourneguitarschool.com.au}" "Domain for nginx server_name and cert request." \
            "8" "Certbot email" "${SSL_EMAIL:-melbourneguitarschool@gmail.com}" "Email for Let's Encrypt registration and renewals."
    fi
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    echo -e "${BOLD}${YELLOW}  UI Options${NC}"
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    print_tui_option_pair "9" "Spinner UI" "$(spinner_ui_word)" "Animated progress spinner for long-running commands." \
        "10" "Edit shared .env" "Open editor" "Create shared .env if missing, then edit."
    print_tui_option_pair "11" "MySQL + create DB" "$(bool_word "${SETUP_MYSQL_DB_FROM_ENV}")" "ON: Start installs MySQL and creates DB from shared .env."
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    echo -e "${BOLD}${GREEN}  Bootstrap Workflow Helpers${NC}"
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    print_tui_option_pair "12" "Install cron/crond" "$(bool_word "${INSTALL_CRON_IF_NEEDED}")" "ON: Start installs/enables cron/crond before build." \
        "13" "Install Nginx" "$(bool_word "${INSTALL_NGINX_IF_NEEDED}")" "ON: Start installs Nginx (if missing) before build."
    echo ""
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    echo -e "${BOLD}${MAGENTA}  Immediate Bootstrap Actions${NC}"
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    print_tui_action_pair "M" "Run MySQL + create DB" "N" "Install Nginx"
    print_tui_action_pair "P" "Install PHP-FPM (if needed)" "U" "Install/update app service"
    print_tui_action_pair "D" "Update Prisma (gen/mig)" "J" "Install/update cron jobs"
    print_tui_action_pair "R" "Grab update + reload script"
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    print_tui_action_pair "S" "Start deploy" "Q" "Cancel"
    print_tui_hint_line "Tip: R checks for deploy.sh updates now; 11-13 are Start deploy toggles."
}

# Ask for deploy options in a TTY using a menu-style terminal UI so one command
# can serve both scripted and manual deploys.
run_interactive_setup() {
    local choice=""

    while true; do
        print_deploy_tui_menu
        read -r -p "Select option [1-13, j, m, n, p, r, u, s, q]: " choice

        case "${choice,,}" in
            1)
                BRANCH="$(prompt_value "Git branch to deploy" "${BRANCH}")"
                ;;
            2)
                SKIP_DEPS="$(toggle_bool "${SKIP_DEPS}")"
                ;;
            3)
                SKIP_CRON_SETUP="$(toggle_bool "${SKIP_CRON_SETUP}")"
                ;;
            4)
                deploy_cycle_migration_mode
                ;;
            5)
                SETUP_PACKAGES="$(toggle_bool "${SETUP_PACKAGES}")"
                ;;
            6)
                SSL_SETUP="$(toggle_bool "${SSL_SETUP}")"
                if [[ "${SSL_SETUP}" == true ]]; then
                    [[ -n "${SSL_DOMAIN}" ]] || SSL_DOMAIN="melbourneguitarschool.com.au"
                    [[ -n "${SSL_EMAIL}" ]] || SSL_EMAIL="melbourneguitarschool@gmail.com"
                fi
                ;;
            7)
                if [[ "${SSL_SETUP}" == true ]]; then
                    SSL_DOMAIN="$(prompt_value "SSL domain" "${SSL_DOMAIN:-melbourneguitarschool.com.au}")"
                else
                    log_warn "Enable SSL setup first to configure domain/email."
                fi
                ;;
            8)
                if [[ "${SSL_SETUP}" == true ]]; then
                    SSL_EMAIL="$(prompt_value "Certbot email" "${SSL_EMAIL:-melbourneguitarschool@gmail.com}")"
                else
                    log_warn "Enable SSL setup first to configure domain/email."
                fi
                ;;
            9)
                NO_SPINNER="$(toggle_bool "${NO_SPINNER}")"
                ;;
            10)
                section "Environment File (.env)"
                ensure_shared_env_file "${SCRIPT_DIR}/../.env.example" || true
                edit_shared_env_now || true
                ;;
            11)
                SETUP_MYSQL_DB_FROM_ENV="$(toggle_bool "${SETUP_MYSQL_DB_FROM_ENV}")"
                ;;
            12)
                INSTALL_CRON_IF_NEEDED="$(toggle_bool "${INSTALL_CRON_IF_NEEDED}")"
                ;;
            13)
                INSTALL_NGINX_IF_NEEDED="$(toggle_bool "${INSTALL_NGINX_IF_NEEDED}")"
                ;;
            j)
                ensure_managed_cron_jobs_installed_from_deploy || true
                ;;
            d)
                update_prisma || true
                ;;
            m)
                ensure_shared_env_file "${SCRIPT_DIR}/../.env.example" || true
                setup_mysql_and_database_from_shared_env || true
                ;;
            n)
                ensure_nginx_installed_from_deploy || true
                ;;
            p)
                ensure_php_fpm_installed_if_needed_from_deploy || true
                ;;
            r)
                maybe_self_update_and_restart
                ;;
            u)
                install_app_systemd_service_from_deploy || true
                ;;
            s)
                break
                ;;
            q)
                log_warn "Deployment cancelled."
                exit 0
                ;;
            *)
                log_warn "Unknown selection. Choose a menu number, J/M/N/P/R/U, S, or Q."
                ;;
        esac
    done
}

# Print a compact summary before executing so deploy choices are explicit.
print_deploy_summary() {
    section "Deploy Summary"
    echo -e "  ${BOLD}Overview${NC}"
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
    print_summary_row "App" "${APP_NAME}"
    print_summary_row "Branch" "${BRANCH}"
    print_summary_row "Database mode" "$(deploy_migration_mode_label)"
    print_summary_row "Auto bootstrap" "$(bool_word "${AUTO_BOOTSTRAP}")"
    print_summary_row "Dependencies" "$(bool_word "$(toggle_bool "${SKIP_DEPS}")")"
    print_summary_row "Cron jobs sync" "$(bool_word "$(toggle_bool "${SKIP_CRON_SETUP}")")"
    print_summary_row "Package setup" "$(bool_word "${SETUP_PACKAGES}")"
    print_summary_row "MySQL + create DB" "$(bool_word "${SETUP_MYSQL_DB_FROM_ENV}")"
    print_summary_row "Install cron/crond" "$(bool_word "${INSTALL_CRON_IF_NEEDED}")"
    print_summary_row "Install Nginx" "$(bool_word "${INSTALL_NGINX_IF_NEEDED}")"
    print_summary_row "SSL setup" "$(bool_word "${SSL_SETUP}")"
    print_summary_row "Spinner UI" "$(spinner_ui_word)"
    if [[ "${SSL_SETUP}" == true ]]; then
        print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
        echo -e "  ${BOLD}SSL${NC}"
        print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
        print_summary_row "Domain" "${SSL_DOMAIN}"
        print_summary_row "Certbot email" "${SSL_EMAIL}"
    fi
    print_tui_panel_rule "${DEPLOY_TUI_PANEL_WIDTH}"
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

# Restarts the host cron scheduler (cron/crond) when available so updated
# `current/deploy/cron.sh` paths and env-linked behavior are picked up
# immediately after deployment. This is best-effort and does not fail deploys on
# hosts that use a different scheduler or have cron disabled.
restart_cron_scheduler_if_present() {
    if ! command -v systemctl >/dev/null 2>&1; then
        log_info "systemctl not available; skipping cron scheduler restart"
        return 0
    fi

    local cron_service=""
    if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^cron\.service'; then
        cron_service="cron"
    elif systemctl list-unit-files --type=service 2>/dev/null | grep -q '^crond\.service'; then
        cron_service="crond"
    elif systemctl status cron >/dev/null 2>&1; then
        cron_service="cron"
    elif systemctl status crond >/dev/null 2>&1; then
        cron_service="crond"
    fi

    if [[ -z "${cron_service}" ]]; then
        log_info "Cron scheduler service not detected (cron/crond); skipping restart"
        return 0
    fi

    log_info "Restarting cron scheduler (${cron_service})..."
    if ! run_step "Restarting cron scheduler (${cron_service})" systemctl restart "${cron_service}"; then
        log_warn "Cron scheduler restart failed; continuing deployment"
    fi
}

# Keeps a managed root crontab block in sync with the current release's cron
# runner script. Using the `current` symlink means jobs keep working across
# deploys while this installer ensures new/changed job definitions are applied.
install_or_update_managed_crontab_jobs() {
    if ! command -v crontab >/dev/null 2>&1; then
        log_info "crontab command not available; skipping cron job install"
        return 0
    fi

    local cron_runner="${CURRENT_LINK}/deploy/cron.sh"
    local begin_marker="# BEGIN LESSONFLOW_MANAGED_CRON"
    local end_marker="# END LESSONFLOW_MANAGED_CRON"
    local legacy_begin="# BEGIN MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON"
    local legacy_end="# END MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON"
    
    local existing=""
    local stripped=""
    local tmp_file=""

    existing="$(crontab -l 2>/dev/null || true)"
    
    # Strip both new and legacy blocks
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
        echo "# LessonFlow managed cron jobs (updated by deploy.sh)"
        echo "0 20 * * * ${cron_runner} daily-bookings-digest"
        echo "30 20 * * * ${cron_runner} invoice-reminders"
        echo "45 20 * * * ${cron_runner} admin-reports-daily"
        echo "0 8 * * 1 ${cron_runner} admin-reports-weekly"
        echo "15 8 1 * * ${cron_runner} admin-reports-monthly"
        echo "30 8 1 1 * ${cron_runner} admin-reports-yearly"
        printf '%s\n' "${end_marker}"
        echo
    } > "${tmp_file}"

    run_step "Installing/updating managed cron jobs" crontab "${tmp_file}"
    rm -f "${tmp_file}"
}

write_latest_deploy_update_metadata() {
    local repo_root="$1"
    local output_file="$2"
    local commit_hash="$3"
    local previous_commit="$4"
    local release_id="$5"
    local branch_name="$6"

    [[ -n "${repo_root}" && -d "${repo_root}" && -n "${commit_hash}" && -n "${output_file}" ]] || return 0

    mkdir -p "$(dirname "${output_file}")"

    DEPLOY_UPDATE_REPO_ROOT="${repo_root}" \
    DEPLOY_UPDATE_OUTPUT_FILE="${output_file}" \
    DEPLOY_UPDATE_COMMIT="${commit_hash}" \
    DEPLOY_UPDATE_PREVIOUS_COMMIT="${previous_commit}" \
    DEPLOY_UPDATE_RELEASE="${release_id}" \
    DEPLOY_UPDATE_BRANCH="${branch_name}" \
    node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = process.env.DEPLOY_UPDATE_REPO_ROOT || "";
const outputFile = process.env.DEPLOY_UPDATE_OUTPUT_FILE || "";
const commit = process.env.DEPLOY_UPDATE_COMMIT || "";
const previousCommit = process.env.DEPLOY_UPDATE_PREVIOUS_COMMIT || "";
const release = process.env.DEPLOY_UPDATE_RELEASE || "";
const branch = process.env.DEPLOY_UPDATE_BRANCH || "main";

if (!repoRoot || !outputFile || !commit) process.exit(0);

function safeGit(args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
}

function getCommits() {
  let range = "";
  if (previousCommit) {
    try {
      safeGit(["cat-file", "-e", `${previousCommit}^{commit}`]);
      range = `${previousCommit}..${commit}`;
    } catch {}
  }

  const format = "%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1e";
  const args = ["log", "--reverse", `--pretty=format:${format}`];
  if (range) {
    args.push(range);
  } else {
    args.push("-n", "10", commit);
  }

  const raw = safeGit(args);
  const entries = raw
    .split("\x1e")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((row) => {
      const [hash, shortHash, authorName, authoredAt, subject, body] = row.split("\x1f");
      return {
        hash,
        shortHash,
        authorName,
        authoredAt,
        subject,
        body: (body || "").trim()
      };
    });

  if (range) {
    return entries.filter((entry) => entry.hash !== previousCommit);
  }
  return entries;
}

const payload = {
  app: "lessonflow",
  branch,
  release,
  appliedAt: new Date().toISOString(),
  commit,
  shortCommit: safeGit(["rev-parse", "--short", commit]),
  previousCommit: previousCommit || null,
  commits: getCommits()
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
NODE
}

# Pulls the selected branch at the start of direct deploy runs and restarts the
# script if the checked-out commit changed. This ensures new deploy script logic
# is used immediately after a self-update (matching update.sh behavior).
maybe_self_update_and_restart() {
    [[ "${ROLLBACK}" == true ]] && return 0

    local restart_count="${MGS_DEPLOY_SELF_RESTART_COUNT:-0}"
    if [[ ! "${restart_count}" =~ ^[0-9]+$ ]]; then
        restart_count=0
    fi
    if (( restart_count >= 2 )); then
        log_warn "Deploy self-update restart limit reached; continuing with current script."
        return 0
    fi

    local repo_root=""
    if git -C "${SCRIPT_DIR}/.." rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        repo_root="$(git -C "${SCRIPT_DIR}/.." rev-parse --show-toplevel)"
    elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        repo_root="$(git rev-parse --show-toplevel)"
    else
        log_info "No git repository detected for deploy self-update; skipping early git pull"
        return 0
    fi

    if [[ -n "$(git -C "${repo_root}" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
        log_warn "Source repository has local modifications; skipping early git pull in deploy.sh"
        return 0
    fi

    local before_commit=""
    local after_commit=""
    local current_branch=""
    before_commit="$(git -C "${repo_root}" rev-parse --short=12 HEAD 2>/dev/null || true)"
    current_branch="$(git -C "${repo_root}" symbolic-ref --short HEAD 2>/dev/null || true)"

    section "Git Update"
    log_info "Deploy self-update check in ${repo_root}"
    run_step "Fetching origin/${BRANCH}" git -C "${repo_root}" fetch origin "${BRANCH}"

    if [[ -n "${current_branch}" && "${current_branch}" != "${BRANCH}" ]]; then
        run_step "Checking out ${BRANCH}" git -C "${repo_root}" checkout "${BRANCH}"
    fi

    if [[ -z "$(git -C "${repo_root}" symbolic-ref --short HEAD 2>/dev/null || true)" ]]; then
        log_warn "Detached HEAD detected; skipping deploy.sh self-update pull"
        return 0
    fi

    run_step "Pulling latest origin/${BRANCH}" git -C "${repo_root}" pull --ff-only origin "${BRANCH}"
    after_commit="$(git -C "${repo_root}" rev-parse --short=12 HEAD 2>/dev/null || true)"
    log_info "Repository commit: $(git -C "${repo_root}" rev-parse --short HEAD)"

    if [[ -n "${before_commit}" && -n "${after_commit}" && "${before_commit}" != "${after_commit}" ]]; then
        local commit_details=""
        commit_details="$(git -C "${repo_root}" log --reverse --date=local --pretty=format:'%C(yellow)%h%Creset %ad %C(cyan)%an%Creset%n  %s%n%+b' "${before_commit}..${after_commit}" 2>/dev/null || true)"
        if [[ -n "${commit_details}" ]]; then
            section "Git Changes"
            echo "${commit_details}"
            if [[ "${IS_TTY}" == true && "${MGS_SKIP_SELF_UPDATE_KEYPRESS:-0}" != "1" ]]; then
                echo ""
                read -r -n 1 -s -p "Press any key to reload deploy menu with the new script..." _
                echo ""
            fi
        fi
        log_warn "deploy.sh source updated (${before_commit} -> ${after_commit}); restarting script and returning to the main menu..."
        export MGS_RETURN_TO_MENU_AFTER_SELF_UPDATE=1
        export MGS_DEPLOY_SELF_RESTART_COUNT=$((restart_count + 1))
        exec "${SCRIPT_DIR}/deploy.sh" "${ORIGINAL_ARGS[@]}"
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
    local target_total_swap_mb=""
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
        target_total_swap_mb="${LOW_RAM_1GB_TARGET_TOTAL_SWAP_MB}"
    elif (( total_ram_mb >= LOW_RAM_2GB_AUTO_HEAP_MIN_MB && total_ram_mb <= LOW_RAM_2GB_AUTO_HEAP_MAX_MB )); then
        target_total_swap_mb="${LOW_RAM_2GB_TARGET_TOTAL_SWAP_MB}"
    else
        log_info "Detected ${total_ram_mb}MB RAM; skipping temporary build swap"
        return 0
    fi

    total_swap_mb="$(detect_total_swap_mb || echo 0)"
    if ! [[ "${total_swap_mb}" =~ ^[0-9]+$ ]]; then
        total_swap_mb="0"
    fi

    if [[ -n "${target_total_swap_mb}" && "${target_total_swap_mb}" =~ ^[0-9]+$ ]]; then
        swap_mb=$(( target_total_swap_mb - total_swap_mb ))
    fi

    if [[ -z "${swap_mb}" || "${swap_mb}" -le 0 ]]; then
        log_info "Detected ${total_swap_mb}MB existing swap; target is ${target_total_swap_mb}MB, skipping temporary build swap"
        return 0
    fi

    if (( swap_mb < TEMP_BUILD_SWAP_MIN_CREATE_MB )); then
        log_info "Only ${swap_mb}MB additional swap needed (< ${TEMP_BUILD_SWAP_MIN_CREATE_MB}MB minimum); skipping temporary build swap"
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

    log_warn "Creating temporary build swap (${swap_mb}MB) at ${TEMP_BUILD_SWAP_PATH} to reach ~${target_total_swap_mb}MB total swap"
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
        --skip-cron) SKIP_CRON_SETUP=true; shift ;;
        --skip-migrate) SKIP_MIGRATE=true; shift ;;
        --db-push) DB_PUSH=true; shift ;;
        --rollback) ROLLBACK=true; shift ;;
        --setup-packages) SETUP_PACKAGES=true; shift ;;
        --setup-mysql-db-from-env) SETUP_MYSQL_DB_FROM_ENV=true; shift ;;
        --install-nginx) INSTALL_NGINX_IF_NEEDED=true; shift ;;
        --install-php-fpm-if-needed) INSTALL_PHP_FPM_IF_NEEDED=true; shift ;;
        --install-cron) INSTALL_CRON_IF_NEEDED=true; shift ;;
        --install-app-service) INSTALL_APP_SERVICE_IF_NEEDED=true; shift ;;
        --install-cron-jobs) INSTALL_CRON_JOBS_IF_NEEDED=true; shift ;;
        --no-auto-bootstrap) AUTO_BOOTSTRAP=false; shift ;;
        --update-prisma) UPDATE_PRISMA_ONLY=true; shift ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *) log_error "Unknown argument: $1"; exit 1 ;;
    esac
done

# Detects legacy deployment naming and migrates host paths/service/nginx/cron to
# lessonflow so future update.sh/deploy.sh runs stay on the current runtime.
check_legacy_migration() {
    local legacy_name="melbourne-guitar-school"
    local legacy_dir="/var/www/${legacy_name}"
    local legacy_service="${legacy_name}.service"
    local legacy_service_file="/etc/systemd/system/${legacy_service}"
    local target_service_file="/etc/systemd/system/${APP_NAME}.service"
    local legacy_nginx_avail="/etc/nginx/sites-available/${legacy_name}"
    local legacy_nginx_enabled="/etc/nginx/sites-enabled/${legacy_name}"
    local target_nginx_avail="/etc/nginx/sites-available/${APP_NAME}"
    local target_nginx_enabled="/etc/nginx/sites-enabled/${APP_NAME}"
    local existing=""
    local migrated=""
    local tmp_file=""

    if [[ "${APP_NAME}" != "lessonflow" ]]; then
        return 0
    fi

    if [[ -d "${legacy_dir}" && -d "${DEPLOY_DIR}" ]]; then
        log_error "Both legacy and target deploy directories exist:"
        log_error "  legacy: ${legacy_dir}"
        log_error "  target: ${DEPLOY_DIR}"
        log_error "Resolve this manually to avoid accidental data loss."
        exit 1
    fi

    if [[ ! -d "${legacy_dir}" && ! -f "${legacy_service_file}" && ! -f "${legacy_nginx_avail}" && ! -L "${legacy_nginx_enabled}" ]]; then
        return 0
    fi

    section "Legacy Migration Detection"

    if [[ ${EUID} -ne 0 ]]; then
        log_error "Migration requires root privileges. Please re-run with sudo or --sudo-deploy."
        exit 1
    fi

    if [[ -d "${legacy_dir}" ]]; then
        log_warn "Detected legacy deployment directory: ${legacy_dir}"
        log_info "Migrating ${legacy_dir} to ${DEPLOY_DIR}..."
        mv "${legacy_dir}" "${DEPLOY_DIR}"
        log_info "Directory migrated successfully."
    fi

    if command -v systemctl >/dev/null 2>&1; then
        if systemctl list-units --full --all | grep -q "${legacy_service}"; then
            if systemctl is-active --quiet "${legacy_service}"; then
                log_info "Stopping legacy service: ${legacy_service}"
                systemctl stop "${legacy_service}"
            fi
            log_info "Disabling legacy service: ${legacy_service}"
            systemctl disable "${legacy_service}"
        fi
    fi

    if [[ -f "${legacy_service_file}" && ! -f "${target_service_file}" ]]; then
        if [[ -f "${SCRIPT_DIR}/lessonflow.service" ]]; then
            log_info "Installing lessonflow service unit from deploy/lessonflow.service"
            cp "${SCRIPT_DIR}/lessonflow.service" "${target_service_file}"
        else
            log_info "Converting legacy service unit to lessonflow naming"
            sed \
                -e "s/melbourne-guitar-school/lessonflow/g" \
                "${legacy_service_file}" > "${target_service_file}"
        fi
        if command -v systemctl >/dev/null 2>&1; then
            systemctl daemon-reload >/dev/null 2>&1 || true
        fi
    fi

    if [[ -f "${legacy_nginx_avail}" && ! -f "${target_nginx_avail}" ]]; then
        log_info "Converting nginx site ${legacy_name} -> ${APP_NAME}"
        sed \
            -e "s/melbourne_guitar_school/lessonflow/g" \
            -e "s#/var/www/melbourne-guitar-school#/var/www/lessonflow#g" \
            -e "s/melbourne-guitar-school/lessonflow/g" \
            "${legacy_nginx_avail}" > "${target_nginx_avail}"
    fi

    if [[ -f "${target_nginx_avail}" ]]; then
        ln -sfn "${target_nginx_avail}" "${target_nginx_enabled}"
    fi

    if [[ -L "${legacy_nginx_enabled}" ]]; then
        log_info "Removing legacy nginx symlink: ${legacy_nginx_enabled}"
        rm -f "${legacy_nginx_enabled}"
    fi

    if [[ -f "${legacy_nginx_avail}" ]]; then
        log_info "Removing legacy nginx site file: ${legacy_nginx_avail}"
        rm -f "${legacy_nginx_avail}"
    fi

    if command -v crontab >/dev/null 2>&1; then
        existing="$(crontab -l 2>/dev/null || true)"
        migrated="$(printf '%s\n' "${existing}" | awk '
            $0 == "# BEGIN MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON" { skip=1; next }
            $0 == "# END MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON" { skip=0; next }
            !skip { print }
        ' | sed \
            -e "s#/var/www/melbourne-guitar-school/current/deploy/cron.sh#/var/www/lessonflow/current/deploy/cron.sh#g")"

        tmp_file="$(mktemp)"
        printf '%s\n' "${migrated}" > "${tmp_file}"
        crontab "${tmp_file}" || true
        rm -f "${tmp_file}"
    fi

    if [[ -f "${target_nginx_avail}" ]] && command -v nginx >/dev/null 2>&1; then
        if ! nginx -t >/dev/null 2>&1; then
            log_error "Nginx config test failed after legacy migration conversion."
            exit 1
        fi
    fi

    log_info "Legacy migration checks complete."
}

# Repairs stale/broken current symlink drift after runtime rename so systemd
# WorkingDirectory and cron runner paths always resolve under /var/www/lessonflow.
repair_current_symlink_drift() {
    local legacy_dir="/var/www/melbourne-guitar-school"
    local current_link="${CURRENT_LINK}"
    local raw_target=""
    local resolved_target=""
    local rewritten_target=""
    local latest_release=""

    if [[ "${APP_NAME}" != "lessonflow" ]]; then
        return 0
    fi

    section "Current Symlink Drift Check"

    if [[ -L "${current_link}" ]]; then
        raw_target="$(readlink "${current_link}" 2>/dev/null || true)"
        resolved_target="$(readlink -f "${current_link}" 2>/dev/null || true)"

        if [[ -n "${raw_target}" && "${raw_target}" == "${legacy_dir}/"* ]]; then
            rewritten_target="${raw_target/#${legacy_dir}/${DEPLOY_DIR}}"

            if [[ -e "${rewritten_target}" ]]; then
                log_warn "Detected stale legacy current symlink target."
                log_info "Relinking current: ${raw_target} -> ${rewritten_target}"
                ln -sfn "${rewritten_target}" "${current_link}"
                return 0
            fi

            latest_release="$(ls -1dt "${RELEASES_DIR}"/* 2>/dev/null | head -n 1 || true)"
            if [[ -n "${latest_release}" ]]; then
                log_warn "Legacy symlink target missing. Relinking current to latest release: ${latest_release}"
                ln -sfn "${latest_release}" "${current_link}"
                return 0
            fi

            log_warn "Legacy current symlink target missing and no releases are available yet."
            return 0
        fi

        if [[ -z "${resolved_target}" ]]; then
            latest_release="$(ls -1dt "${RELEASES_DIR}"/* 2>/dev/null | head -n 1 || true)"
            if [[ -n "${latest_release}" ]]; then
                log_warn "Current symlink is broken; relinking to latest release: ${latest_release}"
                ln -sfn "${latest_release}" "${current_link}"
            else
                log_warn "Current symlink is broken and no releases are available yet."
            fi
            return 0
        fi

        log_info "Current symlink already valid: ${raw_target}"
        return 0
    fi

    if [[ -e "${current_link}" ]]; then
        log_warn "Current path exists but is not a symlink: ${current_link}"
        return 0
    fi

    latest_release="$(ls -1dt "${RELEASES_DIR}"/* 2>/dev/null | head -n 1 || true)"
    if [[ -n "${latest_release}" ]]; then
        log_warn "Current symlink missing; linking to latest release: ${latest_release}"
        ln -sfn "${latest_release}" "${current_link}"
    else
        log_info "Current symlink missing and no releases are available yet."
    fi
}

detect_tty_capabilities
reexec_with_sudo_if_needed
maybe_self_update_and_restart

check_legacy_migration
repair_current_symlink_drift
auto_enable_bootstrap_defaults_deploy

if [[ "${MGS_RETURN_TO_MENU_AFTER_SELF_UPDATE:-}" == "1" && "${IS_TTY}" == true && "${ROLLBACK}" == false ]]; then
    INTERACTIVE=true
    unset MGS_RETURN_TO_MENU_AFTER_SELF_UPDATE
fi

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

# Execute immediate bootstrap actions requested via CLI flags
if [[ "${UPDATE_PRISMA_ONLY}" == true ]]; then
    # We may need shared env if migrations are to be run
    ensure_shared_env_file "${SOURCE_DIR}/.env.example" || true
    if [[ -f "${SHARED_DIR}/.env" ]]; then
        export $(grep -v '^#' "${SHARED_DIR}/.env" | xargs)
    fi
    update_prisma
    exit 0
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

# Track deployed git commit metadata so the admin UI can show "latest updates"
# after a successful deploy. This is best-effort and skipped for non-git source
# deployments.
if [[ -d "${SOURCE_DIR}/.git" ]]; then
    DEPLOY_GIT_REPO_ROOT="${SOURCE_DIR}"
    DEPLOY_TARGET_COMMIT_HASH="$(git -C "${SOURCE_DIR}" rev-parse "${BRANCH}" 2>/dev/null || true)"
    if [[ -L "${CURRENT_LINK}" && -f "${CURRENT_LINK}/.deploy-version" ]]; then
        DEPLOY_PREVIOUS_COMMIT_HASH="$(tr -d '[:space:]' < "${CURRENT_LINK}/.deploy-version" 2>/dev/null || true)"
    fi
fi

# Create directories if they don't exist
mkdir -p "${RELEASES_DIR}"
mkdir -p "${SHARED_DIR}/data"
chown -R www-data:www-data "${DEPLOY_DIR}"
chmod -R 775 "${SHARED_DIR}/data"

section "Environment File (.env)"
ensure_shared_env_file "${SOURCE_DIR}/.env.example" || true
maybe_edit_shared_env_before_deploy "${SOURCE_DIR}"

if [[ "${INSTALL_NGINX_IF_NEEDED}" == true ]]; then
    ensure_nginx_installed_from_deploy
fi

if [[ "${INSTALL_PHP_FPM_IF_NEEDED}" == true ]]; then
    ensure_php_fpm_installed_if_needed_from_deploy
fi

if [[ "${INSTALL_CRON_IF_NEEDED}" == true && "${INSTALL_CRON_JOBS_IF_NEEDED}" != true ]]; then
    ensure_cron_installed_from_deploy
fi

if [[ "${INSTALL_APP_SERVICE_IF_NEEDED}" == true ]]; then
    install_app_systemd_service_from_deploy
fi

if [[ "${INSTALL_CRON_JOBS_IF_NEEDED}" == true ]]; then
    ensure_managed_cron_jobs_installed_from_deploy
fi

if [[ "${SETUP_MYSQL_DB_FROM_ENV}" == true ]]; then
    setup_mysql_and_database_from_shared_env
fi

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

if [[ -n "${DEPLOY_TARGET_COMMIT_HASH}" ]]; then
    printf '%s\n' "${DEPLOY_TARGET_COMMIT_HASH}" > "${NEW_RELEASE_DIR}/.deploy-version"
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

# Consolidate Prisma update (generate client and run migrations)
update_prisma

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

# The systemd service runs the standalone server entrypoint directly. If Next.js
# does not emit .next/standalone/server.js, promoting this release would cause
# immediate runtime failure (MODULE_NOT_FOUND) after symlink switch.
if [[ ! -f ".next/standalone/server.js" ]]; then
    log_error "Standalone build output missing: .next/standalone/server.js"
    log_error "Refusing to promote this release because lessonflow.service requires standalone output."
    log_error "Check next.config.js output='standalone' and build logs, then redeploy."
    exit 1
fi

# Setup standalone build (copy public, static assets, and runtime docs)
# This is required for next/image/static assets and for /admin/manual, which
# reads Markdown files from the filesystem at runtime in standalone mode.
if [[ -d ".next/standalone" ]]; then
    log_info "Setting up standalone build assets..."
    cp -r public ".next/standalone/"
    if [[ -d "Documentation" ]]; then
        cp -r Documentation ".next/standalone/"
    fi
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
SERVICE_SOURCE="${NEW_RELEASE_DIR}/deploy/${APP_NAME}.service"
SERVICE_SOURCE_IS_TEMP=false
if [[ ! -f "${SERVICE_SOURCE}" ]]; then
    if [[ -f "${NEW_RELEASE_DIR}/deploy/app.service.template" ]]; then
        SERVICE_SOURCE="$(mktemp)"
        SERVICE_SOURCE_IS_TEMP=true
        sed -e "s/{{APP_NAME}}/${APP_NAME}/g" \
            -e "s/{{BRAND_NAME}}/${NEXT_PUBLIC_BRAND_NAME:-LessonFlow}/g" \
            "${NEW_RELEASE_DIR}/deploy/app.service.template" > "${SERVICE_SOURCE}"
    else
        log_error "No systemd service source found in release deploy/ directory."
        exit 1
    fi
fi

if [[ ! -f "${SERVICE_FILE}" ]]; then
    log_info "Installing systemd service..."
    cp "${SERVICE_SOURCE}" "${SERVICE_FILE}"
    systemctl daemon-reload
    systemctl enable ${APP_NAME}
elif ! cmp -s "${SERVICE_SOURCE}" "${SERVICE_FILE}"; then
    log_info "Updating systemd service..."
    cp "${SERVICE_SOURCE}" "${SERVICE_FILE}"
    systemctl daemon-reload
else
    log_info "Systemd service already up to date"
fi

if [[ "${SERVICE_SOURCE_IS_TEMP}" == true ]]; then
    rm -f "${SERVICE_SOURCE}" || true
fi

# Ensure nginx config is installed/updated (use HTTPS template after certs exist).
# deploy.sh now re-syncs the repo template on every run so config drift in
# /etc/nginx/sites-available does not survive future deployments.
NGINX_SITE_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"
NGINX_CERT_CHAIN="/etc/letsencrypt/live/melbourneguitarschool.com.au/fullchain.pem"
NGINX_CERT_KEY="/etc/letsencrypt/live/melbourneguitarschool.com.au/privkey.pem"
NGINX_TEMPLATE_SOURCE="${NEW_RELEASE_DIR}/deploy/nginx-http.conf"
if [[ -f "${NGINX_CERT_CHAIN}" && -f "${NGINX_CERT_KEY}" ]]; then
    # Once certs exist we promote the HTTPS template on each deploy; otherwise
    # the HTTP-only bootstrap template keeps first-time installs reachable.
    NGINX_TEMPLATE_SOURCE="${NEW_RELEASE_DIR}/deploy/nginx.conf"
fi

log_info "Syncing nginx configuration from $(basename "${NGINX_TEMPLATE_SOURCE}")..."
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
if [[ -f "${NGINX_SITE_AVAILABLE}" ]]; then
    cp "${NGINX_SITE_AVAILABLE}" "${NGINX_SITE_AVAILABLE}.bak"
fi
cp "${NGINX_TEMPLATE_SOURCE}" "${NGINX_SITE_AVAILABLE}"
ln -sf "${NGINX_SITE_AVAILABLE}" "${NGINX_SITE_ENABLED}"
rm -f /etc/nginx/sites-enabled/default

if nginx -t; then
    log_info "Nginx configuration test passed"
else
    log_error "Nginx configuration test failed"
    if [[ -f "${NGINX_SITE_AVAILABLE}.bak" ]]; then
        log_warn "Restoring previous nginx configuration backup..."
        cp "${NGINX_SITE_AVAILABLE}.bak" "${NGINX_SITE_AVAILABLE}"
        nginx -t >/dev/null 2>&1 || true
    fi
    exit 1
fi

# Restart the app first so Nginx's upstream health check/load happens against
# the freshly-linked release. Nginx itself is restarted after the app confirms
# healthy so proxy errors during startup are less likely.
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

# Restart nginx after app deploy so the synced template is active and any proxy
# worker state picks up the current upstream + headers/rate-limit config.
log_info "Restarting nginx..."
run_step "Restarting nginx" systemctl restart nginx

# Install/update the managed cron entries after the `current` symlink moves so
# cron uses the latest runner path and includes any newly introduced jobs.
if [[ "${SKIP_CRON_SETUP}" == true ]]; then
    log_info "Skipping managed cron jobs sync"
else
    install_or_update_managed_crontab_jobs
fi

# Restart cron after the release symlink update so jobs that call
# /var/www/.../current/deploy/cron.sh pick up the newest script/env path
# behavior immediately on systems where cron service reload/restart is used.
restart_cron_scheduler_if_present

# Persist deploy commit/change metadata for the admin "Latest Updates" popup.
if [[ -n "${DEPLOY_GIT_REPO_ROOT}" && -n "${DEPLOY_TARGET_COMMIT_HASH}" ]]; then
    write_latest_deploy_update_metadata \
        "${DEPLOY_GIT_REPO_ROOT}" \
        "${SHARED_DIR}/data/deploy/latest-deploy-update.json" \
        "${DEPLOY_TARGET_COMMIT_HASH}" \
        "${DEPLOY_PREVIOUS_COMMIT_HASH}" \
        "${TIMESTAMP}" \
        "${BRANCH}" || log_warn "Failed to write deploy update metadata; continuing deployment"
fi

# Cleanup old releases
log_info "Cleaning up old releases..."
cleanup_old_releases

log_info "Deployment complete!"
log_info "Current release: ${TIMESTAMP}"
