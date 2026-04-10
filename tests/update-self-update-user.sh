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
OUTPUT_LOG="${TEST_ROOT}/update-output.log"

mkdir -p "${ORIGIN_DIR}" "${FAKEBIN_DIR}"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/update.sh deploy/deploy.sh "${WORKTREE_DIR}/deploy/"

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
cat > "${FAKEBIN_DIR}/getent" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "passwd" && "${2:-}" == "deploy-owner" ]]; then
  printf 'deploy-owner:x:2001:2001::/home/deploy-owner:/bin/bash\n'
  exit 0
fi
exec /usr/bin/getent "$@"
EOF
chmod +x "${FAKEBIN_DIR}/runuser"
chmod +x "${FAKEBIN_DIR}/getent"

(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  RUNUSER_LOG="${RUNUSER_LOG}" \
  MGS_SOURCE_GIT_USER="deploy-owner" \
  bash ./deploy/update.sh --skip-deploy --branch main --no-spinner --no-color --allow-dirty --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1

if ! grep -Fq "git -C ${WORKTREE_DIR} fetch origin +refs/heads/main:refs/remotes/origin/main" "${RUNUSER_LOG}"; then
  echo "Expected update fetch to run via runuser"
  cat "${OUTPUT_LOG}"
  cat "${RUNUSER_LOG}"
  exit 1
fi

if ! grep -Fq "git -C ${WORKTREE_DIR} merge --ff-only origin/main" "${RUNUSER_LOG}"; then
  echo "Expected update merge to run via runuser"
  cat "${OUTPUT_LOG}"
  cat "${RUNUSER_LOG}"
  exit 1
fi

echo "Update self-update git user test passed."
