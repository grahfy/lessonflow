#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
OUTPUT_LOG="${TEST_ROOT}/update-output.log"

mkdir -p "${ORIGIN_DIR}"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/update.sh deploy/deploy.sh deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template deploy/app.service.template "${WORKTREE_DIR}/deploy/"

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json deploy/update.sh deploy/deploy.sh deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template deploy/app.service.template
  git commit -m "test fixture" >/dev/null
  git branch -M main
  git push -u origin main >/dev/null 2>&1
)

set +e
(
  cd "${WORKTREE_DIR}"
  MGS_SOURCE_GIT_USER="bad user" \
  bash ./deploy/update.sh --skip-deploy --branch main --no-spinner --no-color --allow-dirty --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1
STATUS=$?
set -e

if [[ ${STATUS} -eq 0 ]]; then
  echo "Expected update.sh to fail for an invalid deploy user"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if ! grep -Fq "Configured deploy user 'bad user' does not exist or is invalid." "${OUTPUT_LOG}"; then
  echo "Expected explicit invalid deploy user error"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if grep -Fq "Working tree is dirty" "${OUTPUT_LOG}"; then
  echo "Expected invalid deploy user error instead of dirty worktree message"
  cat "${OUTPUT_LOG}"
  exit 1
fi

echo "Invalid deploy user update error test passed."
