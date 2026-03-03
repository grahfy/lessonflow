#!/usr/bin/env bash
set -euo pipefail

# Local convenience script for a "full site" smoke run on Linux/macOS.
# Mirrors the logic in scripts/test-full-site-local.ps1

# Get the project root directory (parent of scripts directory)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"
SKIP_INSTALL=0
SKIP_TESTS=0
SEED_DATA=0
SEED_COUNT=50
NO_START=0
CLEANUP=0
TESTS_FAILED=0

log() { printf '[local-full-site] %s\n' "$*"; }
error() { printf '[local-full-site] ERROR: %s\n' "$*" >&2; }

cleanup() { 
  if [[ "$CLEANUP" -eq 1 ]]; then 
    log "Cleaning up Docker resources..."
    docker stop lessonflow-dev-mysql lessonflow-test-mysql 2>/dev/null || true
  fi 
}
trap 'cleanup' EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1; shift;;
    --skip-tests) SKIP_TESTS=1; shift;;
    --seed) SEED_DATA=1; shift;;
    --seed-count) SEED_COUNT="$2"; shift 2;;
    --no-start) NO_START=1; shift;;
    --cleanup) CLEANUP=1; shift;;
    --help|-h)
      echo "Usage: scripts/test-full-site-local.sh [--skip-install] [--skip-tests] [--seed] [--seed-count <n>] [--no-start] [--cleanup]"
      echo "Options:"
      echo "  --skip-install       Skip \`npm ci\` dependency installation"
      echo "  --skip-tests         Skip \`npm test\` automated tests"
      echo "  --seed              Clear existing customer/invoice data and seed fresh fake data"
      echo "  --seed-count <n>    Number of fake customers to seed (default: 50)"
      echo "  --no-start          Do not start Next.js dev server after setup/checks"
      echo "  --cleanup           Stop database containers when script completes"
      echo "  --help              Show this help message"
      exit 0;;
    *) echo "Unknown option: $1" >&2; exit 1;;
  esac
done

# 1. Docker Checks (fail fast before installing dependencies)
if ! command -v docker >/dev/null 2>&1; then
  error "Docker is not installed. Please install Docker to run local databases."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  error "Docker is not running. Please start Docker Desktop/Engine."
  exit 1
fi

# 2. Dependency Installation
if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  log "Installing dependencies..."
  npm ci --no-fund --no-audit --loglevel=error
fi

# 3. Environment Setup
if [[ ! -f .env ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

if [[ ! -f .env.test.local && -f .env.test.example ]]; then
  log "Creating .env.test.local from .env.test.example"
  cp .env.test.example .env.test.local
fi

# Parse DB URLs from env files
DB_URL=$(grep "^DATABASE_URL=" .env | sed -E 's/DATABASE_URL="?([^"]+)"?/\1/')
TEST_DB_URL=""
if [[ -f .env.test.local ]]; then
  TEST_DB_URL=$(grep "^TEST_DATABASE_URL=" .env.test.local | sed -E 's/TEST_DATABASE_URL="?([^"]+)"?/\1/')
fi

if [[ -z "$TEST_DB_URL" ]]; then
  # Fallback: derive test DB URL from dev DB URL
  TEST_DB_URL="${DB_URL/mgs_dev/mgs_test}"
  TEST_DB_URL="${TEST_DB_URL/3306/3307}"
fi

log "Dev database: $DB_URL"
log "Test database: $TEST_DB_URL"

# 4. Database Container Management
start_mariadb_container() {
  local svc=$1
  local port=$2
  local db_name=$3
  
  log "Checking container: $svc..."
  
  if docker ps --format "{{.Names}}" | grep -q "^${svc}$"; then
    log "$svc is already running"
    return 0
  fi
  
  if docker ps -a --format "{{.Names}}" | grep -q "^${svc}$"; then
    log "Starting existing $svc container..."
    docker start "$svc" >/dev/null
  else
    log "Creating and starting container: $svc on port $port"
    docker run -d --name "$svc" \
      -e MYSQL_ROOT_PASSWORD=root \
      -e MYSQL_DATABASE="$db_name" \
      -p "${port}:3306" \
      mariadb:latest >/dev/null
  fi
  
  log "Waiting for $svc to be ready..."
  local max_retries=30
  local retry=0
  while [[ $retry -lt $max_retries ]]; do
    if docker exec "$svc" bash -c "cat < /dev/null > /dev/tcp/localhost/3306" >/dev/null 2>&1; then
      break
    fi
    retry=$((retry + 1))
    sleep 1
  done

  if [[ $retry -ge $max_retries ]]; then
    error "Timeout waiting for $svc to start"
    return 1
  fi

  log "$svc is ready"
}

start_mariadb_container "lessonflow-dev-mysql" 3306 "mgs_dev" || exit 1
start_mariadb_container "lessonflow-test-mysql" 3307 "mgs_test" || exit 1

# 5. Database Initialization
log "Running Prisma migrations on test database..."
DATABASE_URL="${TEST_DB_URL}" npx prisma migrate deploy >/dev/null

log "Running Prisma migrations on dev database..."
DATABASE_URL="${DB_URL}" npx prisma migrate deploy >/dev/null

log "Generating Prisma client..."
npx prisma generate >/dev/null

# 6. Data Seeding
if [[ "$SEED_DATA" -eq 1 ]]; then
  log "Clearing existing data..."
  DATABASE_URL="${DB_URL}" npx tsx scripts/clear-customer-data.ts 2>/dev/null || true
  DATABASE_URL="${DB_URL}" npx tsx scripts/clear-all-data.ts 2>/dev/null || true
fi

log "Seeding whitelabel defaults..."
DATABASE_URL="${DB_URL}" npx tsx scripts/seed-whitelabel-defaults.ts

if [[ "$SEED_DATA" -eq 1 ]]; then
  log "Seeding fake data ($SEED_COUNT customers)..."
  DATABASE_URL="${DB_URL}" npx tsx scripts/seed-fake-data.ts "$SEED_COUNT"
  DATABASE_URL="${DB_URL}" npx tsx scripts/seed-invoice-presets.ts
  
  log "Default admin account:"
  log "  URL: http://${HOST}:${PORT}/admin/login"
  log "  Email: admin@example.com"
  log "  Password: admin123"
fi

# 7. Automated Testing
if [[ "$SKIP_TESTS" -eq 0 ]]; then
  log "Running automated tests..."
  # Set both variables to ensure Vitest uses the test database
  export DATABASE_URL="$TEST_DB_URL"
  export TEST_DATABASE_URL="$TEST_DB_URL"
  
  if ! npm test; then
    TESTS_FAILED=1
    log "Automated tests failed. Continuing so you can still test the site manually."
  fi
fi

# 8. Dev Server Preparation
log "Cleaning stale Next.js artifacts..."
npm run clean --silent || true

if [[ "$NO_START" -eq 1 ]]; then
  if [[ "$TESTS_FAILED" -eq 1 ]]; then exit 1; fi
  log "Checks completed. Dev server start skipped (--no-start)."
  exit 0
fi

# Free port 3000 if in use (requires lsof)
if command -v lsof >/dev/null 2>&1; then
  if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    log "Port $PORT is in use, freeing it..."
    lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

# 9. Start Dev Server
# Ensure we use the dev database for the site
export DATABASE_URL="$DB_URL"

log "Starting local site at http://${HOST}:${PORT}"
log "NOTE: The site will default to 'Melbourne Guitar School' until you customize it in Admin Settings."
log "Press Ctrl+C to stop the server"

npm run dev -- --hostname "$HOST" --port "$PORT"
