#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
RUNUSER_LOG="${TEST_ROOT}/runuser.log"
OUTPUT_LOG="${TEST_ROOT}/deploy-output.log"

mkdir -p "${ORIGIN_DIR}" "${FAKEBIN_DIR}"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/deploy.sh "${WORKTREE_DIR}/deploy/"

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json deploy/deploy.sh
  git commit -m "test fixture" >/dev/null
  git branch -M main
  git push -u origin main >/dev/null 2>&1
)

cat > "${FAKEBIN_DIR}/runuser" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${RUNUSER_LOG}"
if [[ "$1" == "-u" ]]; then
  shift 2
fi
if [[ "$1" == "--" ]]; then
  shift
fi
exec "$@"
EOF
chmod +x "${FAKEBIN_DIR}/runuser"

set +e
(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  RUNUSER_LOG="${RUNUSER_LOG}" \
  MGS_SOURCE_GIT_USER="deploy-owner" \
  bash ./deploy/deploy.sh --skip-deps --skip-migrate --skip-cron --branch main --no-spinner --no-color --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1
set -e

if ! grep -Fq "git -C ${WORKTREE_DIR} fetch origin main" "${RUNUSER_LOG}"; then
  echo "Expected self-update fetch to run via runuser"
  cat "${OUTPUT_LOG}"
  cat "${RUNUSER_LOG}"
  exit 1
fi

if ! grep -Fq "git -C ${WORKTREE_DIR} merge --ff-only origin/main" "${RUNUSER_LOG}"; then
  echo "Expected self-update merge to run via runuser"
  cat "${OUTPUT_LOG}"
  cat "${RUNUSER_LOG}"
  exit 1
fi

echo "Deploy self-update git user test passed."
