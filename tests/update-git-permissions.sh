#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'chmod u+w "${WORKTREE_DIR}/package.json" 2>/dev/null || true; rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
OUTPUT_FILE="${TEST_ROOT}/update-output.log"

mkdir -p "${ORIGIN_DIR}"
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

chmod u-w "${WORKTREE_DIR}/package.json"

set +e
(
  cd "${WORKTREE_DIR}"
  bash ./deploy/update.sh --skip-deploy --branch main --no-spinner --no-color --no-auto-bootstrap
) >"${OUTPUT_FILE}" 2>&1
STATUS=$?
set -e

if [[ ${STATUS} -eq 0 ]]; then
  echo "Expected update.sh to fail when tracked files are not writable"
  cat "${OUTPUT_FILE}"
  exit 1
fi

if ! grep -Fq "Git source checkout contains tracked files that are not writable" "${OUTPUT_FILE}"; then
  echo "Expected ownership error message in output"
  cat "${OUTPUT_FILE}"
  exit 1
fi

if ! grep -Fq "First unwritable path:" "${OUTPUT_FILE}"; then
  echo "Expected first unwritable path to be reported"
  cat "${OUTPUT_FILE}"
  exit 1
fi

echo "Git update permission preflight test passed."
