# Implementation Plan: Updates Available Notification

This plan outlines the steps to implement a proactive update management system in LessonFlow, allowing admins to detect, review, and apply repository updates directly from the web console.

## Phase 1: Update Detection and Metadata Service [checkpoint: ec95206]
Implement the backend logic to detect pending repository updates and retrieve commit details.

- [x] Task: Create `src/lib/services/updates-service.ts` to manage update detection
    - [x] Implement `getUpdateStatus()` to compare local HEAD with `origin/main`
    - [x] Implement `getPendingCommits()` to retrieve messages between local and remote
    - [x] Add caching (e.g., 5-minute TTL) to prevent excessive `git fetch` calls
- [x] Task: Create API route `GET /api/admin/updates/status`
    - [x] Return update availability and pending commit list
    - [x] Enforce strict admin session verification
- [x] Task: Write Tests for Update Service
    - [x] Mock `child_process.exec` to simulate various git states
    - [x] Verify correct SHA comparison and commit list parsing
- [x] Task: Conductor - User Manual Verification 'Phase 1: Update Detection and Metadata Service' (Protocol in workflow.md)

## Phase 2: Admin UI Integration (Banner and Changes Modal) [checkpoint: 0ed695a]
Surface the update availability to administrators through a persistent dashboard banner.

- [x] Task: Create `UpdateNotificationBanner` component
    - [x] Fetch status from `/api/admin/updates/status` on mount
    - [x] Display high-visibility banner if update is available
- [x] Task: Integrate banner into `src/components/admin/layout/admin-shell.tsx`
    - [x] Ensure it appears above the main content but below the header
- [x] Task: Create `PendingChangesModal` component
    - [x] Display the list of pending commits (author, date, message)
    - [x] Add "Update Now" button with secondary confirmation dialog
- [x] Task: Write Tests for Update UI
    - [x] Verify banner appears only when updates are available
    - [x] Verify modal correctly renders commit data
- [x] Task: Conductor - User Manual Verification 'Phase 2: Admin UI Integration (Banner and Changes Modal)' (Protocol in workflow.md)

## Phase 3: Secure Update Trigger & Script Wrapper [checkpoint: da38772]
Implement the mechanism to safely trigger the server-side deployment script.

- [x] Task: Create non-interactive update wrapper `scripts/trigger-update.sh`
    - [x] Call `deploy/update.sh --non-interactive` (or equivalent)
    - [x] Ensure it runs with appropriate permissions
- [x] Task: Implement Update Execution API `POST /api/admin/updates/execute`
    - [x] Implement process locking (prevent multiple concurrent updates)
    - [x] Trigger the wrapper script and capture output to a temporary log file
- [x] Task: Implement Log Streaming Route `GET /api/admin/updates/stream`
    - [x] Use Server-Sent Events (SSE) to stream the update log file content to the client
- [x] Task: Write Tests for Update Execution
    - [x] Verify admin authorization
    - [x] Verify process locking behavior
- [x] Task: Conductor - User Manual Verification 'Phase 3: Secure Update Trigger & Script Wrapper' (Protocol in workflow.md)

## Phase 4: Progress UI & Restart Handling
Create the real-time feedback UI for the update process and handle the application restart.

- [x] Task: Create `/admin/updates/progress` page
    - [x] Connect to `/api/admin/updates/stream` SSE endpoint
    - [x] Render a scrolling log view of the deployment process
    - [x] Show a "Restarting..." state when the build is complete
- [x] Task: Implement Graceful Reconnection Logic
    - [x] If the connection drops (during restart), poll the health check endpoint
    - [x] Redirect back to the dashboard once LessonFlow is back online
- [x] Task: Final Integration & Cleanup
    - [x] Ensure `deploy/update.sh` correctly writes metadata used by the existing "Latest Updates" popup
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Progress UI & Restart Handling' (Protocol in workflow.md)
