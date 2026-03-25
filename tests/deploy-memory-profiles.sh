#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

assert_equals() {
  local actual="$1"
  local expected="$2"
  local message="$3"

  if [[ "${actual}" != "${expected}" ]]; then
    echo "${message}"
    echo "Expected: ${expected}"
    echo "Actual:   ${actual}"
    exit 1
  fi
}

assert_contains() {
  local actual="$1"
  local expected_substring="$2"
  local message="$3"

  if [[ "${actual}" != *"${expected_substring}"* ]]; then
    echo "${message}"
    echo "Expected substring: ${expected_substring}"
    echo "Actual:             ${actual}"
    exit 1
  fi
}

run_update_heap_probe() {
  bash -lc "
    set -euo pipefail
    NODE_OPTIONS=''
    DEFAULT_BUILD_NODE_HEAP_MB=6144
    LOW_RAM_1GB_AUTO_HEAP_MB=3072
    LOW_RAM_2GB_AUTO_HEAP_MB=3072
    LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
    LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
    LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
    LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
    log_info() { :; }
    detect_total_ram_mb() { echo 1967; }
    $(sed -n '/^ensure_build_node_options()/,/^}/p' "${REPO_ROOT}/deploy/update.sh")
    ensure_build_node_options
    printf '%s' \"\$NODE_OPTIONS\"
  "
}

run_deploy_heap_probe() {
  bash -lc "
    set -euo pipefail
    NODE_OPTIONS=''
    DEFAULT_BUILD_NODE_HEAP_MB=6144
    LOW_RAM_1GB_AUTO_HEAP_MB=3072
    LOW_RAM_2GB_AUTO_HEAP_MB=3072
    LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
    LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
    LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
    LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
    log_info() { :; }
    detect_total_ram_mb() { echo 1967; }
    $(sed -n '/^ensure_build_node_options()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    ensure_build_node_options
    printf '%s' \"\$NODE_OPTIONS\"
  "
}

run_deploy_next_build_probe() {
  bash -lc "
    set -euo pipefail
    unset NODE_OPTIONS
    unset NEXT_LOW_MEMORY_BUILD
    LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
    LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
    LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
    LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
    LOW_RAM_1GB_NEXT_BUILD_HEAP_MB=1024
    LOW_RAM_2GB_NEXT_BUILD_HEAP_MB=3072
    log_info() { :; }
    log_warn() { :; }
    detect_total_ram_mb() { echo 1967; }
    $(sed -n '/^set_node_heap_limit_mb()/,/^}/p;/^prepare_next_build_environment()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    prepare_next_build_environment
    printf '%s|%s' \"\${NEXT_LOW_MEMORY_BUILD:-}\" \"\${NODE_OPTIONS:-}\"
  "
}

run_deploy_swap_probe() {
  bash -lc "
    set -euo pipefail
    TEST_ROOT=\$(mktemp -d)
    trap 'rm -rf \"\$TEST_ROOT\"' EXIT
    TEMP_BUILD_SWAP_AUTO_ENABLED=true
    OSTYPE=linux-gnu
    TEMP_BUILD_SWAP_PATH=\"\$TEST_ROOT/build.swap\"
    TEMP_BUILD_SWAP_MIN_CREATE_MB=128
    LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
    LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
    LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
    LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
    LOW_RAM_1GB_TARGET_TOTAL_SWAP_MB=2048
    LOW_RAM_2GB_TARGET_TOTAL_SWAP_MB=2048
    TEMP_BUILD_SWAP_ACTIVE=false
    TEMP_BUILD_SWAP_CREATED_FILE=false
    log_info() { :; }
    log_warn() { printf '%s\n' \"\$*\"; }
    detect_total_ram_mb() { echo 1967; }
    detect_total_swap_mb() { echo 0; }
    run_sudo_cmd() {
      case \"\$1\" in
        rm)
          rm -f \"\$2\"
          ;;
        chmod|mkswap|swapon|swapoff)
          :
          ;;
        fallocate)
          : > \"\$4\"
          ;;
        *)
          \"\$@\"
          ;;
      esac
    }
    $(sed -n '/^ensure_temporary_build_swap()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    ensure_temporary_build_swap
    printf 'ACTIVE=%s CREATED=%s EXISTS=%s\n' \"\$TEMP_BUILD_SWAP_ACTIVE\" \"\$TEMP_BUILD_SWAP_CREATED_FILE\" \"\$(test -e \"\$TEMP_BUILD_SWAP_PATH\" && echo true || echo false)\"
  "
}

assert_equals "$(run_update_heap_probe)" "--max-old-space-size=3072" "update.sh should apply the 2GB auto heap override"
assert_equals "$(run_deploy_heap_probe)" "--max-old-space-size=3072" "deploy.sh should apply the 2GB auto heap override"
assert_equals "$(run_deploy_next_build_probe)" "1|--max-old-space-size=3072" "deploy.sh should use the higher 2GB Next.js low-memory build heap cap"
swap_probe_output="$(run_deploy_swap_probe)"
assert_contains "${swap_probe_output}" "reach ~2048MB total swap" "deploy.sh should target 2048MB total swap for the 2GB low-memory branch"
assert_contains "${swap_probe_output}" "ACTIVE=true CREATED=true EXISTS=true" "deploy.sh should mark the temporary swap file active for the 2GB low-memory branch"

echo "Deploy memory profile checks passed."
