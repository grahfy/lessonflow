#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
DEPLOY_TARGET_DIR="${TEST_ROOT}/deploy-target"
SYSTEMD_DIR="${TEST_ROOT}/systemd"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
SYSTEMCTL_LOG="${TEST_ROOT}/systemctl.log"
VERIFY_LOG="${TEST_ROOT}/verify.log"
OUTPUT_LOG="${TEST_ROOT}/update-output.log"

mkdir -p "${ORIGIN_DIR}" "${DEPLOY_TARGET_DIR}/shared" "${SYSTEMD_DIR}" "${FAKEBIN_DIR}"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/update.sh deploy/deploy.sh deploy/app.service.template "${WORKTREE_DIR}/deploy/"
cat > "${DEPLOY_TARGET_DIR}/shared/.env" <<EOF
UPDATES_GIT_REPO_PATH="${WORKTREE_DIR}"
EOF

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json deploy/update.sh deploy/deploy.sh deploy/app.service.template
  git commit -m "test fixture" >/dev/null
  git branch -M main
  git push -u origin main >/dev/null 2>&1
)

cat > "${FAKEBIN_DIR}/sudo" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "-v" || "${1:-}" == "-n" && "${2:-}" == "true" ]]; then
  exit 0
fi
if [[ "${1:-}" == "-n" ]]; then
  shift
fi
exec "$@"
EOF
cat > "${FAKEBIN_DIR}/cp" <<'EOF'
#!/bin/bash
set -euo pipefail
args=("$@")
last_index=$((${#args[@]} - 1))
target="${args[$last_index]}"
if [[ "${target}" == /etc/systemd/system/* ]]; then
  args[$last_index]="${SYSTEMD_DIR}/$(basename "${target}")"
fi
exec /usr/bin/cp "${args[@]}"
EOF
cat > "${FAKEBIN_DIR}/systemctl" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${SYSTEMCTL_LOG}"
exit 0
EOF
cat > "${FAKEBIN_DIR}/systemd-analyze" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${VERIFY_LOG}"
exit 0
EOF
chmod +x "${FAKEBIN_DIR}/sudo" "${FAKEBIN_DIR}/cp" "${FAKEBIN_DIR}/systemctl" "${FAKEBIN_DIR}/systemd-analyze"

(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  SYSTEMD_DIR="${SYSTEMD_DIR}" \
  SYSTEMCTL_LOG="${SYSTEMCTL_LOG}" \
  VERIFY_LOG="${VERIFY_LOG}" \
  DEPLOY_DIR="${DEPLOY_TARGET_DIR}" \
  bash ./deploy/update.sh --skip-pull --skip-deploy --install-app-service --sudo-deploy --no-spinner --no-color --allow-dirty --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1

if ! grep -Fq "verify" "${VERIFY_LOG}"; then
  echo "Expected systemd-analyze verify to run"
  cat "${OUTPUT_LOG}"
  cat "${VERIFY_LOG}"
  exit 1
fi

if ! grep -Fq "daemon-reload" "${SYSTEMCTL_LOG}"; then
  echo "Expected systemctl daemon-reload to run"
  cat "${OUTPUT_LOG}"
  cat "${SYSTEMCTL_LOG}"
  exit 1
fi

if ! grep -Fq "enable lessonflow" "${SYSTEMCTL_LOG}"; then
  echo "Expected systemctl enable lessonflow to run"
  cat "${OUTPUT_LOG}"
  cat "${SYSTEMCTL_LOG}"
  exit 1
fi

if ! grep -Fq "ReadWritePaths=/var/www/lessonflow ${WORKTREE_DIR}" "${SYSTEMD_DIR}/lessonflow.service"; then
  echo "Expected rendered service to include the git repo path in ReadWritePaths"
  cat "${OUTPUT_LOG}"
  cat "${SYSTEMD_DIR}/lessonflow.service"
  exit 1
fi

echo "Update app service install test passed."
