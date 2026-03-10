#!/bin/bash
set -euo pipefail

SHARED_DIR="/tmp/lessonflow-env-test"
mkdir -p "$SHARED_DIR"
touch "$SHARED_DIR/.env"

shared_env_path="$SHARED_DIR/.env"
# Auto-generate CRON_SECRET if missing or empty
if ! grep -q "^[[:space:]]*CRON_SECRET=[^[:space:]]" "${shared_env_path}"; then
    new_secret="$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)"
    if grep -q "^[[:space:]]*CRON_SECRET=" "${shared_env_path}"; then
        sed -i "s/^[[:space:]]*CRON_SECRET=.*/CRON_SECRET=\"${new_secret}\"/" "${shared_env_path}"
    else
        echo "CRON_SECRET=\"${new_secret}\"" >> "${shared_env_path}"
    fi
    echo "Auto-generated CRON_SECRET in shared .env"
fi

cat "$shared_env_path"

rm -rf "$SHARED_DIR"
