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
SUDOERS_DIR="${TEST_ROOT}/sudoers.d"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
SYSTEMCTL_LOG="${TEST_ROOT}/systemctl.log"
OUTPUT_LOG="${TEST_ROOT}/update-output.log"

mkdir -p "${ORIGIN_DIR}" "${DEPLOY_TARGET_DIR}/shared" "${SYSTEMD_DIR}" "${SUDOERS_DIR}" "${FAKEBIN_DIR}"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/update.sh deploy/deploy.sh deploy/app.service.template deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template "${WORKTREE_DIR}/deploy/"
cat > "${DEPLOY_TARGET_DIR}/shared/.env" <<EOF
UPDATES_GIT_REPO_PATH="${WORKTREE_DIR}"
UPDATES_DEPLOY_USER="deploy-owner"
EOF
cat > "${SYSTEMD_DIR}/lessonflow.service" <<'EOF'
[Unit]
Description=LessonFlow
[Service]
ReadWritePaths=/var/www/lessonflow /opt/melbourne-guitar-school
EOF

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json deploy/update.sh deploy/deploy.sh deploy/app.service.template deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template
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
if [[ "${1:-}" == "list-unit-files" && "${2:-}" == "--type=service" ]]; then
  printf 'lessonflow.service enabled\n'
  exit 0
fi
if [[ "${1:-}" == "list-unit-files" && "${2:-}" == "--type=timer" ]]; then
  printf 'lessonflow-daily-bookings.timer enabled\n'
  exit 0
fi
exit 0
EOF
cat > "${FAKEBIN_DIR}/nginx" <<'EOF'
#!/bin/bash
exit 0
EOF
cat > "${FAKEBIN_DIR}/crontab" <<'EOF'
#!/bin/bash
exit 0
EOF
cat > "${FAKEBIN_DIR}/systemd-analyze" <<'EOF'
#!/bin/bash
exit 0
EOF
cat > "${FAKEBIN_DIR}/getent" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "passwd" && "${2:-}" == "deploy-owner" ]]; then
  printf 'deploy-owner:x:2001:2001::/home/deploy-owner:/bin/bash\n'
  exit 0
fi
exec /usr/bin/getent "$@"
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
cat > "${FAKEBIN_DIR}/chown" <<'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "${FAKEBIN_DIR}/sudo" "${FAKEBIN_DIR}/cp" "${FAKEBIN_DIR}/systemctl" "${FAKEBIN_DIR}/systemd-analyze" "${FAKEBIN_DIR}/getent" "${FAKEBIN_DIR}/runuser" "${FAKEBIN_DIR}/nginx" "${FAKEBIN_DIR}/crontab" "${FAKEBIN_DIR}/chown"

set +e
(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  SYSTEMD_DIR="${SYSTEMD_DIR}" \
  SYSTEMCTL_LOG="${SYSTEMCTL_LOG}" \
  LESSONFLOW_SYSTEMD_DIR="${SYSTEMD_DIR}" \
  LESSONFLOW_SUDOERS_DIR="${SUDOERS_DIR}" \
  DEPLOY_DIR="${DEPLOY_TARGET_DIR}" \
  bash ./deploy/update.sh --skip-pull --skip-deploy --sudo-deploy --no-spinner --no-color --allow-dirty
) >"${OUTPUT_LOG}" 2>&1
set -e

if ! grep -Fq "ReadWritePaths=/var/www/lessonflow ${WORKTREE_DIR}" "${SYSTEMD_DIR}/lessonflow.service"; then
  echo "Expected stale systemd unit to be rewritten with the current repo path"
  cat "${OUTPUT_LOG}"
  cat "${SYSTEMD_DIR}/lessonflow.service"
  exit 1
fi

echo "Update app service stale path repair test passed."
