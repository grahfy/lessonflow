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

DEMO_ADMIN_EMAIL="${DOCS_SCREENSHOTS_ADMIN_EMAIL:-demo-admin@lessonflow.local}"
DEMO_ADMIN_PASSWORD="${DOCS_SCREENSHOTS_ADMIN_PASSWORD:-DemoAdmin!23}"
DEMO_STUDENT_PASSWORD="${DOCS_SCREENSHOTS_STUDENT_PASSWORD:-DemoStudent!23}"

log() { printf '[lessonflow-demo] %s\n' "$*"; }
error() { printf '[lessonflow-demo] ERROR: %s\n' "$*" >&2; }

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
docker run -d \
  --name "$CONTAINER_NAME" \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE="$DB_NAME" \
  -p "${DB_PORT}:3306" \
  mariadb:latest >/dev/null

log "Waiting for demo database..."
for attempt in $(seq 1 45); do
  if docker exec "$CONTAINER_NAME" bash -c "cat < /dev/null > /dev/tcp/localhost/3306" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$attempt" -eq 45 ]]; then
    error "Timed out waiting for demo database to start."
    exit 1
  fi
done

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
