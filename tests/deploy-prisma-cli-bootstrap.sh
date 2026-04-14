#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

copy_source_tree() {
  local worktree_dir="$1"

  mkdir -p "${worktree_dir}/deploy" "${worktree_dir}/public"
  cp package.json package-lock.json .env.example "${worktree_dir}/"
  cp -R public/. "${worktree_dir}/public/"
  cp deploy/deploy.sh deploy/lessonflow.service deploy/nginx-http.conf "${worktree_dir}/deploy/"

  if ! grep -q '^NEXT_PUBLIC_SITE_URL=' "${worktree_dir}/.env.example"; then
    echo 'NEXT_PUBLIC_SITE_URL="https://example.test"' >> "${worktree_dir}/.env.example"
  fi
}

make_fakebin() {
  local fakebin_dir="$1"
  local include_prisma="$2"

  mkdir -p "${fakebin_dir}"

  cat > "${fakebin_dir}/npm" <<'EOF'
#!/bin/bash
set -euo pipefail

printf '%s\n' "npm $* | npm_config_cache=${npm_config_cache:-}" >> "${NPM_LOG_FILE}"

case "${1:-}" in
  list)
    echo "unexpected npm list invocation" >&2
    exit 91
    ;;
  install)
    exit 0
    ;;
  exec)
    exit 0
    ;;
  run)
    if [[ "${2:-}" == "build" ]]; then
      mkdir -p .next/standalone .next/static
      printf 'test-build\n' > .next/BUILD_ID
      printf 'console.log("server");\n' > .next/standalone/server.js
      exit 0
    fi
    ;;
esac

exit 0
EOF

  cat > "${fakebin_dir}/systemctl" <<'EOF'
#!/bin/bash
exit 0
EOF

  cat > "${fakebin_dir}/systemd-analyze" <<'EOF'
#!/bin/bash
exit 0
EOF

  if [[ "${include_prisma}" == "yes" ]]; then
    cat > "${fakebin_dir}/prisma" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "prisma $*" >> "${PRISMA_LOG_FILE}"
exit 0
EOF
    chmod +x "${fakebin_dir}/prisma"
  fi

  chmod +x "${fakebin_dir}/npm" "${fakebin_dir}/systemctl" "${fakebin_dir}/systemd-analyze"
}

run_deploy_case() {
  local case_name="$1"
  local include_prisma="$2"
  local expected_bootstrap_message="$3"
  local expect_install="$4"

  local worktree_dir="${TEST_ROOT}/${case_name}/worktree"
  local deploy_target_dir="${TEST_ROOT}/${case_name}/deploy-target"
  local fakebin_dir="${TEST_ROOT}/${case_name}/fakebin"
  local npm_log="${TEST_ROOT}/${case_name}/npm.log"
  local prisma_log="${TEST_ROOT}/${case_name}/prisma.log"
  local output_log="${TEST_ROOT}/${case_name}/output.log"
  local npm_cache_dir="${deploy_target_dir}/shared/cache/npm"

  mkdir -p "${deploy_target_dir}"
  mkdir -p "${npm_cache_dir}"
  copy_source_tree "${worktree_dir}"
  make_fakebin "${fakebin_dir}" "${include_prisma}"

  set +e
  (
    cd "${worktree_dir}"
    PATH="${fakebin_dir}:${PATH}" \
    DEPLOY_DIR="${deploy_target_dir}" \
    npm_config_cache="${npm_cache_dir}" \
    NPM_LOG_FILE="${npm_log}" \
    PRISMA_LOG_FILE="${prisma_log}" \
    bash ./deploy/deploy.sh --update-prisma --skip-deps --skip-migrate --no-spinner --no-color --no-auto-bootstrap
  ) > "${output_log}" 2>&1
  local status=$?
  set -e

  if [[ ${status} -ne 0 ]]; then
    echo "Deploy case failed: ${case_name}"
    cat "${output_log}"
    [[ -f "${npm_log}" ]] && cat "${npm_log}"
    [[ -f "${prisma_log}" ]] && cat "${prisma_log}"
    exit 1
  fi

  if [[ "${expect_install}" == "yes" ]]; then
    grep -Fq "${expected_bootstrap_message}" "${output_log}"
    grep -Fq "npm install --no-save --package-lock=false --ignore-scripts --prefer-offline --no-audit --no-fund prisma@7.7.0 | npm_config_cache=${deploy_target_dir}/shared/cache/npm" "${npm_log}"
    grep -Fq "npm exec --no -- prisma generate | npm_config_cache=${deploy_target_dir}/shared/cache/npm" "${npm_log}"
  else
    grep -Fq "${expected_bootstrap_message}" "${output_log}"
    grep -Fq "npm exec --no -- prisma generate | npm_config_cache=${deploy_target_dir}/shared/cache/npm" "${npm_log}"
    if grep -Fq "npm install --no-save" "${npm_log}"; then
      echo "Unexpected Prisma install invocation in cached-cli case"
      cat "${npm_log}"
      exit 1
    fi
  fi

  if grep -Fq "npm list prisma" "${npm_log}"; then
    echo "Unexpected npm list probe in Prisma bootstrap path"
    cat "${npm_log}"
    exit 1
  fi
}

run_deploy_case "prisma-cli-present" "yes" "Prisma CLI already available; skipping Prisma bootstrap." "no"
run_deploy_case "prisma-cli-missing" "no" "Prisma CLI missing; bootstrapping prisma@7.7.0 with the shared npm cache." "yes"

echo "Prisma CLI bootstrap regression passed."
