#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
DEPLOY_TARGET_DIR="${TEST_ROOT}/deploy-target"
SUDOERS_DIR="${TEST_ROOT}/sudoers.d"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
FAKE_USERS_FILE="${TEST_ROOT}/fake-users.txt"
USERADD_LOG="${TEST_ROOT}/useradd.log"
OUTPUT_LOG="${TEST_ROOT}/bootstrap-output.log"

mkdir -p "${ORIGIN_DIR}" "${DEPLOY_TARGET_DIR}/shared" "${SUDOERS_DIR}" "${FAKEBIN_DIR}"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template "${WORKTREE_DIR}/deploy/"
cat > "${WORKTREE_DIR}/.env.example" <<'EOF'
UPDATES_GIT_REPO_PATH=""
UPDATES_DEPLOY_USER=""
EOF
cat > "${DEPLOY_TARGET_DIR}/shared/.env" <<'EOF'
UPDATES_DEPLOY_USER="deploy"
UPDATES_GIT_REPO_PATH="/opt/lessonflow"
EOF

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template .env.example
  git commit -m "test fixture" >/dev/null
  git branch -M main
  git push -u origin main >/dev/null 2>&1
)

cat > "${FAKEBIN_DIR}/sudo" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "-u" ]]; then
  shift 2
fi
exec "$@"
EOF

cat > "${FAKEBIN_DIR}/runuser" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "-u" ]]; then
  shift 2
fi
if [[ "${1:-}" == "--" ]]; then
  shift
fi
exec "$@"
EOF

cat > "${FAKEBIN_DIR}/getent" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "passwd" && -n "${2:-}" ]]; then
  if grep -Fxq "${2}" "${FAKE_USERS_FILE}"; then
    printf '%s:x:2001:2001::/home/%s:/bin/bash\n' "${2}" "${2}"
    exit 0
  fi
fi
exec /usr/bin/getent "$@"
EOF

cat > "${FAKEBIN_DIR}/useradd" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${USERADD_LOG}"
printf '%s\n' "${*: -1}" >> "${FAKE_USERS_FILE}"
exit 0
EOF

cat > "${FAKEBIN_DIR}/visudo" <<'EOF'
#!/bin/bash
exit 0
EOF

cat > "${FAKEBIN_DIR}/chown" <<'EOF'
#!/bin/bash
exit 0
EOF

chmod +x "${FAKEBIN_DIR}/"*

(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  FAKE_USERS_FILE="${FAKE_USERS_FILE}" \
  USERADD_LOG="${USERADD_LOG}" \
  APP_NAME="lessonflow" \
  RUNTIME_USER="www-data" \
  DEPLOY_DIR="${DEPLOY_TARGET_DIR}" \
  SHARED_DIR="${DEPLOY_TARGET_DIR}/shared" \
  REPO_ROOT="${WORKTREE_DIR}" \
  ENV_TEMPLATE_PATH="${WORKTREE_DIR}/.env.example" \
  SOURCE_MODE="git" \
  DEPLOY_SUDOERS_TEMPLATE="${WORKTREE_DIR}/deploy/sudoers.template" \
  WEB_UPDATE_SUDOERS_TEMPLATE="${WORKTREE_DIR}/deploy/web-update-trigger.sudoers.template" \
  LESSONFLOW_SUDOERS_DIR="${SUDOERS_DIR}" \
  bash ./deploy/bootstrap-host.sh
) >"${OUTPUT_LOG}" 2>&1

if ! grep -Fq 'UPDATES_DEPLOY_USER="deploy"' "${DEPLOY_TARGET_DIR}/shared/.env"; then
  echo "Expected shared env to keep or seed deploy user"
  cat "${OUTPUT_LOG}"
  cat "${DEPLOY_TARGET_DIR}/shared/.env"
  exit 1
fi

if ! grep -Fq "UPDATES_GIT_REPO_PATH=\"${WORKTREE_DIR}\"" "${DEPLOY_TARGET_DIR}/shared/.env"; then
  echo "Expected bootstrap to rewrite the shared env repo path to the current checkout"
  cat "${OUTPUT_LOG}"
  cat "${DEPLOY_TARGET_DIR}/shared/.env"
  exit 1
fi

if ! grep -Fq "deploy" "${FAKE_USERS_FILE}"; then
  echo "Expected bootstrap to create missing deploy user"
  cat "${OUTPUT_LOG}"
  cat "${USERADD_LOG}"
  exit 1
fi

if ! grep -Fq "deploy" "${SUDOERS_DIR}/lessonflow"; then
  echo "Expected deploy sudoers file to be rendered"
  cat "${OUTPUT_LOG}"
  cat "${SUDOERS_DIR}/lessonflow"
  exit 1
fi

if ! grep -Fq "www-data" "${SUDOERS_DIR}/lessonflow-web-update"; then
  echo "Expected web-update sudoers file to be rendered"
  cat "${OUTPUT_LOG}"
  cat "${SUDOERS_DIR}/lessonflow-web-update"
  exit 1
fi

echo "Bootstrap host repair test passed."
