#!/bin/bash
set -euo pipefail

APP_NAME="${APP_NAME:-lessonflow}"
RUNTIME_USER="${RUNTIME_USER:-www-data}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/${APP_NAME}}"
SHARED_DIR="${SHARED_DIR:-${DEPLOY_DIR}/shared}"
REPO_ROOT="${REPO_ROOT:-}"
ENV_TEMPLATE_PATH="${ENV_TEMPLATE_PATH:-}"
SOURCE_MODE="${SOURCE_MODE:-unknown}"
SUDOERS_DIR="${LESSONFLOW_SUDOERS_DIR:-/etc/sudoers.d}"
DEPLOY_SUDOERS_TEMPLATE="${DEPLOY_SUDOERS_TEMPLATE:-}"
WEB_UPDATE_SUDOERS_TEMPLATE="${WEB_UPDATE_SUDOERS_TEMPLATE:-}"

log_info() {
  printf 'BOOTSTRAP: %s\n' "$1"
}

log_warn() {
  printf 'BOOTSTRAP_WARN: %s\n' "$1" >&2
}

log_error() {
  printf 'BOOTSTRAP_ERROR: %s\n' "$1" >&2
}

is_effective_root() {
  [[ ${EUID} -eq 0 || "${LESSONFLOW_TEST_ASSUME_ROOT:-0}" == "1" ]]
}

run_root_cmd() {
  if is_effective_root; then
    "$@"
    return $?
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi

  "$@"
}

run_as_user() {
  local target_user="$1"
  shift

  if command -v runuser >/dev/null 2>&1; then
    run_root_cmd runuser -u "${target_user}" -- "$@"
    return $?
  fi

  if command -v sudo >/dev/null 2>&1; then
    run_root_cmd sudo -u "${target_user}" "$@"
    return $?
  fi

  "$@"
}

read_env_value() {
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

write_env_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"

  if grep -Eq "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "${env_file}" 2>/dev/null; then
    run_root_cmd sed -i -E "s|^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=.*$|${key}=\"${value}\"|" "${env_file}"
  else
    echo "${key}=\"${value}\"" >> "${env_file}"
  fi
}

