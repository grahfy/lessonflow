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
SEED_MODE="none"
SEED_COUNT=50
LONG_HISTORY_COUNT=0
LONG_HISTORY_CUSTOMERS=0
NO_START=0
CLEANUP=0
TESTS_FAILED=0
DEV_AND_TEST_SHARE_DB=0

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
    --seed)
      if [[ "$SEED_MODE" != "none" ]]; then
        error "Choose only one seed mode: --seed or --seed-docs-demo."
        exit 1
      fi
      SEED_MODE="fake"
      shift
      ;;
    --seed-docs-demo)
      if [[ "$SEED_MODE" != "none" ]]; then
        error "Choose only one seed mode: --seed or --seed-docs-demo."
        exit 1
      fi
      SEED_MODE="docs-demo"
      shift
      ;;
    --seed-count) SEED_COUNT="$2"; shift 2;;
    --long-history-count) LONG_HISTORY_COUNT="$2"; shift 2;;
    --long-history-customers) LONG_HISTORY_CUSTOMERS="$2"; shift 2;;
    --no-start) NO_START=1; shift;;
    --cleanup) CLEANUP=1; shift;;
    --help|-h)
      echo "Usage: scripts/test-full-site-local.sh [--skip-install] [--skip-tests] [--seed | --seed-docs-demo] [--seed-count <n>] [--long-history-count <n>] [--long-history-customers <n>] [--no-start] [--cleanup]"
      echo "Options:"
      echo "  --skip-install       Skip \`npm ci\` dependency installation"
      echo "  --skip-tests         Skip \`npm test\` automated tests"
      echo "  --seed              Clear the dev DB and seed generic fake admin/customer/invoice/lesson-plan data"
      echo "  --seed-docs-demo    Clear the dev DB and seed the deterministic docs/demo dataset including lesson planning"
      echo "  --seed-count <n>    Number of fake customers to seed for --seed (default: 50)"
      echo "  --long-history-count <n>      Number of seeded emails for each long-history customer"
      echo "  --long-history-customers <n>  Number of first seeded customers that receive long email histories"
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

if [[ "$DB_URL" == "$TEST_DB_URL" ]]; then
  DEV_AND_TEST_SHARE_DB=1
  log "Dev and test databases resolve to the same URL. Seeded manual QA data will be restored after automated tests."
fi

SITE_URL_HOST="$HOST"
if [[ "$SITE_URL_HOST" == "0.0.0.0" ]]; then
  SITE_URL_HOST="127.0.0.1"
