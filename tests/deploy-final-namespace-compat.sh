#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
DEPLOY_TARGET_DIR="${TEST_ROOT}/deploy-target"
SYSTEMD_DIR="${TEST_ROOT}/systemd"
NGINX_ETC_DIR="${TEST_ROOT}/nginx"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
SYSTEMCTL_LOG="${TEST_ROOT}/systemctl.log"
RESTART_COUNT_FILE="${TEST_ROOT}/restart-count.txt"
OUTPUT_LOG="${TEST_ROOT}/deploy-output.log"

mkdir -p "${ORIGIN_DIR}" "${DEPLOY_TARGET_DIR}/shared" "${SYSTEMD_DIR}" "${NGINX_ETC_DIR}" "${FAKEBIN_DIR}"
printf '1\n' > "${RESTART_COUNT_FILE}"

git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json .env.example "${WORKTREE_DIR}/"
cp -r public "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/deploy.sh deploy/lessonflow.service deploy/nginx-http.conf "${WORKTREE_DIR}/deploy/"

cat > "${DEPLOY_TARGET_DIR}/shared/.env" <<EOF
NEXT_PUBLIC_SITE_URL="https://example.com"
DATABASE_URL="mysql://root:root@127.0.0.1:3306/mgs_dev"
EOF

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json .env.example public deploy/deploy.sh deploy/lessonflow.service deploy/nginx-http.conf
  git commit -m "test fixture" >/dev/null
  git branch -M main
  git push -u origin main >/dev/null 2>&1
)

cat > "${FAKEBIN_DIR}/sudo" <<'EOF'
#!/bin/bash
set -euo pipefail
args=()
for arg in "$@"; do
  case "${arg}" in
    /etc/nginx/*)
      args+=( "${NGINX_ETC_DIR}/${arg#/etc/nginx/}" )
      ;;
    *)
      args+=( "${arg}" )
      ;;
  esac
done
exec "${args[@]}"
EOF

cat > "${FAKEBIN_DIR}/runuser" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "-u" ]]; then
  shift 2
fi
if [[ "${1:-}" == "--" ]]; then
  shift
fi
exec "$@"
EOF

cat > "${FAKEBIN_DIR}/npm" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "run" && "${2:-}" == "build" ]]; then
  mkdir -p .next/standalone .next/static
  printf 'test-build\n' > .next/BUILD_ID
  printf 'console.log("server");\n' > .next/standalone/server.js
  exit 0
fi
exit 0
EOF

cat > "${FAKEBIN_DIR}/npx" <<'EOF'
#!/bin/bash
exit 0
EOF

cat > "${FAKEBIN_DIR}/nginx" <<'EOF'
#!/bin/bash
exit 0
EOF

cat > "${FAKEBIN_DIR}/systemctl" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${SYSTEMCTL_LOG}"
if [[ "${1:-}" == "restart" && "${2:-}" == "lessonflow" ]]; then
  count="$(cat "${RESTART_COUNT_FILE}")"
  if [[ "${count}" == "1" ]]; then
    printf '2\n' > "${RESTART_COUNT_FILE}"
    exit 1
  fi
  exit 0
fi
if [[ "${1:-}" == "status" && "${2:-}" == "lessonflow" ]]; then
  cat <<'OUT'
lessonflow.service - Test
     Active: failed (Result: exit-code)
    Process: 123 ExecStart=/usr/bin/node /var/www/lessonflow/current/.next/standalone/server.js (code=exited, status=226/NAMESPACE)
OUT
  exit 3
fi
if [[ "${1:-}" == "is-active" && "${2:-}" == "--quiet" && "${3:-}" == "lessonflow" ]]; then
  exit 0
fi
exit 0
EOF

cat > "${FAKEBIN_DIR}/systemd-analyze" <<'EOF'
#!/bin/bash
exit 0
EOF

chmod +x "${FAKEBIN_DIR}/sudo" "${FAKEBIN_DIR}/runuser" "${FAKEBIN_DIR}/npm" "${FAKEBIN_DIR}/npx" "${FAKEBIN_DIR}/nginx" "${FAKEBIN_DIR}/systemctl" "${FAKEBIN_DIR}/systemd-analyze"

set +e
(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  SYSTEMCTL_LOG="${SYSTEMCTL_LOG}" \
  RESTART_COUNT_FILE="${RESTART_COUNT_FILE}" \
  NGINX_ETC_DIR="${NGINX_ETC_DIR}" \
  LESSONFLOW_SYSTEMD_DIR="${SYSTEMD_DIR}" \
  DEPLOY_DIR="${DEPLOY_TARGET_DIR}" \
  bash ./deploy/deploy.sh --branch main --skip-pull --skip-migrate --skip-cron --skip-deps --no-spinner --no-color --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1
status=$?
set -e

if [[ "${status}" -ne 0 ]]; then
  echo "Expected deploy to recover from namespace failure"
  cat "${OUTPUT_LOG}"
  exit 1
fi

COMPAT_FILE="${SYSTEMD_DIR}/lessonflow.service.d/namespace-compat.conf"
if [[ ! -f "${COMPAT_FILE}" ]]; then
  echo "Expected namespace compatibility drop-in to be created"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if ! grep -Fq "Restarting systemd service (lessonflow)" "${OUTPUT_LOG}"; then
  echo "Expected final deploy restart path to run"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if ! grep -Fq "lessonflow.service recovered after installing namespace compatibility drop-in" "${OUTPUT_LOG}"; then
  echo "Expected final deploy restart path to recover"
  cat "${OUTPUT_LOG}"
  exit 1
fi

if ! grep -Fq "reset-failed lessonflow" "${SYSTEMCTL_LOG}"; then
  echo "Expected final deploy namespace repair to reset failed service state before retrying"
  cat "${OUTPUT_LOG}"
  cat "${SYSTEMCTL_LOG}"
  exit 1
fi

if ! grep -Fq "restart lessonflow" "${SYSTEMCTL_LOG}" || ! grep -Fq "restart nginx" "${SYSTEMCTL_LOG}"; then
  echo "Expected app recovery and nginx restart"
  cat "${OUTPUT_LOG}"
  cat "${SYSTEMCTL_LOG}"
  exit 1
fi

echo "Deploy final namespace compatibility test passed."
