#!/bin/bash
set -euo pipefail

TEST_DEPLOY_DIR="/tmp/lessonflow-deploy-test"
mkdir -p "${TEST_DEPLOY_DIR}"
export DEPLOY_DIR="${TEST_DEPLOY_DIR}"
export MGS_SKIP_DEPLOY_SHARED_ENV_REVIEW_PROMPT=1

echo "Running deploy.sh in test directory..."
bash ./deploy/deploy.sh --skip-deps --skip-migrate --no-spinner --no-auto-bootstrap --skip-cron

echo "Full dry-run passed."
rm -rf "${TEST_DEPLOY_DIR}"
