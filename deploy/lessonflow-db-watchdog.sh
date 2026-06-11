#!/bin/bash
# =============================================================================
# LessonFlow - Database connectivity watchdog
# =============================================================================
# Self-healing guard for the main application's database connection pool.
#
# Background: the app keeps serving HTTP 200 even when it cannot reach MySQL
# (it renders a graceful "Admin service unavailable" fallback), so a plain
# HTTP health check does not notice an outage and systemd's Restart=on-failure
# never triggers. If MySQL is restarted, the Prisma/MariaDB pool can be left
# unable to re-establish connections and the app stays broken until manually
# restarted.
#
# This watchdog watches the app's journal for the database-failure signature
# and, ONLY when MySQL itself is confirmed to be up, restarts the app so it
# rebuilds its pool. It is a no-op while healthy, a no-op during a genuine
# MySQL outage (restarting the app would not help), and rate-limited so it can
# never enter a restart loop.
#
# Installed and scheduled via lessonflow-db-watchdog.{service,timer} (every
# minute). Runs as root: it needs journal read access, `mysqladmin ping` (root
# via auth_socket) and `systemctl restart`.
# =============================================================================
set -uo pipefail

SERVICE="${WATCHDOG_SERVICE:-lessonflow.service}"
WINDOW="${WATCHDOG_WINDOW:-2 min ago}"   # journal lookback window
THRESHOLD="${WATCHDOG_THRESHOLD:-3}"     # min DB errors in window before acting
COOLDOWN="${WATCHDOG_COOLDOWN:-600}"     # min seconds between auto-restarts
STATE="${WATCHDOG_STATE:-/run/lessonflow-watchdog.last-restart}"
TAG="lessonflow-watchdog"

log() { logger -t "${TAG}" -- "$*"; }

# 1. Count database-failure signatures the app emits when its pool cannot hand
#    out a connection.
errs=$(journalctl -u "${SERVICE}" --since "${WINDOW}" --no-pager 2>/dev/null \
  | grep -cE 'pool timeout|DB_UNAVAILABLE|DriverAdapterError' || true)
errs=${errs:-0}

[ "${errs}" -lt "${THRESHOLD}" ] && exit 0

# 2. Confirm MySQL is actually reachable. If the database itself is down,
#    restarting the app cannot help, so stand down and just record it.
if ! mysqladmin ping >/dev/null 2>&1; then
  log "DB errors=${errs} in last window but MySQL is not responding; treating as a database outage, NOT restarting ${SERVICE}."
  exit 0
fi

# 3. Cooldown guard so a persistently failing app can never be restart-looped.
now=$(date +%s)
last=0
[ -f "${STATE}" ] && last=$(cat "${STATE}" 2>/dev/null || echo 0)
case "${last}" in ''|*[!0-9]*) last=0 ;; esac
if [ $((now - last)) -lt "${COOLDOWN}" ]; then
  log "DB errors=${errs}, MySQL up, but last auto-restart was $((now - last))s ago (< ${COOLDOWN}s cooldown); skipping."
  exit 0
fi

# 4. Recover: MySQL is up but the app cannot use it -> restart to rebuild pool.
echo "${now}" > "${STATE}"
log "DB errors=${errs} in last window while MySQL is UP -> restarting ${SERVICE} to recover the database pool."
if systemctl restart "${SERVICE}"; then
  log "Restart of ${SERVICE} issued successfully."
else
  log "ERROR: systemctl restart ${SERVICE} failed."
fi
exit 0
