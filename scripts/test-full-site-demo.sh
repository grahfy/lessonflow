#!/usr/bin/env bash
set -euo pipefail

# Ephemeral LessonFlow demo launcher.
# Starts a dedicated local MySQL/MariaDB container, seeds a rich demo dataset,
# launches the app, and destroys the demo database when the session ends.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
DB_PORT="${DEMO_DB_PORT:-3308}"
CONTAINER_NAME="${DEMO_DB_CONTAINER:-lessonflow-demo-mysql}"
DB_NAME="${DEMO_DB_NAME:-lessonflow_demo}"
DB_URL="mysql://root:root@127.0.0.1:${DB_PORT}/${DB_NAME}"
SITE_URL="http://${HOST}:${PORT}"
SKIP_INSTALL=0
NO_START=0
UNAME_S="$(uname -s)"
PREFER_HOST_NETWORK=0

if [[ "${LOCAL_MYSQL_NETWORK_MODE:-auto}" == "host" ]]; then
  PREFER_HOST_NETWORK=1
elif [[ "${LOCAL_MYSQL_NETWORK_MODE:-auto}" == "auto" && "$UNAME_S" == "Linux" ]]; then
  PREFER_HOST_NETWORK=1
fi

DEMO_ADMIN_EMAIL="${DOCS_SCREENSHOTS_ADMIN_EMAIL:-demo-admin@lessonflow.local}"
DEMO_ADMIN_PASSWORD="${DOCS_SCREENSHOTS_ADMIN_PASSWORD:-DemoAdmin!23}"
DEMO_STUDENT_PASSWORD="${DOCS_SCREENSHOTS_STUDENT_PASSWORD:-DemoStudent!23}"

log() { printf '[lessonflow-demo] %s\n' "$*"; }
error() { printf '[lessonflow-demo] ERROR: %s\n' "$*" >&2; }

wait_for_host_port() {
  local label=$1
  local host=$2
  local port=$3
  local max_retries=${4:-45}
  local attempt

  log "Waiting for ${label} host port ${host}:${port}..."
  for attempt in $(seq 1 "$max_retries"); do
    if bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  error "Timed out waiting for ${label} host port ${host}:${port}."
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

  error "Timed out waiting for Prisma connectivity to ${label}."
  return 1
}

cleanup() {
  log "Resetting demo environment..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap 'cleanup' EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1; shift ;;
    --no-start) NO_START=1; shift ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/test-full-site-demo.sh [--skip-install] [--no-start]

Starts an ephemeral LessonFlow demo:
- seeds demo data
- allows data changes during the session
- resets completely when the session ends

Environment overrides:
  HOST=127.0.0.1
  PORT=3000
  DEMO_DB_PORT=3308
  DOCS_SCREENSHOTS_ADMIN_EMAIL=demo-admin@lessonflow.local
  DOCS_SCREENSHOTS_ADMIN_PASSWORD=DemoAdmin!23
  DOCS_SCREENSHOTS_STUDENT_PASSWORD=DemoStudent!23
EOF
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  error "Docker is not installed. Please install Docker to run the demo database."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  error "Docker is not running. Please start Docker Desktop/Engine."
  exit 1
fi

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  log "Installing dependencies..."
  npm ci --no-fund --no-audit --loglevel=error
fi

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

if docker ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
  log "Removing previous demo container..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

log "Starting dedicated demo database on port ${DB_PORT}..."
if [[ "$PREFER_HOST_NETWORK" -eq 1 ]]; then
  docker run -d \
    --name "$CONTAINER_NAME" \
    --network host \
    -e MYSQL_ROOT_PASSWORD=root \
    -e MYSQL_DATABASE="$DB_NAME" \
    -e MYSQL_TCP_PORT="$DB_PORT" \
    mariadb:latest --port="$DB_PORT" >/dev/null
else
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e MYSQL_ROOT_PASSWORD=root \
    -e MYSQL_DATABASE="$DB_NAME" \
    -p "${DB_PORT}:3306" \
    mariadb:latest >/dev/null
fi

