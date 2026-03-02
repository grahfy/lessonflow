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
SEED_DATA=0
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
    --seed)
      SEED_DATA=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/test-full-site-local.sh [--skip-install] [--skip-tests] [--seed] [--no-start]

--skip-install  Skip `npm ci`
--skip-tests    Skip `npm test`
--seed          Seed fake customers, invoices, and appointments
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

# Local developer bootstrap: starts a MySQL Docker container if not running
# and prepares the development database.
log "Preparing development database..."

# Extract MySQL host/port from DATABASE_URL in .env (expects localhost/127.0.0.1)
DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'"' -f2)

# Check if MySQL is accessible at the configured URL
if ! command -v docker >/dev/null 2>&1; then
  log "Docker is required for local MySQL. Please install Docker or provide a MySQL instance."
  exit 1
fi

# Start MySQL container if not already running (using default dev DB name from .env.example)
DB_CONTAINER_NAME="lessonflow-dev-mysql"

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER_NAME}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER_NAME}$"; then
    log "Starting existing MySQL Docker container (${DB_CONTAINER_NAME})..."
    docker start "${DB_CONTAINER_NAME}"
  else
    log "MySQL Docker container (${DB_CONTAINER_NAME}) is already running."
  fi
else
  log "Creating and starting new MySQL Docker container (${DB_CONTAINER_NAME})..."
  docker run -d \
    --name "${DB_CONTAINER_NAME}" \
    -e MYSQL_ROOT_PASSWORD=root \
    -e MYSQL_DATABASE=mgs_dev \
    -p 3306:3306 \
    mysql:8
fi

# Wait for MySQL to be ready by checking connection
log "Waiting for MySQL to start..."
MAX_RETRIES=30
RETRY_COUNT=0
while ! docker exec "${DB_CONTAINER_NAME}" mysqladmin ping -h localhost -u root -proot >/dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    log "Timeout waiting for MySQL to start"
    exit 1
  fi
  sleep 1
done
log "MySQL is ready"

# Run migrations using the DATABASE_URL from .env
DATABASE_URL="${DB_URL}" npx prisma migrate deploy

# Seed whitelabel defaults to ensure "old info" (MGS branding) is in the DB
log "Seeding whitelabel defaults..."
DATABASE_URL="${DB_URL}" npx tsx scripts/seed-whitelabel-defaults.ts

if [[ "$SEED_DATA" -eq 1 ]]; then
  log "Seeding fake customers, invoices, and appointments..."
  DATABASE_URL="${DB_URL}" npx tsx scripts/seed-fake-data.ts
  
  log "Seeding invoice product presets..."
  DATABASE_URL="${DB_URL}" npx tsx scripts/seed-invoice-presets.ts
fi

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

# Ensure the port is free before starting Next.js
if command -v fuser >/dev/null 2>&1; then
  log "Ensuring port ${PORT} is free..."
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
fi

log "Starting local site at http://${HOST}:${PORT}"
log "NOTE: The site will default to 'Melbourne Guitar School' until you customize it in Admin Settings."
npm run dev -- --hostname "$HOST" --port "$PORT"
