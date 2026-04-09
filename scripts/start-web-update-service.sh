#!/bin/bash
# =============================================================================
# LessonFlow - Systemd Web Update Entrypoint
# =============================================================================
# This wrapper is invoked by the host-level systemd unit used by the admin UI's
# "Update Now" action. It resolves the persistent git checkout from env and then
# delegates to scripts/trigger-update.sh so the existing lock/log flow remains
# unchanged.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="${UPDATES_GIT_REPO_PATH:-${APP_ROOT}}"

# RATIONALE: The systemd unit may run as root so swap/systemctl operations can
# succeed on low-memory hosts, while git writes stay pinned to the configured
# deploy user to avoid root-owned checkout state.
export MGS_SOURCE_GIT_USER="${MGS_SOURCE_GIT_USER:-${UPDATES_DEPLOY_USER:-}}"
export MGS_SUDO_USER="${MGS_SUDO_USER:-${UPDATES_DEPLOY_USER:-}}"

exec /usr/bin/env bash "${SCRIPT_DIR}/trigger-update.sh" "${REPO_ROOT}"
