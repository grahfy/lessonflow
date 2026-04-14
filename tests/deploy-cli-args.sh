#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

assert_missing_value_error() {
  local expected="$1"
  shift
  local output=""
  local status=0

  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e

  if [[ ${status} -eq 0 ]]; then
    echo "Expected command to fail: $*"
    exit 1
  fi

  if [[ "${output}" != *"${expected}"* ]]; then
    echo "Expected output to contain: ${expected}"
    echo "Actual output:"
    echo "${output}"
    exit 1
  fi

  if [[ "${output}" == *"unbound variable"* ]]; then
    echo "Expected friendly parse error, not a raw shell error"
    echo "${output}"
    exit 1
  fi

  if [[ "${output}" == *$'\033'* ]]; then
    echo "Expected --no-color parse errors to avoid ANSI escapes"
    echo "${output}"
    exit 1
  fi
}

assert_missing_value_error "--branch requires a value." ./deploy/update.sh --no-color --branch
assert_missing_value_error "--remote requires a value." ./deploy/update.sh --no-color --remote --skip-pull
assert_missing_value_error "--domain requires a value." ./deploy/deploy.sh --no-color --domain
assert_missing_value_error "--email requires a value." ./deploy/deploy.sh --no-color --email --skip-deps

echo "Deploy CLI argument checks passed."
