#!/bin/bash
# =============================================================================
# LessonFlow - Non-Interactive Update Wrapper
# =============================================================================
# This script is intended to be called by the Node.js API to trigger
# a system update without requiring TTY or user interaction.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_FILE="${REPO_ROOT}/.data/update.lock"
LOG_FILE="${REPO_ROOT}/.data/update.log"

# Ensure .data exists
mkdir -p "${REPO_ROOT}/.data"

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

# Cleanup on exit
trap 'rm -f "$LOCK_FILE"' EXIT

echo "Starting update process at $(date)" > "$LOG_FILE"

# Trigger the main update script with non-interactive flags.
# --allow-dirty is included because the web server might have made 
# tiny environment-specific changes or tracking files.
# MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT=1 skips the .env review.
# sudo -n (non-interactive) is used for the actual deployment.
export MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT=1
export MGS_SKIP_SELF_UPDATE_KEYPRESS=1

cd "$REPO_ROOT"

# We use 'unbuffer' or just standard redirect if unbuffer is missing.
# We want the output to be unbuffered so the SSE stream feels real-time.
if command -v stdbuf >/dev/null 2>&1; then
    stdbuf -oL -eL ./deploy/update.sh --no-spinner --no-color --allow-dirty >> "$LOG_FILE" 2>&1
else
    ./deploy/update.sh --no-spinner --no-color --allow-dirty >> "$LOG_FILE" 2>&1
fi

echo "Update process finished at $(date)" >> "$LOG_FILE"