fi
SITE_URL="http://${SITE_URL_HOST}:${PORT}"
DOCS_DEMO_ADMIN_EMAIL="${DOCS_SCREENSHOTS_ADMIN_EMAIL:-owner@example.com}"
DOCS_DEMO_ADMIN_PASSWORD="${DOCS_SCREENSHOTS_ADMIN_PASSWORD:-DocsDemoAdmin!23}"
DOCS_DEMO_STUDENT_PASSWORD="${DOCS_SCREENSHOTS_STUDENT_PASSWORD:-StudentDemo!23}"

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
    # RATIONALE: Reusing containers keeps repeated smoke runs fast and avoids
    # wiping a developer's local databases unless they explicitly opt in.
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
run_seed_mode() {
  if [[ "$SEED_MODE" == "none" ]]; then
    return 0
  fi

  log "Clearing existing data..."
  DATABASE_URL="${DB_URL}" npx tsx scripts/clear-customer-data.ts 2>/dev/null || true
  DATABASE_URL="${DB_URL}" npx tsx scripts/clear-all-data.ts 2>/dev/null || true

  log "Seeding whitelabel defaults..."
  DATABASE_URL="${DB_URL}" npx tsx scripts/seed-whitelabel-defaults.ts

  if [[ "$SEED_MODE" == "fake" ]]; then
    log "Seeding fake data ($SEED_COUNT customers)..."
    SEED_ARGS=("$SEED_COUNT")
    if [[ "$LONG_HISTORY_COUNT" -gt 0 && "$LONG_HISTORY_CUSTOMERS" -gt 0 ]]; then
      log "Adding long email histories for $LONG_HISTORY_CUSTOMERS customers ($LONG_HISTORY_COUNT emails each)..."
      SEED_ARGS+=("--long-history-count" "$LONG_HISTORY_COUNT" "--long-history-customers" "$LONG_HISTORY_CUSTOMERS")
    fi
    DATABASE_URL="${DB_URL}" npx tsx scripts/seed-fake-data.ts "${SEED_ARGS[@]}"
    DATABASE_URL="${DB_URL}" npx tsx scripts/seed-invoice-presets.ts
    DATABASE_URL="${DB_URL}" npx tsx scripts/seed-lesson-planning.ts --profile fake
    
    log "Default admin account:"
    log "  URL: http://${HOST}:${PORT}/admin/login"
    log "  Email: admin@example.com"
    log "  Password: admin123"
    log "Seeded teacher accounts:"
    log "  Mia Hart: teacher.mia@example.com / teacher123"
    log "  Luca Vale: teacher.luca@example.com / teacher123"
    log "  Sarah Quinn: teacher.sarah@example.com / teacher123"
  fi

  if [[ "$SEED_MODE" == "docs-demo" ]]; then
    log "Seeding deterministic docs/demo dataset..."
    export NEXT_PUBLIC_SITE_URL="$SITE_URL"
    export DOCS_SCREENSHOTS_BASE_URL="$SITE_URL"
    export DOCS_SCREENSHOTS_ADMIN_EMAIL="$DOCS_DEMO_ADMIN_EMAIL"
    export DOCS_SCREENSHOTS_ADMIN_PASSWORD="$DOCS_DEMO_ADMIN_PASSWORD"
    export DOCS_SCREENSHOTS_STUDENT_PASSWORD="$DOCS_DEMO_STUDENT_PASSWORD"
    DATABASE_URL="${DB_URL}" npm run docs:screenshots:seed >/dev/null
    DATABASE_URL="${DB_URL}" npx tsx scripts/seed-lesson-planning.ts --profile docs-demo >/dev/null

    CHECKLIST_PATH="Documentation/assets/SCREENSHOT_SEED_CHECKLIST.md"
    STUDENT_NAME="$(sed -n 's/^- Student login name: `\(.*\)`/\1/p' "$CHECKLIST_PATH" | head -n 1)"
    STUDENT_POSTCODE="$(sed -n 's/^- Student postcode: `\(.*\)`/\1/p' "$CHECKLIST_PATH" | head -n 1)"

    log "Docs/demo admin account:"
    log "  URL: ${SITE_URL}/admin/login"
    log "  Email: ${DOCS_DEMO_ADMIN_EMAIL}"
    log "  Password: ${DOCS_DEMO_ADMIN_PASSWORD}"
    if [[ -n "$STUDENT_NAME" && -n "$STUDENT_POSTCODE" ]]; then
      log "Docs/demo student account:"
      log "  URL: ${SITE_URL}/student/login"
      log "  Login: ${STUDENT_NAME} / ${STUDENT_POSTCODE}"
      log "  Password: ${DOCS_DEMO_STUDENT_PASSWORD}"
    fi
  fi
}

run_seed_mode

# 7. Automated Testing
if [[ "$SKIP_TESTS" -eq 0 ]]; then
  log "Running automated tests..."
  # Set both variables to ensure Vitest uses the test database
  export DATABASE_URL="$TEST_DB_URL"
  export TEST_DATABASE_URL="$TEST_DB_URL"
  
  if ! npm test; then
    TESTS_FAILED=1
    # NOTE: The script keeps going after test failures so the same setup can be
    # reused for manual UI verification without rerunning all prep work.
    log "Automated tests failed. Continuing so you can still test the site manually."
  fi
fi

if [[ "$DEV_AND_TEST_SHARE_DB" -eq 1 && "$SEED_MODE" != "none" ]]; then
  log "Restoring seeded manual QA data after automated tests because dev/test share one database..."
  run_seed_mode
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
