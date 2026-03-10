# Specification: update_permissions_sudo_fix

## Overview
The current update script (`deploy/update.sh`) used for site deployments on the DigitalOcean VPS requires `sudo` privileges to execute correctly. This creates friction in the deployment workflow and potential security risks if the entire script runs as root. The goal is to adjust file/directory ownership and permissions so that the update process can be initiated by the standard deployment user without requiring `sudo` for the entire script.

## Functional Requirements
- Modify `deploy/update.sh` and related deployment logic to run without `sudo` where possible.
- Update directory ownership and permissions in the deployment target locations (e.g., the web root and symlink directories) to allow the deployment user to perform necessary actions (git pull, npm build, symlink swapping).
- Ensure the deployment user can restart services (e.g., via `systemctl`) if required, potentially using a targeted `sudoers` entry if ownership changes alone are insufficient.

## Non-Functional Requirements
- **Security:** Maintain the principle of least privilege. Do not grant broader root access than necessary.
- **Reliability:** The update process must remain robust and correctly handle symlink-based releases.

## Acceptance Criteria
1. The `deploy/update.sh` script can be executed by the deployment user without prefixing the entire command with `sudo`.
2. The script successfully performs a `git pull`, `npm install`, `npm run build`, and updates the release symlinks.
3. The application service restarts successfully following the update.
4. No unexpected permission errors occur during any phase of the deployment.

## Out of Scope
- Migrating to a different deployment platform (e.g., Vercel, AWS).
- Major refactoring of the deployment script's logic beyond permission-related changes.
