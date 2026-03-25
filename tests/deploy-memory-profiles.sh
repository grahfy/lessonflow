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
    detect_total_ram_mb() { echo 2048; }
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
    detect_total_ram_mb() { echo 2048; }
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
    LOW_RAM_2GB_NEXT_BUILD_HEAP_MB=2048
    log_info() { :; }
    log_warn() { :; }
    detect_total_ram_mb() { echo 2048; }
    $(sed -n '/^set_node_heap_limit_mb()/,/^}/p;/^prepare_next_build_environment()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    prepare_next_build_environment
    printf '%s|%s' \"\${NEXT_LOW_MEMORY_BUILD:-}\" \"\${NODE_OPTIONS:-}\"
  "
}

assert_equals "$(run_update_heap_probe)" "--max-old-space-size=3072" "update.sh should apply the 2GB auto heap override"
assert_equals "$(run_deploy_heap_probe)" "--max-old-space-size=3072" "deploy.sh should apply the 2GB auto heap override"
assert_equals "$(run_deploy_next_build_probe)" "1|--max-old-space-size=2048" "deploy.sh should use the 2GB Next.js low-memory build heap cap"

echo "Deploy memory profile checks passed."
