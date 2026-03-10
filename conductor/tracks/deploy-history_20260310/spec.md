# Specification: Deployment Update History

## Overview
Add a "History" tab to the "Latest Updates" popup in the admin console. This allows admins to view past deployments (up to 100) and the specific commits included in each. Deployment tracking will transition from a single JSON file to a database-backed system for improved reliability and history retention.

## Functional Requirements
1.  **Database Storage:**
    -   Store deployment metadata (`DeployUpdate`) and associated commits (`DeployCommit`) in the database using Prisma.
    -   Fields to capture: Branch, Release ID, Commit Hash, Short Hash, Previous Commit Hash, Applied At timestamp, and a list of commits (Subject, Author, Authored At, Body).
2.  **Deployment Integration:**
    -   Update the deployment process (`deploy/deploy.sh`) to record new deployments in the database.
    -   This will be achieved by calling a new internal API endpoint during the deployment process.
3.  **Admin API:**
    -   Update `/api/admin/deploy-updates/latest` to fetch the most recent deployment from the database.
    -   Create `/api/admin/deploy-updates/history` to return the last 100 deployments.
4.  **UI Enhancements:**
    -   Modify the `Latest Updates` popup (`AdminDeployUpdatesButton`) to include two tabs: "Latest" and "History".
    -   "Latest" tab: Retain the current view of the single most recent deployment.
    -   "History" tab: Show a list of past deployments. Each entry should be expandable to show the full commit list.
5.  **History Management:**
    -   Limit the history retrieved by the API to the last 100 entries.

## Non-Functional Requirements
-   **Performance:** The history list should load efficiently.
-   **Reliability:** Deployment recording should be best-effort and not halt the deployment if it fails.

## Acceptance Criteria
-   [ ] New deployments are automatically added to the database.
-   [ ] Admin UI shows a "Latest" tab with details of the most recent deploy.
-   [ ] Admin UI shows a "History" tab with a list of past deployments.
-   [ ] Clicking a historical deployment shows the commits included in that deploy.
-   [ ] The last 100 deployments are accessible.

## Out of Scope
-   Rollback functionality from the UI.
-   Detailed diffs of file changes (only commit metadata).
