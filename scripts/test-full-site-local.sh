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
UNAME_S="$(uname -s)"
PREFER_HOST_NETWORK=0

if [[ "${LOCAL_MYSQL_NETWORK_MODE:-auto}" == "host" ]]; then
  PREFER_HOST_NETWORK=1
elif [[ "${LOCAL_MYSQL_NETWORK_MODE:-auto}" == "auto" && "$UNAME_S" == "Linux" ]]; then
  # RATIONALE: In some Linux environments Docker's published-port path accepts
  # TCP but never completes the MariaDB handshake, which blocks Prisma.
  PREFER_HOST_NETWORK=1
fi

log() { printf '[local-full-site] %s\n' "$*"; }
error() { printf '[local-full-site] ERROR: %s\n' "$*" >&2; }

parse_db_url_host_port() {
  local db_url=$1
  local host_port

  host_port=$(printf '%s' "$db_url" | sed -E 's#^[a-zA-Z0-9+.-]+://[^@]+@\[?([^]/:]+)\]?:([0-9]+).*$#\1 \2#')
  if [[ -z "$host_port" || "$host_port" == "$db_url" ]]; then
    error "Could not parse host/port from database URL: $db_url"
    return 1
  fi

  printf '%s\n' "$host_port"
}

wait_for_db_port() {
  local label=$1
  local db_url=$2
  local max_retries=${3:-45}
  local parsed host port attempt

  parsed=$(parse_db_url_host_port "$db_url") || return 1
  read -r host port <<<"$parsed"

  log "Waiting for ${label} host port ${host}:${port}..."
  for attempt in $(seq 1 "$max_retries"); do
    if bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  error "Timed out waiting for ${label} host port ${host}:${port}"
  return 1
}

host_mysql_greeting_available() {
  local host=$1
  local port=$2

  NODE_HOST="$host" NODE_PORT="$port" node - <<'EOF' >/dev/null 2>&1
const net = require("net");

const socket = net.createConnection({
  host: process.env.NODE_HOST,
  port: Number(process.env.NODE_PORT),
});
socket.setTimeout(2500);
socket.on("data", () => { socket.end(); process.exit(0); });
socket.on("timeout", () => { socket.destroy(); process.exit(1); });
socket.on("error", () => process.exit(1));
socket.on("close", () => process.exit(1));
EOF
}

wait_for_prisma_db() {
  local label=$1
  local db_url=$2
  local max_retries=${3:-45}
  local command_timeout=${4:-5}
  local attempt

  log "Waiting for Prisma connectivity to ${label}..."
  for attempt in $(seq 1 "$max_retries"); do
    if printf 'SELECT 1;\n' | DATABASE_URL="$db_url" timeout "${command_timeout}s" npx prisma db execute --stdin >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  error "Timed out waiting for Prisma connectivity to ${label}"
  return 1
}

run_prisma_migrate_with_optional_fallback() {
  local label=$1
  local db_url=$2
  local allow_db_push_fallback=${3:-0}
  local status=0

  if DATABASE_URL="$db_url" npx prisma migrate deploy >/dev/null; then
    return 0
  fi
  status=$?

  if [[ "$allow_db_push_fallback" != "1" || "${TEST_DB_PREPARE_ALLOW_DB_PUSH_FALLBACK:-1}" == "0" ]]; then
    return "$status"
  fi

  printf '\n' >&2
  printf 'test:prepare fallback: prisma migrate deploy failed for the test database.\n' >&2
  printf 'Attempting `prisma db push` for ephemeral test DB bootstrap.\n' >&2
  printf 'Set TEST_DB_PREPARE_ALLOW_DB_PUSH_FALLBACK=0 to disable this fallback.\n' >&2
  printf '\n' >&2

  DATABASE_URL="$db_url" npx prisma db push >/dev/null
}

