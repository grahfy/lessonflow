#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

FUNCS_FILE="${TEST_ROOT}/release-functions.sh"
RELEASES_DIR="${TEST_ROOT}/releases"
mkdir -p "${RELEASES_DIR}/20260401010101" "${RELEASES_DIR}/20260402020202"
touch "${RELEASES_DIR}/not-a-release-file"
touch -t 202604010101 "${RELEASES_DIR}/20260401010101"
touch -t 202604020202 "${RELEASES_DIR}/20260402020202"
touch -t 202604030303 "${RELEASES_DIR}/not-a-release-file"

sed -n '/^list_release_names_newest_first()/,/^}/p;/^latest_release_path()/,/^}/p' deploy/deploy.sh > "${FUNCS_FILE}"

output="$(
  RELEASES_DIR="${RELEASES_DIR}" FUNCS_FILE="${FUNCS_FILE}" bash -lc '
    set -euo pipefail
    source "${FUNCS_FILE}"
    latest_release_path
    list_release_names_newest_first | tr "\n" " "
  '
)"

expected="${RELEASES_DIR}/20260402020202
20260402020202 20260401010101 "

if [[ "${output}" != "${expected}" ]]; then
  echo "Unexpected release ordering."
  echo "Expected:"
  printf '%s\n' "${expected}"
  echo "Actual:"
  printf '%s\n' "${output}"
  exit 1
fi

echo "Deploy release listing check passed."
