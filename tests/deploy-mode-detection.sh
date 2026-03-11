#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

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

run_mode_probe() {
  local deploy_dir="$1"
  DEPLOY_DIR="${deploy_dir}" bash ./deploy/deploy.sh --print-deploy-mode
}

run_mode_probe_in_dir() {
  local source_dir="$1"
  local deploy_dir="$2"
  (
    cd "${source_dir}"
    DEPLOY_DIR="${deploy_dir}" bash ./deploy/deploy.sh --print-deploy-mode
  )
}

release_dir="${TEST_ROOT}/release-layout"
mkdir -p "${release_dir}/releases/20260312010101"
ln -sfn "${release_dir}/releases/20260312010101" "${release_dir}/current"
release_output="$(run_mode_probe "${release_dir}")"
assert_contains "${release_output}" "Source mode: git checkout"
assert_contains "${release_output}" "Deploy mode: release-directory"
assert_contains "${release_output}" "Runtime path: ${release_dir}/releases/20260312010101"

legacy_dir="${TEST_ROOT}/legacy-layout"
mkdir -p "${legacy_dir}/current"
touch "${legacy_dir}/current/package.json"
legacy_output="$(run_mode_probe "${legacy_dir}")"
assert_contains "${legacy_output}" "Deploy mode: legacy in-place"
assert_contains "${legacy_output}" "Warning: This deploy will bootstrap ${legacy_dir}/releases"

mixed_dir="${TEST_ROOT}/mixed-layout"
mkdir -p "${mixed_dir}/current" "${mixed_dir}/releases/20260312020202"
touch "${mixed_dir}/current/package.json"
mixed_output="$(run_mode_probe "${mixed_dir}")"
assert_contains "${mixed_output}" "Deploy mode: legacy/in-place mixed with releases"
assert_contains "${mixed_output}" "Warning: Release directories exist, but the live runtime is still legacy/in-place."

bootstrap_dir="${TEST_ROOT}/bootstrap-layout"
bootstrap_output="$(run_mode_probe "${bootstrap_dir}")"
assert_contains "${bootstrap_output}" "Deploy mode: release-directory (bootstrap)"
assert_contains "${bootstrap_output}" "Detail: Fresh bootstrap; deploy.sh will create timestamped releases"

archive_source="${TEST_ROOT}/archive-source"
mkdir -p "${archive_source}"
tar --exclude='.git' -cf - . | (cd "${archive_source}" && tar -xf -)
archive_deploy_dir="${TEST_ROOT}/archive-deploy"
archive_output="$(run_mode_probe_in_dir "${archive_source}" "${archive_deploy_dir}")"
assert_contains "${archive_output}" "Source mode: archive/copy"
assert_contains "${archive_output}" "Source path: ${archive_source}"
assert_contains "${archive_output}" "Deploy mode: release-directory (bootstrap)"

echo "Deploy mode detection checks passed."
