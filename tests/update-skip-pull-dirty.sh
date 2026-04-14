#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

WORKTREE_DIR="${TEST_ROOT}/repo"
mkdir -p "${WORKTREE_DIR}/deploy"

cp package.json package-lock.json "${WORKTREE_DIR}/"
cp deploy/update.sh deploy/deploy.sh "${WORKTREE_DIR}/deploy/"
chmod +x "${WORKTREE_DIR}/deploy/update.sh" "${WORKTREE_DIR}/deploy/deploy.sh"

(
  cd "${WORKTREE_DIR}"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
  git add package.json package-lock.json deploy/update.sh deploy/deploy.sh
  git commit -q -m "Initial test source"

  printf '\n' >> package.json

  output="$(bash ./deploy/update.sh --skip-pull --skip-deploy --no-spinner --no-color --no-auto-bootstrap 2>&1)"

  if [[ "${output}" == *"Working tree is dirty. Commit/stash changes"* ]]; then
    echo "Expected --skip-pull --skip-deploy to allow a dirty worktree."
    echo "${output}"
    exit 1
  fi

  if [[ "${output}" != *"Update workflow finished"* ]]; then
    echo "Expected update wrapper to complete."
    echo "${output}"
    exit 1
  fi
)

echo "Update skip-pull dirty worktree check passed."
