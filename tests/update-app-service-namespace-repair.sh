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
RESTART_COUNT_FILE="${TEST_ROOT}/restart-count.txt"
OUTPUT_LOG="${TEST_ROOT}/update-output.log"

mkdir -p "${ORIGIN_DIR}" "${DEPLOY_TARGET_DIR}/shared" "${SYSTEMD_DIR}/lessonflow.service.d" "${FAKEBIN_DIR}"
mkdir -p "${DEPLOY_TARGET_DIR}/current"
printf '1\n' > "${RESTART_COUNT_FILE}"
printf '[Service]\nPrivateUsers=true\n' > "${SYSTEMD_DIR}/lessonflow.service.d/override.conf"

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
if [[ "${1:-}" == "status" && "${2:-}" == "lessonflow" ]]; then
  cat <<'OUT'
● lessonflow.service - Test
     Active: activating (auto-restart) (Result: exit-code)
    Process: 123 ExecStart=/usr/bin/node /var/www/lessonflow/current/.next/standalone/server.js (code=exited, status=226/NAMESPACE)
OUT
  exit 3
fi
if [[ "${1:-}" == "restart" && "${2:-}" == "lessonflow" ]]; then
  count="$(cat "${RESTART_COUNT_FILE}")"
  if [[ "${count}" == "1" ]]; then
    printf '2\n' > "${RESTART_COUNT_FILE}"
    exit 1
  fi
  exit 0
fi
exit 0
EOF
cat > "${FAKEBIN_DIR}/journalctl" <<'EOF'
#!/bin/bash
printf 'fake journal output\n'
EOF
cat > "${FAKEBIN_DIR}/systemd-analyze" <<'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "${FAKEBIN_DIR}/sudo" "${FAKEBIN_DIR}/cp" "${FAKEBIN_DIR}/systemctl" "${FAKEBIN_DIR}/journalctl" "${FAKEBIN_DIR}/systemd-analyze"

(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  SYSTEMD_DIR="${SYSTEMD_DIR}" \
  SYSTEMCTL_LOG="${SYSTEMCTL_LOG}" \
  RESTART_COUNT_FILE="${RESTART_COUNT_FILE}" \
  LESSONFLOW_SYSTEMD_DIR="${SYSTEMD_DIR}" \
  DEPLOY_DIR="${DEPLOY_TARGET_DIR}" \
  bash ./deploy/update.sh --skip-pull --skip-deploy --install-app-service --sudo-deploy --no-spinner --no-color --allow-dirty --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1

if [[ -f "${SYSTEMD_DIR}/lessonflow.service.d/override.conf" ]]; then
  echo "Expected override.conf to be disabled after namespace failure"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if [[ ! -f "${SYSTEMD_DIR}/lessonflow.service.d/override.conf.disabled" ]]; then
  echo "Expected override.conf.disabled to be created"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if ! grep -Fq "Detected lessonflow.service namespace failure with override.conf; disabling" "${OUTPUT_LOG}"; then
  echo "Expected namespace auto-repair warning"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if ! grep -Fq "lessonflow.service recovered after disabling override.conf" "${OUTPUT_LOG}"; then
  echo "Expected service recovery message"
  cat "${OUTPUT_LOG}"
  exit 1
fi

echo "Update app service namespace repair test passed."
