#!/bin/bash
# Sets up permissions for the deployment directory so that the deployment user
# can run the update script without sudo.

set -euo pipefail

DEPLOY_DIR="/var/www/lessonflow"
TARGET_USER="${1:-${SUDO_USER:-$USER}}"

if [[ "${TARGET_USER}" == "root" ]]; then
    echo "Error: Target user cannot be root. Specify the deployment user as an argument."
    echo "Usage: sudo ./setup-permissions.sh <username>"
    exit 1
fi

echo "Setting up deployment permissions for user: ${TARGET_USER} in ${DEPLOY_DIR}"

if [[ ! -d "${DEPLOY_DIR}" ]]; then
    echo "Deploy directory ${DEPLOY_DIR} does not exist. Creating it..."
    mkdir -p "${DEPLOY_DIR}"
fi

# Add the deployment user to the www-data group
if getent group www-data > /dev/null; then
    usermod -aG www-data "${TARGET_USER}"
    echo "Added ${TARGET_USER} to www-data group."
else
    echo "Warning: www-data group does not exist."
fi

# Change ownership of the deploy directory
chown -R "${TARGET_USER}:www-data" "${DEPLOY_DIR}"
echo "Changed ownership of ${DEPLOY_DIR} to ${TARGET_USER}:www-data."

# Set group writable and setgid bit so new files inherit www-data group
find "${DEPLOY_DIR}" -type d -exec chmod 2775 {} \+
find "${DEPLOY_DIR}" -type f -exec chmod 0664 {} \+
echo "Set group write permissions and setgid bit on directories in ${DEPLOY_DIR}."

echo "Permissions setup complete."
echo "Note: The user '${TARGET_USER}' may need to log out and back in for group changes to take effect."
