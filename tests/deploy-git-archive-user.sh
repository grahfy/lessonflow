#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

ORIGIN_DIR="${TEST_ROOT}/origin.git"
WORKTREE_DIR="${TEST_ROOT}/worktree"
DEPLOY_TARGET_DIR="${TEST_ROOT}/deploy-target"
FAKEBIN_DIR="${TEST_ROOT}/fakebin"
RUNUSER_LOG="${TEST_ROOT}/runuser.log"
CHOWN_LOG="${TEST_ROOT}/chown.log"
CHMOD_LOG="${TEST_ROOT}/chmod.log"
OUTPUT_LOG="${TEST_ROOT}/deploy-output.log"

mkdir -p "${ORIGIN_DIR}" "${FAKEBIN_DIR}" "${DEPLOY_TARGET_DIR}/shared"
git init --bare "${ORIGIN_DIR}" >/dev/null
git clone "${ORIGIN_DIR}" "${WORKTREE_DIR}" >/dev/null 2>&1

cp package.json package-lock.json .env.example "${WORKTREE_DIR}/"
mkdir -p "${WORKTREE_DIR}/public"
printf 'test asset\n' > "${WORKTREE_DIR}/public/.keep"
cp -r Documentation "${WORKTREE_DIR}/" 2>/dev/null || true
mkdir -p "${WORKTREE_DIR}/deploy"
cp deploy/deploy.sh deploy/app.service.template deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template deploy/nginx-http.conf deploy/nginx.conf "${WORKTREE_DIR}/deploy/"

cat > "${DEPLOY_TARGET_DIR}/shared/.env" <<EOF
UPDATES_GIT_REPO_PATH="${WORKTREE_DIR}"
UPDATES_DEPLOY_USER="deploy-owner"
NEXT_PUBLIC_SITE_URL="https://example.com"
DATABASE_URL="mysql://root:root@127.0.0.1:3306/mgs_dev"
LEARNING_MATERIALS_LOCAL_ROOT="${DEPLOY_TARGET_DIR}/data/learning-materials"
ADMIN_STAFF_PHOTOS_LOCAL_ROOT="${DEPLOY_TARGET_DIR}/data/admin-staff-photos"
EMAIL_SIGNATURE_LOGO_LOCAL_ROOT="${DEPLOY_TARGET_DIR}/data/email-signature-logo"
EOF

mkdir -p \
  "${DEPLOY_TARGET_DIR}/data/learning-materials" \
  "${DEPLOY_TARGET_DIR}/data/admin-staff-photos" \
  "${DEPLOY_TARGET_DIR}/data/email-signature-logo"
printf 'seed\n' > "${DEPLOY_TARGET_DIR}/data/learning-materials/seed.txt"
printf 'seed\n' > "${DEPLOY_TARGET_DIR}/data/admin-staff-photos/seed.txt"
printf 'seed\n' > "${DEPLOY_TARGET_DIR}/data/email-signature-logo/seed.txt"

(
  cd "${WORKTREE_DIR}"
  git config user.name "Test User"
  git config user.email "test@example.com"
  git add package.json package-lock.json .env.example public/.keep deploy/deploy.sh deploy/app.service.template deploy/bootstrap-host.sh deploy/sudoers.template deploy/web-update-trigger.sudoers.template deploy/nginx-http.conf deploy/nginx.conf
  git commit -m "test fixture" >/dev/null
  git branch -M main
  git push -u origin main >/dev/null 2>&1
)

cat > "${FAKEBIN_DIR}/runuser" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${RUNUSER_LOG}"
if [[ "${1:-}" == "-u" ]]; then
  shift 2
fi
if [[ "${1:-}" == "--" ]]; then
  shift
fi
exec "$@"
EOF

cat > "${FAKEBIN_DIR}/chown" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${CHOWN_LOG}"
exit 0
EOF

cat > "${FAKEBIN_DIR}/sudo" <<'EOF'
#!/bin/bash
set -euo pipefail
while [[ "${1:-}" == -* ]]; do
  case "${1}" in
    -n|-S)
      shift
      ;;
    -p)
      shift 2
      ;;
    -u)
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done
case "${1:-}" in
  cp|ln|mkdir|rm)
    if printf '%s\n' "$*" | grep -Fq '/etc/'; then
      exit 0
    fi
    ;;
  systemctl)
    exit 0
    ;;
esac
exec "$@"
EOF

cat > "${FAKEBIN_DIR}/getent" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "passwd" && "${2:-}" == "deploy-owner" ]]; then
  printf 'deploy-owner:x:2001:2001::/home/deploy-owner:/bin/bash\n'
  exit 0
