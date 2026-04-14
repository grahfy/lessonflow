#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

WORKTREE_DIR="${TEST_ROOT}/worktree"
DEPLOY_DIR="${TEST_ROOT}/deploy-root"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
LOG_FILE="${TEST_ROOT}/deploy.log"
BUILD_STARTED_FILE="${TEST_ROOT}/build-started"
BUILD_CHILD_PID_FILE="${TEST_ROOT}/build-child.pid"
DEPLOY_TARGET_PID_FILE="${TEST_ROOT}/deploy-target.pid"

mkdir -p "${WORKTREE_DIR}/deploy" "${WORKTREE_DIR}/public" "${DEPLOY_DIR}" "${FAKEBIN_DIR}"
cp package.json package-lock.json .env.example "${WORKTREE_DIR}/"
cp -R public/. "${WORKTREE_DIR}/public/" 2>/dev/null || true
cp deploy/deploy.sh deploy/lessonflow.service deploy/nginx-http.conf "${WORKTREE_DIR}/deploy/"

if ! grep -q '^NEXT_PUBLIC_SITE_URL=' "${WORKTREE_DIR}/.env.example"; then
  echo 'NEXT_PUBLIC_SITE_URL="https://example.test"' >> "${WORKTREE_DIR}/.env.example"
fi

cat > "${FAKEBIN_DIR}/npm" <<'EOF'
#!/bin/bash
set -euo pipefail

case "${1:-}" in
  ci)
    exit 0
    ;;
  exec)
    exit 0
    ;;
  run)
    if [[ "${2:-}" == "build" ]]; then
      printf '%s\n' "started" > "${BUILD_STARTED_FILE}"
      sleep 300 &
      child_pid=$!
      printf '%s\n' "${child_pid}" > "${BUILD_CHILD_PID_FILE}"
      wait "${child_pid}"
      exit 0
    fi
    ;;
esac

exit 0
EOF

cat > "${FAKEBIN_DIR}/systemctl" <<'EOF'
#!/bin/bash
exit 0
EOF

cat > "${FAKEBIN_DIR}/systemd-analyze" <<'EOF'
#!/bin/bash
exit 0
EOF

chmod +x "${FAKEBIN_DIR}/npm" "${FAKEBIN_DIR}/systemctl" "${FAKEBIN_DIR}/systemd-analyze"

python3 - "${WORKTREE_DIR}" "${DEPLOY_DIR}" "${FAKEBIN_DIR}" "${LOG_FILE}" "${DEPLOY_TARGET_PID_FILE}" "${BUILD_STARTED_FILE}" "${BUILD_CHILD_PID_FILE}" <<'PY' &
import os
import subprocess
import sys

worktree_dir, deploy_dir, fakebin_dir, log_path, deploy_target_pid_file, build_started_file, build_child_pid_file = sys.argv[1:]
env = os.environ.copy()
env.update(
    {
        "PATH": f"{fakebin_dir}:{env['PATH']}",
        "DEPLOY_DIR": deploy_dir,
        "TEMP_BUILD_SWAP_AUTO_ENABLED": "false",
        "LESSONFLOW_TEST_ASSUME_ROOT": "1",
        "BUILD_STARTED_FILE": build_started_file,
        "BUILD_CHILD_PID_FILE": build_child_pid_file,
    }
)

log_handle = open(log_path, "ab", buffering=0)
proc = subprocess.Popen(
    ["bash", "./deploy/deploy.sh", "--skip-deps", "--skip-migrate", "--skip-cron", "--no-auto-bootstrap", "--no-spinner", "--no-color"],
    cwd=worktree_dir,
    env=env,
    stdout=log_handle,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)

with open(deploy_target_pid_file, "w", encoding="utf-8") as handle:
    handle.write(str(proc.pid))

sys.exit(proc.wait())
PY
launcher_pid=$!

for _ in {1..200}; do
  [[ -f "${DEPLOY_TARGET_PID_FILE}" && -f "${BUILD_STARTED_FILE}" ]] && break
  sleep 0.05
done

if [[ ! -f "${DEPLOY_TARGET_PID_FILE}" || ! -f "${BUILD_STARTED_FILE}" ]]; then
  echo "Timed out waiting for build to start"
  cat "${LOG_FILE}" || true
  kill "${launcher_pid}" 2>/dev/null || true
  exit 1
fi

deploy_pid="$(cat "${DEPLOY_TARGET_PID_FILE}")"
pkill -TERM -g "${deploy_pid}"

set +e
wait "${launcher_pid}"
status=$?
set -e

if [[ "${status}" -ne 130 ]]; then
  echo "Expected deploy.sh to exit 130 after interrupt, got ${status}"
  cat "${LOG_FILE}" || true
  exit 1
fi

if [[ -f "${BUILD_CHILD_PID_FILE}" ]]; then
  child_pid="$(cat "${BUILD_CHILD_PID_FILE}")"
  if kill -0 "${child_pid}" 2>/dev/null; then
    echo "Expected build child process to be terminated"
    cat "${LOG_FILE}" || true
    exit 1
  fi
fi

if find "${DEPLOY_DIR}/releases" -mindepth 1 -maxdepth 1 -type d | read -r _; then
  echo "Expected incomplete release directory to be cleaned up"
  find "${DEPLOY_DIR}/releases" -mindepth 1 -maxdepth 1 -type d -print || true
  cat "${LOG_FILE}" || true
  exit 1
fi

if ! grep -Fq "Received TERM; stopping deploy and terminating child processes" "${LOG_FILE}"; then
  echo "Expected interrupt log message from deploy.sh"
  cat "${LOG_FILE}" || true
  exit 1
fi

echo "Deploy interrupt cancellation test passed."
