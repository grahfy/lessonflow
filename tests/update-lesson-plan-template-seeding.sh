#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

FUNCS_FILE="${TEST_ROOT}/update-seed-funcs.sh"
LOG_FILE="${TEST_ROOT}/seed.log"
NPM_LOG_FILE="${TEST_ROOT}/npm.log"

sed -n '/^maybe_seed_example_lesson_plan_templates()/,/^}/p' deploy/update.sh > "${FUNCS_FILE}"

cat >> "${FUNCS_FILE}" <<'EOF'
log_info() {
  printf 'INFO: %s\n' "$1" >> "${LOG_FILE}"
}

log_warn() {
  printf 'WARN: %s\n' "$1" >> "${LOG_FILE}"
}

section() {
  printf 'SECTION: %s\n' "$1" >> "${LOG_FILE}"
}

run_deploy_path_cmd() {
  "$@"
}

read_env_file_value_from_update() {
  local env_file="$1"
  local key="$2"

  grep -m1 -E "^[[:space:]]*${key}[[:space:]]*=" "${env_file}" | sed -E 's/^[^=]+=//; s/^"//; s/"$//'
}

prompt_yes_no() {
  printf 'prompt_yes_no should not be called\n' >> "${LOG_FILE}"
  return 1
}
EOF

mkdir -p "${TEST_ROOT}/current/scripts" "${TEST_ROOT}/shared"
touch "${TEST_ROOT}/current/scripts/seed-example-templates.ts"

cat > "${TEST_ROOT}/shared/.env" <<'EOF'
DATABASE_URL="mysql://root:root@127.0.0.1:3306/mgs_dev"
EOF

cat > "${TEST_ROOT}/npx" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${NPM_LOG_FILE}"
exit 0
EOF
chmod +x "${TEST_ROOT}/npx"

(
  export CURRENT_LINK="${TEST_ROOT}/current"
  export REPO_ROOT="${REPO_ROOT}"
  export SHARED_DIR="${TEST_ROOT}/shared"
  export LOG_FILE="${LOG_FILE}"
  export NPM_LOG_FILE="${NPM_LOG_FILE}"
  export PATH="${TEST_ROOT}:${PATH}"
  source "${FUNCS_FILE}"
  maybe_seed_example_lesson_plan_templates
)

if ! grep -Fq "SECTION: Lesson Plan Templates" "${LOG_FILE}"; then
  echo "Expected lesson-plan template seeding section to run"
  cat "${LOG_FILE}" || true
  exit 1
fi

if ! grep -Fq "Ensuring example lesson-plan templates are installed" "${LOG_FILE}"; then
  echo "Expected automatic seeding message"
  cat "${LOG_FILE}" || true
  exit 1
fi

if ! grep -Fq "tsx scripts/seed-example-templates.ts" "${NPM_LOG_FILE}"; then
  echo "Expected seed command to be invoked automatically"
  cat "${NPM_LOG_FILE}" || true
  exit 1
fi

if grep -Fq "prompt_yes_no should not be called" "${LOG_FILE}"; then
  echo "Unexpected prompt path detected"
  cat "${LOG_FILE}" || true
  exit 1
fi

echo "Lesson-plan template auto-seeding test passed."