fi
exec /usr/bin/getent "$@"
EOF

cat > "${FAKEBIN_DIR}/npm" <<'EOF'
#!/bin/bash
set -euo pipefail
if [[ "${1:-}" == "ci" ]]; then
  exit 0
fi
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

cat > "${FAKEBIN_DIR}/chmod" <<'EOF'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "${CHMOD_LOG}"
exec /usr/bin/chmod "$@"
EOF

cat > "${FAKEBIN_DIR}/systemctl" <<'EOF'
#!/bin/bash
exit 0
EOF

cat > "${FAKEBIN_DIR}/systemd-analyze" <<'EOF'
#!/bin/bash
exit 0
EOF

chmod +x "${FAKEBIN_DIR}/runuser" "${FAKEBIN_DIR}/sudo" "${FAKEBIN_DIR}/getent" "${FAKEBIN_DIR}/npm" "${FAKEBIN_DIR}/npx" "${FAKEBIN_DIR}/chmod" "${FAKEBIN_DIR}/systemctl" "${FAKEBIN_DIR}/systemd-analyze"
chmod +x "${FAKEBIN_DIR}/chown"

set +e
(
  cd "${WORKTREE_DIR}"
  PATH="${FAKEBIN_DIR}:${PATH}" \
  RUNUSER_LOG="${RUNUSER_LOG}" \
  CHOWN_LOG="${CHOWN_LOG}" \
  CHMOD_LOG="${CHMOD_LOG}" \
  MGS_SOURCE_GIT_USER="deploy-owner" \
  DEPLOY_DIR="${DEPLOY_TARGET_DIR}" \
  bash ./deploy/deploy.sh --branch main --skip-migrate --skip-cron --skip-deps --no-spinner --no-color --no-auto-bootstrap
) >"${OUTPUT_LOG}" 2>&1
set -e

if ! grep -Fq "git -C ${WORKTREE_DIR} archive --format=tar main" "${RUNUSER_LOG}"; then
  echo "Expected deploy git archive to run via runuser"
  cat "${OUTPUT_LOG}"
  cat "${RUNUSER_LOG}"
  exit 1
fi

if ! grep -Fq "git -C ${WORKTREE_DIR} rev-parse main" "${RUNUSER_LOG}"; then
  echo "Expected deploy commit capture to run via runuser"
  cat "${OUTPUT_LOG}"
  cat "${RUNUSER_LOG}"
  exit 1
fi

RELEASE_DIR="$(find "${DEPLOY_TARGET_DIR}/releases" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if ! grep -Fq -- "-R u=rwX,go=rX ${RELEASE_DIR}" "${CHMOD_LOG}"; then
  echo "Expected deploy.sh to apply release permissions with u=rwX,go=rX"
  cat "${OUTPUT_LOG}"
  cat "${CHMOD_LOG}"
  exit 1
fi

if ! grep -Fq -- "-R 775 ${DEPLOY_TARGET_DIR}/shared/data" "${CHMOD_LOG}"; then
  echo "Expected deploy.sh to keep shared data writable"
  cat "${OUTPUT_LOG}"
  cat "${CHMOD_LOG}"
  exit 1
fi

if ! grep -Fq -- "-R 775 ${DEPLOY_TARGET_DIR}/shared/cache" "${CHMOD_LOG}"; then
  echo "Expected deploy.sh to keep shared cache writable"
  cat "${OUTPUT_LOG}"
  cat "${CHMOD_LOG}"
  exit 1
fi

for storage_root in \
  "${DEPLOY_TARGET_DIR}/data/learning-materials" \
  "${DEPLOY_TARGET_DIR}/data/admin-staff-photos" \
  "${DEPLOY_TARGET_DIR}/data/email-signature-logo"
do
  if ! grep -Fq -- "-R :www-data ${storage_root}" "${CHOWN_LOG}"; then
    echo "Expected deploy.sh to chown upload storage root group for ${storage_root}"
    cat "${OUTPUT_LOG}"
    cat "${CHOWN_LOG}"
    exit 1
  fi

  if ! grep -Fq -- "2775 ${storage_root}" "${CHMOD_LOG}"; then
    echo "Expected deploy.sh to set upload storage directory permissions for ${storage_root}"
    cat "${OUTPUT_LOG}"
    cat "${CHMOD_LOG}"
    exit 1
  fi

  if ! grep -Fq -- "0664 ${storage_root}/seed.txt" "${CHMOD_LOG}"; then
    echo "Expected deploy.sh to set upload storage file permissions for ${storage_root}"
    cat "${OUTPUT_LOG}"
    cat "${CHMOD_LOG}"
    exit 1
  fi
done

echo "Deploy git archive user test passed."
