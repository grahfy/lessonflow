#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${REPO_ROOT}/deploy/web-update.service.template"

grep -Fq "User=root" "${TEMPLATE}" || {
  echo "Expected web update service template to run as root"
  exit 1
}

grep -Fq "Environment=MGS_SOURCE_GIT_USER={{DEPLOY_USER}}" "${TEMPLATE}" || {
  echo "Expected web update service template to pin source git operations to the deploy user"
  exit 1
}

grep -Fq "Environment=MGS_SUDO_USER={{DEPLOY_USER}}" "${TEMPLATE}" || {
  echo "Expected web update service template to expose the deploy user for root-triggered update flows"
  exit 1
}

echo "Web update service template checks passed."
