#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ARCHIVE_SOURCE="${TEST_ROOT}/archive-source"
mkdir -p "${ARCHIVE_SOURCE}"
tar --exclude='.git' -cf - . | (cd "${ARCHIVE_SOURCE}" && tar -xf -)

DEPLOY_DIR="${TEST_ROOT}/deploy-root"
mkdir -p "${DEPLOY_DIR}"

assert_contains() {
  local haystack="$1"
  local needle="$2"

  if [[ "${haystack}" != *"${needle}"* ]]; then
    echo "Expected output to contain: ${needle}"
    echo "Actual output:"
    echo "${haystack}"
    exit 1
  fi
}

output="$(
  cd "${ARCHIVE_SOURCE}"
  DEPLOY_DIR="${DEPLOY_DIR}" bash ./deploy/update.sh --skip-pull --skip-deploy --no-auto-bootstrap --no-color
)"

assert_contains "${output}" "Source mode: archive/copy"
assert_contains "${output}" "Archive source mode detected. Git pull/update actions are unavailable."
assert_contains "${output}" "Skipping deployment"
assert_contains "${output}" "Update workflow finished"

echo "Archive update mode check passed."
