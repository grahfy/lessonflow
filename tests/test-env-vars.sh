#!/bin/bash
set -euo pipefail

SHARED_DIR="/tmp/lessonflow-env-test2"
mkdir -p "$SHARED_DIR"
cat << 'ENV' > "$SHARED_DIR/.env"
CRON_SECRET="kwf0PF1P31lLBR4pB9ey2J8QZ4upIqVK"
NEXT_PUBLIC_SITE_URL="https://example.com"
ENV

read_env_file_value() {
    local env_file="$1"
    local key="$2"
    local line=""
    local value=""

    if [[ ! -f "${env_file}" ]]; then
        return 1
    fi

    line="$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "${env_file}" 2>/dev/null || true)"
    [[ -n "${line}" ]] || return 1

    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ ${#value} -ge 2 && "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
        value="${value:1:${#value}-2}"
    elif [[ ${#value} -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:${#value}-2}"
    fi

    printf '%s\n' "${value}"
}

env_cron_secret="${CRON_SECRET:-}"
env_site_url="${NEXT_PUBLIC_SITE_URL:-}"
if [[ -f "${SHARED_DIR}/.env" ]]; then
    [[ -z "${env_cron_secret}" ]] && env_cron_secret="$(read_env_file_value "${SHARED_DIR}/.env" "CRON_SECRET" || true)"
    [[ -z "${env_site_url}" ]] && env_site_url="$(read_env_file_value "${SHARED_DIR}/.env" "NEXT_PUBLIC_SITE_URL" || true)"
fi

echo "CRON: $env_cron_secret"
echo "SITE: $env_site_url"

rm -rf "$SHARED_DIR"
