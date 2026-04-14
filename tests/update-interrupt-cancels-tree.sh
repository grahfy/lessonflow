#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

WORKTREE_DIR="${TEST_ROOT}/worktree"
DEPLOY_DIR="${TEST_ROOT}/deploy-root"
LOG_FILE="${TEST_ROOT}/update.log"
UPDATE_TARGET_PID_FILE="${TEST_ROOT}/update-target.pid"
DEPLOY_PID_FILE="${TEST_ROOT}/deploy.pid"
DEPLOY_SLEEP_PID_FILE="${TEST_ROOT}/deploy-sleep.pid"

mkdir -p "${WORKTREE_DIR}/deploy" "${DEPLOY_DIR}"
cp package.json package-lock.json .env.example "${WORKTREE_DIR}/"
cp deploy/update.sh "${WORKTREE_DIR}/deploy/"

cat > "${WORKTREE_DIR}/deploy/deploy.sh" <<'EOF'
#!/bin/bash
set -euo pipefail

printf '%s\n' "$$" > "${DEPLOY_PID_FILE}"
sleep 300 &
child_pid=$!
printf '%s\n' "${child_pid}" > "${DEPLOY_SLEEP_PID_FILE}"
wait "${child_pid}"
EOF
chmod +x "${WORKTREE_DIR}/deploy/deploy.sh"

if ! grep -q '^NEXT_PUBLIC_SITE_URL=' "${WORKTREE_DIR}/.env.example"; then
  echo 'NEXT_PUBLIC_SITE_URL="https://example.test"' >> "${WORKTREE_DIR}/.env.example"
fi

python3 - "${WORKTREE_DIR}" "${DEPLOY_DIR}" "${LOG_FILE}" "${UPDATE_TARGET_PID_FILE}" "${DEPLOY_PID_FILE}" "${DEPLOY_SLEEP_PID_FILE}" <<'PY' &
import os
import subprocess
import sys

worktree_dir, deploy_dir, log_path, update_target_pid_file, deploy_pid_file, deploy_sleep_pid_file = sys.argv[1:]
env = os.environ.copy()
env.update(
    {
        "DEPLOY_DIR": deploy_dir,
        "DEPLOY_PID_FILE": deploy_pid_file,
        "DEPLOY_SLEEP_PID_FILE": deploy_sleep_pid_file,
    }
)

log_handle = open(log_path, "ab", buffering=0)
proc = subprocess.Popen(
    ["bash", "./deploy/update.sh", "--skip-pull", "--no-auto-bootstrap", "--no-spinner", "--no-color"],
    cwd=worktree_dir,
    env=env,
    stdout=log_handle,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)

with open(update_target_pid_file, "w", encoding="utf-8") as handle:
    handle.write(str(proc.pid))

sys.exit(proc.wait())
PY
launcher_pid=$!

for _ in {1..200}; do
  [[ -f "${UPDATE_TARGET_PID_FILE}" && -f "${DEPLOY_SLEEP_PID_FILE}" ]] && break
  sleep 0.05
done

if [[ ! -f "${UPDATE_TARGET_PID_FILE}" || ! -f "${DEPLOY_SLEEP_PID_FILE}" ]]; then
  echo "Timed out waiting for fake deploy to start"
  cat "${LOG_FILE}" || true
  kill "${launcher_pid}" 2>/dev/null || true
  exit 1
fi

update_pid="$(cat "${UPDATE_TARGET_PID_FILE}")"
pkill -TERM -g "${update_pid}"

set +e
wait "${launcher_pid}"
status=$?
set -e

if [[ "${status}" -ne 130 ]]; then
  echo "Expected update.sh to exit 130 after interrupt, got ${status}"
  cat "${LOG_FILE}" || true
  exit 1
fi

sleep_pid="$(cat "${DEPLOY_SLEEP_PID_FILE}")"
if kill -0 "${sleep_pid}" 2>/dev/null; then
  echo "Expected descendant sleep process to be terminated"
  cat "${LOG_FILE}" || true
  exit 1
fi

if ! grep -Fq "Received TERM; stopping update workflow and terminating child processes" "${LOG_FILE}"; then
  echo "Expected interrupt log message from update.sh"
  cat "${LOG_FILE}" || true
  exit 1
fi

echo "Update interrupt cancellation test passed."