wait_for_container_mariadb() {
  local svc=$1
  local host_port=$2
  local max_retries=45
  local retry=0
  local mariadb_ping_args=(/usr/bin/mariadb-admin ping -u root -proot)

  if [[ "$PREFER_HOST_NETWORK" -eq 1 ]]; then
    mariadb_ping_args+=(-h 127.0.0.1 -P "$host_port")
  else
    mariadb_ping_args+=(-h 127.0.0.1)
  fi

  if ! docker exec "$svc" "${mariadb_ping_args[@]}" >/dev/null 2>&1; then
    log "Waiting for ${svc} container-local MariaDB..."
    while [[ $retry -lt $max_retries ]]; do
      if docker exec "$svc" "${mariadb_ping_args[@]}" >/dev/null 2>&1; then
        break
      fi
      retry=$((retry + 1))
      sleep 1
    done

    if [[ $retry -ge $max_retries ]]; then
      error "Timeout waiting for $svc to start"
      return 1
    fi
  fi

  log "$svc container-local MariaDB is ready"
}

run_mariadb_container() {
  local svc=$1
  local host_port=$2
  local db_name=$3

  if [[ "$PREFER_HOST_NETWORK" -eq 1 ]]; then
    docker run -d --name "$svc" \
      --network host \
      -e MYSQL_ROOT_PASSWORD=root \
      -e MYSQL_DATABASE="$db_name" \
      -e MYSQL_TCP_PORT="$host_port" \
      mariadb:latest --port="$host_port" >/dev/null
  else
    docker run -d --name "$svc" \
      -e MYSQL_ROOT_PASSWORD=root \
      -e MYSQL_DATABASE="$db_name" \
      -p "${host_port}:3306" \
      mariadb:latest >/dev/null
  fi
}

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
  local host_port=$2
  local db_name=$3
  local network_mode=""
  
  log "Checking container: $svc..."
  
  if docker ps --format "{{.Names}}" | grep -q "^${svc}$"; then
    log "$svc is already running"
  elif docker ps -a --format "{{.Names}}" | grep -q "^${svc}$"; then
    # RATIONALE: Reusing containers keeps repeated smoke runs fast and avoids
    # wiping a developer's local databases unless they explicitly opt in.
    log "Starting existing $svc container..."
    docker start "$svc" >/dev/null
  else
    log "Creating and starting container: $svc on port $host_port"
    run_mariadb_container "$svc" "$host_port" "$db_name"
  fi

  if [[ "$PREFER_HOST_NETWORK" -eq 1 ]]; then
    network_mode=$(docker inspect "$svc" --format '{{.HostConfig.NetworkMode}}' 2>/dev/null || true)
    if [[ "$network_mode" != "host" ]]; then
      log "Recreating $svc with Docker host networking because Linux smoke runs require direct MariaDB access for Prisma."
      log "This replaces the existing local smoke DB container to restore Prisma connectivity."
      docker rm -f "$svc" >/dev/null
      run_mariadb_container "$svc" "$host_port" "$db_name"
    fi
  fi
  
  wait_for_container_mariadb "$svc" "$host_port" || return 1

  if [[ "$PREFER_HOST_NETWORK" -eq 1 ]] && ! host_mysql_greeting_available "127.0.0.1" "$host_port"; then
    error "Docker is exposing ${svc} on ${host_port}, but the host is not receiving the MariaDB greeting. Prisma will not be able to connect."
    return 1
  fi
}

start_mariadb_container "lessonflow-dev-mysql" 3306 "mgs_dev" || exit 1
start_mariadb_container "lessonflow-test-mysql" 3307 "mgs_test" || exit 1
wait_for_db_port "dev database" "$DB_URL" || exit 1
wait_for_db_port "test database" "$TEST_DB_URL" || exit 1
wait_for_prisma_db "dev database" "$DB_URL" || exit 1
wait_for_prisma_db "test database" "$TEST_DB_URL" || exit 1

# 5. Database Initialization
log "Running Prisma migrations on test database..."
run_prisma_migrate_with_optional_fallback "test database" "$TEST_DB_URL" 1

log "Running Prisma migrations on dev database..."
run_prisma_migrate_with_optional_fallback "dev database" "$DB_URL"

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

  log "Importing bundled chord library..."
  DATABASE_URL="${DB_URL}" npm run chords:seed >/dev/null
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