log "Waiting for demo database..."
for attempt in $(seq 1 45); do
  if [[ "$PREFER_HOST_NETWORK" -eq 1 ]]; then
    if docker exec "$CONTAINER_NAME" /usr/bin/mariadb-admin ping -h 127.0.0.1 -P "$DB_PORT" -u root -proot >/dev/null 2>&1; then
      break
    fi
  elif docker exec "$CONTAINER_NAME" /usr/bin/mariadb-admin ping -h 127.0.0.1 -u root -proot >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$attempt" -eq 45 ]]; then
    error "Timed out waiting for demo database to start."
    exit 1
  fi
done

if [[ "$PREFER_HOST_NETWORK" -eq 1 ]]; then
  if ! host_mysql_greeting_available "127.0.0.1" "$DB_PORT"; then
    error "Docker is exposing the demo database on ${DB_PORT}, but the host is not receiving the MariaDB greeting."
    exit 1
  fi
else
  wait_for_host_port "demo database" "127.0.0.1" "$DB_PORT" || exit 1
fi
wait_for_prisma_db "demo database" "$DB_URL" || exit 1

export DATABASE_URL="$DB_URL"
export NEXT_PUBLIC_SITE_URL="$SITE_URL"
export ADMIN_EMAIL="$DEMO_ADMIN_EMAIL"
export ADMIN_SESSION_SECRET="${ADMIN_SESSION_SECRET:-lessonflow-demo-admin-session-secret-0123456789}"
export STUDENT_SESSION_SECRET="${STUDENT_SESSION_SECRET:-lessonflow-demo-student-session-secret-0123456789}"
export STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY="${STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY:-lessonflow-demo-student-portal-encryption-key-0123456789}"
export DOCS_SCREENSHOTS_ADMIN_EMAIL="$DEMO_ADMIN_EMAIL"
export DOCS_SCREENSHOTS_ADMIN_PASSWORD="$DEMO_ADMIN_PASSWORD"
export DOCS_SCREENSHOTS_STUDENT_PASSWORD="$DEMO_STUDENT_PASSWORD"
export DOCS_SCREENSHOTS_BASE_URL="$SITE_URL"

log "Running database migrations..."
npx prisma migrate deploy >/dev/null

log "Generating Prisma client..."
npx prisma generate >/dev/null

log "Seeding whitelabel defaults..."
npx tsx scripts/seed-whitelabel-defaults.ts >/dev/null

log "Seeding lesson info / prices..."
npx tsx scripts/seed-lesson-pricing.ts >/dev/null

log "Seeding demo dataset..."
npx tsx scripts/seed-docs-screenshots.ts >/dev/null

CHECKLIST_PATH="Documentation/assets/SCREENSHOT_SEED_CHECKLIST.md"
STUDENT_NAME="$(sed -n 's/^- Student login name: `\(.*\)`/\1/p' "$CHECKLIST_PATH" | head -n 1)"
STUDENT_POSTCODE="$(sed -n 's/^- Student postcode: `\(.*\)`/\1/p' "$CHECKLIST_PATH" | head -n 1)"

log "Demo is ready."
log "Frontend preview: ${SITE_URL}/"
log "Admin preview: ${SITE_URL}/admin/login"
log "Student preview: ${SITE_URL}/student/login"
log "Admin credentials: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}"
if [[ -n "$STUDENT_NAME" && -n "$STUDENT_POSTCODE" ]]; then
  log "Student credentials: ${STUDENT_NAME} / ${STUDENT_POSTCODE} / ${DEMO_STUDENT_PASSWORD}"
fi
log "This demo resets completely when the session ends."

if [[ "$NO_START" -eq 1 ]]; then
  log "Demo prepared. Dev server start skipped (--no-start)."
  exit 0
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -Pi :"$PORT" -sTCP:LISTEN -t >/dev/null; then
    log "Port ${PORT} is in use, freeing it..."
    lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

log "Starting LessonFlow demo at ${SITE_URL}"
log "Press Ctrl+C to end the session and reset the demo."
npm run dev -- --hostname "$HOST" --port "$PORT"
