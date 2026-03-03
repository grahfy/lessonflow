#!/usr/bin/env bash
set -euo pipefail

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

cleanup() { if [[ "$CLEANUP" -eq 1 ]]; then docker-compose down --remove-orphans 2>/dev/null || true; fi; }
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
      echo "  --skip-install       Skip \`npm ci\`"
      echo "  --skip-tests         Skip \`npm test\`"
      echo "  --seed              Clear existing customer/invoice data and seed fresh fake data"
      echo "  --seed-count <n>    Number of fake customers to seed (default: 50)"
      echo "  --no-start          Do not start Next.js dev server after setup/checks"
      echo "  --cleanup           Stop Docker Compose services when script completes"
      echo "  --help              Show this help message"
      exit 0;;
    *) echo "Unknown option: $1" >&2; exit 1;;
  esac
done

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

if [[ ! -f .env.test.local && -f .env.test.example ]]; then
  log "Creating .env.test.local from .env.test.example"
  cp .env.test.example .env.test.local
fi

DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'"' -f2)
TEST_DB_URL=""
if [[ -f .env.test.local ]]; then TEST_DB_URL=$(grep "^TEST_DATABASE_URL=" .env.test.local | cut -d'"' -f2); fi
if [[ -z "$TEST_DB_URL" ]]; then 
  TEST_DB_URL="${DB_URL/mgs_dev/mgs_test}"
  TEST_DB_URL="${TEST_DB_URL/3306/3307}"
fi

log "Dev database: $DB_URL"
log "Test database: $TEST_DB_URL"

DOCKER_COMPOSE_CMD="docker-compose"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then 
  DOCKER_COMPOSE_CMD="docker compose"
fi

start_mariadb_service() {
  local svc=$1
  local port=$2
  local db_name=$3
  
  log "Checking $svc..."
  
  # Check if container exists and is running
  if docker ps --format "{{.Names}}" | grep -q "^${svc}$"; then
    log "$svc is already running"
    return 0
  fi
  
  # Check if container exists but stopped
  if docker ps -a --format "{{.Names}}" | grep -q "^${svc}$"; then
    log "Starting existing $svc container..."
    docker start "$svc"
  else
    log "Creating new $svc container on port $port..."
    if [[ "$svc" == "lessonflow-test-mysql" ]]; then
      docker run -d --name "$svc" -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE="$db_name" -p ${port}:3306 mariadb:latest
    else
      docker run -d --name "$svc" -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE="$db_name" -p ${port}:3306 mariadb:latest
    fi
  fi
  
  log "Waiting for $svc to be ready..."
  local max_retries=30
  local retry=0
  while [[ $retry -lt $max_retries ]]; do
    if docker exec $svc mysqladmin ping -h localhost -u root -proot >/dev/null 2>&1; then
      break
    fi
    retry=$((retry + 1))
    sleep 1
  done
  
  if [[ $retry -ge $max_retries ]]; then
    error "Timeout waiting for $svc"
    return 1
  fi
  
  log "$svc is ready"
}

# Start dev database (port 3306)
start_mariadb_service "lessonflow-dev-mysql" 3306 "mgs_dev" || exit 1

# Start test database (port 3307)  
start_mariadb_service "lessonflow-test-mysql" 3307 "mgs_test" || exit 1

log "Running Prisma migrations on test database..."
DATABASE_URL="${TEST_DB_URL}" npx prisma migrate deploy

log "Running Prisma migrations on dev database..."
DATABASE_URL="${DB_URL}" npx prisma migrate deploy

log "Generating Prisma client..."
npx prisma generate

log "Seeding whitelabel defaults..."
DATABASE_URL="${DB_URL}" npx tsx scripts/seed-whitelabel-defaults.ts

if [[ "$SEED_DATA" -eq 1 ]]; then
  log "Seeding fake data ($SEED_COUNT customers)..."
  DATABASE_URL="${DB_URL}" npx tsx scripts/clear-customer-data.ts 2>/dev/null || true
  DATABASE_URL="${DB_URL}" npx tsx scripts/clear-all-data.ts 2>/dev/null || true
  DATABASE_URL="${DB_URL}" npx tsx scripts/seed-fake-data.ts "$SEED_COUNT"
  DATABASE_URL="${DB_URL}" npx tsx scripts/seed-invoice-presets.ts
  
  log "Default admin account:"
  log "  URL: http://${HOST}:${PORT}/admin/login"
  log "  Email: admin@example.com"
  log "  Password: Password123!"
fi

if [[ "$SKIP_TESTS" -eq 0 ]]; then
  log "Running automated tests..."
  DATABASE_URL="$TEST_DB_URL" TEST_DATABASE_URL="$TEST_DB_URL" npm test || TESTS_FAILED=1
  if [[ "$TESTS_FAILED" -eq 1 ]]; then
    log "Automated tests failed. Continuing so you can still test the site manually."
  fi
fi

log "Cleaning stale Next.js artifacts..."
npm run clean

if [[ "$NO_START" -eq 1 ]]; then
  if [[ "$TESTS_FAILED" -eq 1 ]]; then exit 1; fi
  log "Checks completed. Dev server start skipped (--no-start)."
  exit 0
fi

log "Starting local site at http://${HOST}:${PORT}"
log "NOTE: The site will default to 'Melbourne Guitar School' until you customize it in Admin Settings."
npm run dev -- --hostname "$HOST" --port "$PORT"
