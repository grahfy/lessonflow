# Specification: Updates Available Notification

## Overview
Add a proactive update management system to the LessonFlow admin console. This feature will notify administrators when new code is available in the repository, display the pending changes, and allow for a one-click update and restart process directly from the browser.

## Functional Requirements

### 1. Update Detection
- **Mechanism:** On page load of the Admin Dashboard, LessonFlow will perform a `git fetch` (non-blocking or cached) to compare the local `HEAD` with the remote `origin/main`.
- **Criteria:** If the remote has commits not present in the local branch, an "Update Available" state is triggered.

### 2. Admin Notification
- **UI Element:** A persistent, high-visibility banner at the top of the Admin Dashboard.
- **Content:** "A new version of LessonFlow is available. [View Changes] [Update Now]"
- **Conditional Visibility:** Only visible to users with administrative privileges.

### 3. Change Summary View
- **Trigger:** Clicking "View Changes" opens a modal or dedicated page.
- **Content:** A list of commit messages between the current local version and the latest remote version ("Pending Changes Only").
- **Commit Details:** Include date, author, and short SHA for each commit.

### 4. Interactive Update Process
- **Trigger:** Clicking "Update Now" (with a confirmation dialog).
- **Execution:**
    - Triggers a server-side process that wraps `deploy/update.sh`.
    - Leverages a non-interactive execution mode to avoid TTY prompts.
- **Real-time Progress Page:**
    - Redirects the user to an `/admin/updates/progress` page.
    - Displays live streaming logs (via SSE or polling) from the update script execution.
    - Shows clear status indicators: "Fetching Code", "Installing Dependencies", "Running Migrations", "Building App", "Restarting Service".
- **Restart Handling:** 
    - The application must handle the temporary 502/downtime during the build/restart phase gracefully on the progress page (e.g., with automatic reconnection/refresh).

## Technical Considerations
- **Permissions:** The web server user (`www-data`) will need restricted `sudo` access to run a specific non-interactive update wrapper script to allow `systemctl restart lessonflow`.
- **Concurrency:** Ensure only one update process can run at a time (lock file mechanism).
- **Security:** The update trigger endpoint must be strictly protected by admin session checks and CSRF protection.

## Acceptance Criteria
- [ ] Admin Dashboard shows banner when remote commits are found.
- [ ] "View Changes" correctly lists pending commit messages.
- [ ] "Update Now" triggers the deployment script and redirects to a progress page.
- [ ] Progress page shows real-time output from the `update.sh` script.
- [ ] Application successfully restarts and serves the new version.
- [ ] Non-admin users cannot see the banner or trigger updates.

## Out of Scope
- Automatic/Unattended updates (must be triggered by an admin).
- Rollback UI (rollbacks remain a CLI operation via `deploy/deploy.sh --rollback` for now).
- Updating from non-main branches.
