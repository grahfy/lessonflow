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

assert_not_contains() {
  local actual="$1"
  local unexpected_substring="$2"
  local message="$3"

  if [[ "${actual}" == *"${unexpected_substring}"* ]]; then
    echo "${message}"
    echo "Unexpected substring: ${unexpected_substring}"
    echo "Actual:               ${actual}"
    exit 1
  fi
}

run_next_config_probe() {
  local low_memory_flag="$1"

  NEXT_LOW_MEMORY_BUILD="${low_memory_flag}" node - <<'NODE'
const configPath = require.resolve("./next.config.js");
delete require.cache[configPath];
const config = require(configPath);

process.stdout.write(JSON.stringify({
  webpackMemoryOptimizations: Boolean(config.experimental?.webpackMemoryOptimizations),
  ignoreDuringBuilds: Boolean(config.eslint?.ignoreDuringBuilds),
  ignoreBuildErrors: Boolean(config.typescript?.ignoreBuildErrors)
}));
NODE
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
    LOW_RAM_2GB_NEXT_BUILD_HEAP_MB=2048
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
    has_privileged_swap_access() { return 0; }
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
    $(sed -n '/^next_temporary_build_swap_path()/,/^}/p;/^ensure_temporary_build_swap()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    ensure_temporary_build_swap
    printf 'ACTIVE=%s CREATED=%s EXISTS=%s\n' \"\$TEMP_BUILD_SWAP_ACTIVE\" \"\$TEMP_BUILD_SWAP_CREATED_FILE\" \"\$(test -e \"\$TEMP_BUILD_SWAP_PATH\" && echo true || echo false)\"
  "
}

run_deploy_swap_no_privilege_probe() {
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
    : > \"\$TEMP_BUILD_SWAP_PATH\"
    has_privileged_swap_access() { return 1; }
    log_info() { :; }
    log_warn() { printf '%s\n' \"\$*\"; }
    detect_total_ram_mb() { echo 1967; }
    detect_total_swap_mb() { echo 0; }
    $(sed -n '/^next_temporary_build_swap_path()/,/^}/p;/^ensure_temporary_build_swap()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    ensure_temporary_build_swap
    printf 'ACTIVE=%s CREATED=%s EXISTS=%s\n' \"\$TEMP_BUILD_SWAP_ACTIVE\" \"\$TEMP_BUILD_SWAP_CREATED_FILE\" \"\$(test -e \"\$TEMP_BUILD_SWAP_PATH\" && echo true || echo false)\"
  "
}

run_deploy_swap_stale_cleanup_fallback_probe() {
  bash -lc "
    set -euo pipefail
    TEST_ROOT=\$(mktemp -d)
    trap 'rm -rf \"\$TEST_ROOT\"' EXIT
    TEMP_BUILD_SWAP_AUTO_ENABLED=true
    OSTYPE=linux-gnu
    ORIGINAL_TEMP_BUILD_SWAP_PATH=\"\$TEST_ROOT/build.swap\"
    TEMP_BUILD_SWAP_PATH=\"\$ORIGINAL_TEMP_BUILD_SWAP_PATH\"
    TEMP_BUILD_SWAP_MIN_CREATE_MB=128
    LOW_RAM_1GB_AUTO_HEAP_MIN_MB=900
    LOW_RAM_1GB_AUTO_HEAP_MAX_MB=1280
    LOW_RAM_2GB_AUTO_HEAP_MIN_MB=1700
    LOW_RAM_2GB_AUTO_HEAP_MAX_MB=2560
    LOW_RAM_1GB_TARGET_TOTAL_SWAP_MB=2048
    LOW_RAM_2GB_TARGET_TOTAL_SWAP_MB=2048
    TEMP_BUILD_SWAP_ACTIVE=false
    TEMP_BUILD_SWAP_CREATED_FILE=false
    : > \"\$TEMP_BUILD_SWAP_PATH\"
    has_privileged_swap_access() { return 0; }
    log_info() { :; }
    log_warn() { printf '%s\n' \"\$*\"; }
    detect_total_ram_mb() { echo 1967; }
    detect_total_swap_mb() { echo 0; }
    run_sudo_cmd() {
      case \"\$1\" in
        rm)
          if [[ \"\$3\" == \"\$ORIGINAL_TEMP_BUILD_SWAP_PATH\" ]]; then
            return 1
          fi
          rm -f \"\$3\"
          ;;
        chmod|mkswap|swapon|swapoff)
          :
          ;;
        fallocate)
          : > \"\$4\"
          ;;
        dd)
          : > \"\$5\"
          ;;
        *)
          \"\$@\"
          ;;
      esac
    }
    $(sed -n '/^next_temporary_build_swap_path()/,/^}/p;/^ensure_temporary_build_swap()/,/^}/p' "${REPO_ROOT}/deploy/deploy.sh")
    ensure_temporary_build_swap
    printf 'ACTIVE=%s CREATED=%s EXISTS=%s PATH=%s\n' \"\$TEMP_BUILD_SWAP_ACTIVE\" \"\$TEMP_BUILD_SWAP_CREATED_FILE\" \"\$(test -e \"\$TEMP_BUILD_SWAP_PATH\" && echo true || echo false)\" \"\$TEMP_BUILD_SWAP_PATH\"
  "
}

assert_equals "$(run_next_config_probe 0)" '{"webpackMemoryOptimizations":false,"ignoreDuringBuilds":false,"ignoreBuildErrors":false}' "next.config.js should leave memory-saving build flags disabled outside low-memory deploy mode"
assert_equals "$(run_next_config_probe 1)" '{"webpackMemoryOptimizations":true,"ignoreDuringBuilds":true,"ignoreBuildErrors":true}' "next.config.js should enable memory-saving build flags for low-memory deploy builds"
assert_equals "$(run_update_heap_probe)" "--max-old-space-size=3072" "update.sh should apply the 2GB auto heap override"
assert_equals "$(run_deploy_heap_probe)" "--max-old-space-size=3072" "deploy.sh should apply the 2GB auto heap override"
assert_equals "$(run_deploy_next_build_probe)" "1|--max-old-space-size=2048" "deploy.sh should use the conservative 2GB Next.js low-memory build heap cap"
swap_probe_output="$(run_deploy_swap_probe)"
assert_contains "${swap_probe_output}" "reach ~2048MB total swap" "deploy.sh should target 2048MB total swap for the 2GB low-memory branch"
assert_contains "${swap_probe_output}" "ACTIVE=true CREATED=true EXISTS=true" "deploy.sh should mark the temporary swap file active for the 2GB low-memory branch"
swap_no_privilege_output="$(run_deploy_swap_no_privilege_probe)"
assert_contains "${swap_no_privilege_output}" "deploy user lacks root or non-interactive sudo access" "deploy.sh should warn when temp swap is skipped for a non-root deploy user"
assert_contains "${swap_no_privilege_output}" "ACTIVE=false CREATED=false EXISTS=true" "deploy.sh should leave the stale swap file untouched when it skips temp swap management"
assert_not_contains "${swap_no_privilege_output}" "Removing stale temporary swap file" "deploy.sh should skip stale swap cleanup when privileged swap access is unavailable"
assert_not_contains "${swap_no_privilege_output}" "Operation not permitted" "deploy.sh should not surface raw rm permission errors when temp swap is skipped"
swap_fallback_output="$(run_deploy_swap_stale_cleanup_fallback_probe)"
assert_contains "${swap_fallback_output}" "retrying temporary build swap with alternate path" "deploy.sh should retry temp swap creation with an alternate path when stale swap cleanup fails"
assert_contains "${swap_fallback_output}" "ACTIVE=true CREATED=true EXISTS=true PATH=" "deploy.sh should still activate temporary swap after falling back to a fresh path"
assert_contains "${swap_fallback_output}" "build-1.swap" "deploy.sh should choose a deterministic sibling swap filename for the retry"

echo "Deploy memory profile checks passed."
