#!/usr/bin/env bash
set -euo pipefail

# Local convenience script for a "full site" smoke run. It bootstraps env files,
# prepares a local database, runs tests, and optionally starts `next dev`.
# Note: this helper still uses a SQLite dev DB URL for local-only workflows and
# is not the MySQL-backed test harness used by `npm test` in CI/server checks.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"
SKIP_INSTALL=0
SKIP_TESTS=0
NO_START=0
TESTS_FAILED=0

log() {
  printf '[local-full-site] %s\n' "$*"
}

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not installed." >&2
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/test-full-site-local.sh [--skip-install] [--skip-tests] [--no-start]

--skip-install  Skip `npm ci`
--skip-tests    Skip `npm test`
--no-start      Do not start Next.js dev server after setup/checks
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  log "Installing dependencies (npm ci)..."
  npm ci
fi

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

if [[ ! -f .env.test.local && -f .env.test.example ]]; then
  log "Creating .env.test.local from .env.test.example"
  cp .env.test.example .env.test.local
fi

# Local developer bootstrap: uses the repo's sqlite dev database path so the
# app can be explored quickly without provisioning MySQL.
log "Preparing development database..."
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate deploy

if [[ "$SKIP_TESTS" -eq 0 ]]; then
  # `npm test` may use the MySQL-oriented harness if TEST_DATABASE_URL is set;
  # otherwise this remains a convenience preflight and may fail in fresh setups.
  log "Running automated tests..."
  if ! npm test; then
    TESTS_FAILED=1
    log "Automated tests failed. Continuing so you can still test the site manually."
  fi
fi

log "Cleaning stale Next.js artifacts..."
npm run clean

if [[ "$NO_START" -eq 1 ]]; then
  if [[ "$TESTS_FAILED" -eq 1 ]]; then
    exit 1
  fi

  log "Checks completed. Dev server start skipped (--no-start)."
  exit 0
fi

log "Starting local site at http://${HOST}:${PORT}"
npm run dev -- --hostname "$HOST" --port "$PORT"
