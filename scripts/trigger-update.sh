#!/bin/bash
# =============================================================================
# LessonFlow - Non-Interactive Update Wrapper
# =============================================================================
# This script is intended to be called by the Node.js API to trigger
# a system update without requiring TTY or user interaction.
# =============================================================================

set -euo pipefail

# Accept the repository path as the first argument, default to parent of script dir
REPO_ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Lock and log files stay in the app's data directory
APP_DATA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)/.data"
LOCK_FILE="${APP_DATA_DIR}/update.lock"
LOG_FILE="${APP_DATA_DIR}/update.log"
UPDATE_PID=""
INTERRUPT_CAUGHT=false

# Ensure APP_DATA_DIR exists
mkdir -p "${APP_DATA_DIR}"

# Check for lock file
if [ -f "$LOCK_FILE" ]; then
    # Check if process is actually running
    PID=$(cat "$LOCK_FILE")
    if ps -p "$PID" > /dev/null; then
        echo "Update already in progress (PID: $PID)"
        exit 1
    else
        echo "Stale lock file found, removing..."
        rm "$LOCK_FILE"
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"

cleanup_lock_file() {
    rm -f "$LOCK_FILE"
}

forward_interrupt_to_update() {
    local signal_name="$1"

    if [[ "${INTERRUPT_CAUGHT}" == true ]]; then
        return 0
    fi

    INTERRUPT_CAUGHT=true
    trap - INT TERM HUP

    if [[ -n "${UPDATE_PID}" ]]; then
        kill -TERM -- "-${UPDATE_PID}" 2>/dev/null || kill -TERM "${UPDATE_PID}" 2>/dev/null || true
        wait "${UPDATE_PID}" 2>/dev/null || true
    fi

    cleanup_lock_file
    echo "Update interrupted by ${signal_name}."
    exit 130
}

# Cleanup on exit
trap cleanup_lock_file EXIT
trap 'forward_interrupt_to_update INT' INT
trap 'forward_interrupt_to_update TERM' TERM
trap 'forward_interrupt_to_update HUP' HUP

echo "Starting update process at $(date)" > "$LOG_FILE"

# Trigger the main update script with non-interactive flags.
# --allow-dirty is included because the web server might have made 
# tiny environment-specific changes or tracking files.
# MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT=1 skips the .env review.
# Privileged operations happen inside deploy/update.sh via targeted sudo rules.
export MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT=1
export MGS_SKIP_SELF_UPDATE_KEYPRESS=1

cd "$REPO_ROOT"

# We use 'unbuffer' or just standard redirect if unbuffer is missing.
# We want the output to be unbuffered so the SSE stream feels real-time.
if command -v stdbuf >/dev/null 2>&1; then
    stdbuf -oL -eL ./deploy/update.sh --no-spinner --no-color --allow-dirty >> "$LOG_FILE" 2>&1 &
else
    ./deploy/update.sh --no-spinner --no-color --allow-dirty >> "$LOG_FILE" 2>&1 &
fi

UPDATE_PID=$!

wait "${UPDATE_PID}"
update_status=$?

cleanup_lock_file
echo "Update process finished at $(date)" >> "$LOG_FILE"
exit "${update_status}"