valid_os_user_name() {
  [[ "${1:-}" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]
}

user_exists() {
  getent passwd "${1}" >/dev/null 2>&1
}

ensure_user_exists() {
  local user_name="$1"

  user_exists "${user_name}" && return 0
  valid_os_user_name "${user_name}" || {
    log_error "Configured deploy user '${user_name}' is invalid."
    return 1
  }

  log_info "Creating deploy user: ${user_name}"
  run_root_cmd useradd -m -s /bin/bash "${user_name}"
}

resolve_repo_owner() {
  local repo_root="$1"
  local owner=""

  [[ -n "${repo_root}" ]] || return 1
  owner="$(stat -c '%U' "${repo_root}" 2>/dev/null || true)"
  [[ -n "${owner}" && "${owner}" != "root" && "${owner}" != "UNKNOWN" ]] || return 1
  printf '%s\n' "${owner}"
}

render_sudoers_template() {
  local template_path="$1"
  local output_path="$2"
  local placeholder="$3"
  local replacement="$4"

  [[ -f "${template_path}" ]] || return 1
  sed "s/<${placeholder}>/${replacement}/g" "${template_path}" > "${output_path}"
}

validate_sudoers_file() {
  local file_path="$1"

  if command -v visudo >/dev/null 2>&1; then
    visudo -cf "${file_path}" >/dev/null
  fi
}

install_sudoers_file() {
  local source_file="$1"
  local target_file="$2"

  run_root_cmd mkdir -p "${SUDOERS_DIR}"
  run_root_cmd cp "${source_file}" "${target_file}"
  run_root_cmd chmod 0440 "${target_file}"
  validate_sudoers_file "${target_file}"
}

main() {
  local shared_env_path="${SHARED_DIR}/.env"
  local desired_repo_path=""
  local env_deploy_user=""
  local deploy_user=""
  local repo_owner=""
  local deploy_sudoers_target="${SUDOERS_DIR}/${APP_NAME}"
  local web_update_sudoers_target="${SUDOERS_DIR}/${APP_NAME}-web-update"
  local tmp_sudoers=""

  run_root_cmd mkdir -p "${SHARED_DIR}"

  # Ensure the cron/timer log directory exists and is owned by the runtime user.
  # The scheduled units (gmail-sync, invoice-reminders, admin-reports, analytics)
  # run as ${RUNTIME_USER}. If /var/log/${APP_NAME} is left owned by root, those
  # units fail at startup with "Permission denied" when cron.sh opens the daily
  # log file (cron-YYYYMMDD.log), which silently stops all background jobs. The
  # setgid bit keeps new log files in the runtime group.
  run_root_cmd mkdir -p "/var/log/${APP_NAME}"
  run_root_cmd chown -R "${RUNTIME_USER}:${RUNTIME_USER}" "/var/log/${APP_NAME}"
  run_root_cmd chmod 2775 "/var/log/${APP_NAME}"

  if [[ ! -f "${shared_env_path}" && -n "${ENV_TEMPLATE_PATH}" && -f "${ENV_TEMPLATE_PATH}" ]]; then
    log_info "Creating shared env from template: ${shared_env_path}"
    run_root_cmd cp "${ENV_TEMPLATE_PATH}" "${shared_env_path}"
  fi

  if [[ -f "${shared_env_path}" ]]; then
    env_deploy_user="$(read_env_value "${shared_env_path}" "UPDATES_DEPLOY_USER" || true)"
    desired_repo_path="$(read_env_value "${shared_env_path}" "UPDATES_GIT_REPO_PATH" || true)"
  fi

  if [[ "${SOURCE_MODE}" == "git" && -n "${REPO_ROOT}" && -d "${REPO_ROOT}/.git" ]]; then
    desired_repo_path="${REPO_ROOT}"
    log_info "Adopting current checkout as persistent git repo: ${desired_repo_path}"
  elif [[ -z "${desired_repo_path}" && -n "${REPO_ROOT}" && -d "${REPO_ROOT}" ]]; then
    desired_repo_path="${REPO_ROOT}"
  fi

  if [[ -n "${env_deploy_user}" && "$(valid_os_user_name "${env_deploy_user}"; echo $?)" -eq 0 ]]; then
    deploy_user="${env_deploy_user}"
  elif repo_owner="$(resolve_repo_owner "${desired_repo_path}" 2>/dev/null || true)"; then
    deploy_user="${repo_owner}"
  elif [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    deploy_user="${SUDO_USER}"
  elif [[ -n "${USER:-}" && "${USER}" != "root" ]]; then
    deploy_user="${USER}"
  else
    deploy_user="${APP_NAME}-deploy"
  fi

  ensure_user_exists "${deploy_user}"

  if [[ -n "${desired_repo_path}" && -d "${desired_repo_path}/.git" ]]; then
    log_info "Repairing repository ownership for ${desired_repo_path} -> ${deploy_user}"
    run_root_cmd chown -R "${deploy_user}:${deploy_user}" "${desired_repo_path}"
    
    # Configure safe.directory as root (works for all users after ownership fix)
    run_root_cmd git config --global --add safe.directory "${desired_repo_path}" 2>/dev/null || true
    
    # Skip git test - it can hang in some environments. Ownership fix is sufficient.
    log_info "Repository ownership fixed for ${desired_repo_path}"
  fi

  if [[ -f "${shared_env_path}" ]]; then
    write_env_value "${shared_env_path}" "UPDATES_DEPLOY_USER" "${deploy_user}"
    if [[ -n "${desired_repo_path}" ]]; then
      write_env_value "${shared_env_path}" "UPDATES_GIT_REPO_PATH" "${desired_repo_path}"
    fi
    run_root_cmd chown "${RUNTIME_USER}:${RUNTIME_USER}" "${shared_env_path}" 2>/dev/null || true
    run_root_cmd chmod 640 "${shared_env_path}" 2>/dev/null || true
  fi

  if [[ -n "${DEPLOY_SUDOERS_TEMPLATE}" && -f "${DEPLOY_SUDOERS_TEMPLATE}" ]]; then
    tmp_sudoers="$(mktemp)"
    render_sudoers_template "${DEPLOY_SUDOERS_TEMPLATE}" "${tmp_sudoers}" "DEPLOY_USER" "${deploy_user}"
    install_sudoers_file "${tmp_sudoers}" "${deploy_sudoers_target}"
    rm -f "${tmp_sudoers}"
  fi

  if [[ -n "${WEB_UPDATE_SUDOERS_TEMPLATE}" && -f "${WEB_UPDATE_SUDOERS_TEMPLATE}" ]]; then
    tmp_sudoers="$(mktemp)"
    render_sudoers_template "${WEB_UPDATE_SUDOERS_TEMPLATE}" "${tmp_sudoers}" "APP_RUNTIME_USER" "${RUNTIME_USER}"
    install_sudoers_file "${tmp_sudoers}" "${web_update_sudoers_target}"
    rm -f "${tmp_sudoers}"
  fi

  log_info "Host bootstrap complete for deploy user ${deploy_user}"
  return 0
}

main "$@"
