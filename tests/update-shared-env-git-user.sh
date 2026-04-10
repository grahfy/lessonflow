#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
DEPLOY_TARGET_DIR="${TEST_ROOT}/deploy-target"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
RUNUSER_LOG="${TEST_ROOT}/runuser.log"
OUTPUT_LOG="${TEST_ROOT}/update-output.log"

mkdir -p "${ORIGIN_DIR}" "${FAKEBIN_DIR}" "${DEPLOY_TARGET_DIR}/shared"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/update.sh deploy/deploy.sh "${WORKTREE_DIR}/deploy/"

cat > "${DEPLOY_TARGET_DIR}/shared/.env" <<'EOF'
UPDATES_DEPLOY_USER="deploy-owner"
EOF

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json deploy/update.sh deploy/deploy.sh
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

(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  RUNUSER_LOG="${RUNUSER_LOG}" \
  DEPLOY_DIR="${DEPLOY_TARGET_DIR}" \
  bash ./deploy/update.sh --skip-deploy --branch main --no-spinner --no-color --allow-dirty --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1

if [[ -s "${RUNUSER_LOG}" ]]; then
  echo "Expected non-root update.sh to ignore UPDATES_DEPLOY_USER from shared env"
  cat "${OUTPUT_LOG}"
  cat "${RUNUSER_LOG}"
  exit 1
fi

if grep -Fq "Git update actions will run as deploy-owner" "${OUTPUT_LOG}"; then
  echo "Expected non-root update.sh to avoid cross-user git update logging"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if ! grep -Fq "Updated to commit" "${OUTPUT_LOG}"; then
  echo "Expected update.sh to continue updating successfully as the current user"
  cat "${OUTPUT_LOG}"
  exit 1
fi

echo "Update shared-env non-root behavior test passed."
