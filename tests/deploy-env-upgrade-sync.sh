#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

assert_env_value() {
  local env_file="$1"
  local key="$2"
  local expected="$3"
  local actual=""

  actual="$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "${env_file}" | sed -E 's/^[^=]*=[[:space:]]*//')"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "Expected ${key}=${expected} in ${env_file}, found ${actual}"
    exit 1
  fi
}

run_deploy_function_check() {
  local temp_root template_file shared_dir
  temp_root="$(mktemp -d)"
  template_file="${temp_root}/template.env"
  shared_dir="${temp_root}/shared"
  mkdir -p "${shared_dir}"

  cat > "${template_file}" <<'ENV'
# Upgrade template used by deploy env sync test
EXISTING_KEY="template-existing"
NEW_TEXT_KEY="template-value"
export NEW_EXPORTED_KEY="template-exported"
NEW_BOOLEAN_KEY="true"
NEW_NUMBER_KEY="993"
ENV

  cat > "${shared_dir}/.env" <<'ENV'
EXISTING_KEY="keep-me"
ENV

  bash -lc "
    set -euo pipefail
    SHARED_DIR='${shared_dir}'
    log_info() { :; }
    log_warn() { :; }
    $(sed -n '/^extract_env_assignment_key()/,/^}/p;/^ensure_shared_env_file()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    ensure_shared_env_file '${template_file}'
  "

  assert_env_value "${shared_dir}/.env" "EXISTING_KEY" '"keep-me"'
  assert_env_value "${shared_dir}/.env" "NEW_TEXT_KEY" '""'
  assert_env_value "${shared_dir}/.env" "NEW_EXPORTED_KEY" '""'
  assert_env_value "${shared_dir}/.env" "NEW_BOOLEAN_KEY" '""'
  assert_env_value "${shared_dir}/.env" "NEW_NUMBER_KEY" '""'

  rm -rf "${temp_root}"
}

run_update_function_check() {
  local temp_root template_file shared_dir
  temp_root="$(mktemp -d)"
  template_file="${temp_root}/template.env"
  shared_dir="${temp_root}/shared"
  mkdir -p "${shared_dir}"

  cat > "${template_file}" <<'ENV'
# Upgrade template used by update env sync test
EXISTING_KEY="template-existing"
NEW_TEXT_KEY="template-value"
export NEW_EXPORTED_KEY="template-exported"
NEW_BOOLEAN_KEY="true"
NEW_NUMBER_KEY="993"
ENV

  cat > "${shared_dir}/.env" <<'ENV'
EXISTING_KEY="keep-me"
ENV

  bash -lc "
    set -euo pipefail
    SHARED_DIR='${shared_dir}'
    log_info() { :; }
    log_warn() { :; }
    run_shared_env_cmd() {
      case \"\$1\" in
        chown|chmod)
          return 0
          ;;
        *)
          \"\$@\"
          ;;
      esac
    }
    $(sed -n '/^extract_env_assignment_key()/,/^}/p;/^ensure_shared_env_file()/,/^}/p' "${REPO_ROOT}/deploy/update.sh")
    ensure_shared_env_file '${template_file}'
  "

  assert_env_value "${shared_dir}/.env" "EXISTING_KEY" '"keep-me"'
  assert_env_value "${shared_dir}/.env" "NEW_TEXT_KEY" '""'
  assert_env_value "${shared_dir}/.env" "NEW_EXPORTED_KEY" '""'
  assert_env_value "${shared_dir}/.env" "NEW_BOOLEAN_KEY" '""'
  assert_env_value "${shared_dir}/.env" "NEW_NUMBER_KEY" '""'

  rm -rf "${temp_root}"
}

echo "Verifying deploy.sh shared env sync appends blank placeholders..."
run_deploy_function_check

echo "Verifying update.sh shared env sync appends blank placeholders..."
run_update_function_check

echo "Deploy env upgrade sync checks passed."
