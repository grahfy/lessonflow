#!/bin/bash
set -euo pipefail

# This test ensures that the update.sh and deploy.sh scripts can be
# invoked for help/dry-run without requiring root or sudo.

echo "Running update.sh --help without sudo..."
if ! ./deploy/update.sh --help > /dev/null; then
    echo "ERROR: update.sh --help failed. It might be requiring sudo."
    exit 1
fi

echo "Running deploy.sh --help without sudo..."
if ! ./deploy/deploy.sh --help > /dev/null; then
    echo "ERROR: deploy.sh --help failed. It might be requiring sudo."
    exit 1
fi

echo "All tests passed. Scripts do not immediately demand sudo for basic operations."
