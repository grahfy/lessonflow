# Implementation Plan: Deployment Update History

This plan outlines the steps to transition deployment tracking to the database and add a history view to the admin console.

## Phase 1: Database and API Infrastructure [checkpoint: aae1040]
Implement the data models and backend endpoints for recording and retrieving deployments.

- [x] Task: Create Prisma migration for `DeployUpdate` and `DeployCommit` (aae1040)
    - [x] Add models to `schema.prisma` (aae1040)
    - [x] Run `npx prisma migrate dev --name add_deploy_tracking` (aae1040)
- [x] Task: Create internal API for recording deployments (aae1040)
    - [x] Implement `src/app/api/admin/deploy-updates/record/route.ts` (aae1040)
    - [x] Require a shared secret (e.g., `CRON_SECRET` or new `DEPLOY_SECRET`) for authorization (aae1040)
- [x] Task: Update `/api/admin/deploy-updates/latest` (aae1040)
    - [x] Modify to fetch the latest entry from the database instead of the JSON file (aae1040)
- [x] Task: Create `/api/admin/deploy-updates/history` (aae1040)
    - [x] Implement to return the last 100 deployments with their commits (aae1040)
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database and API Infrastructure' (Protocol in workflow.md) (aae1040)

## Phase 2: Deployment Process Integration [checkpoint: aae1040]
Update the deployment scripts to use the new database-backed tracking.

- [x] Task: Modify `deploy/deploy.sh` to record deployment (aae1040)
    - [x] Update `write_latest_deploy_update_metadata` to call the new record API using `curl` (aae1040)
    - [x] (Optional) Keep writing to the JSON file as a local backup/fallback (aae1040)
- [x] Task: Verify deployment recording in a simulated environment (aae1040)
    - [x] Use a test script to trigger the record API and verify DB entries (aae1040)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Deployment Process Integration' (Protocol in workflow.md) (aae1040)

## Phase 3: UI Implementation [checkpoint: aae1040]
Add the history view and tabbed navigation to the admin console.

- [x] Task: Add tabbed navigation to `AdminDeployUpdatesButton` (aae1040)
    - [x] Implement state for active tab ("Latest" vs "History") (aae1040)
    - [x] Style tabs using project conventions (aae1040)
- [x] Task: Implement History view (aae1040)
    - [x] Create a component to render the list of past deployments (aae1040)
    - [x] Add expand/collapse logic for commit lists in the history view (aae1040)
- [x] Task: Connect History view to API (aae1040)
    - [x] Fetch data from `/api/admin/deploy-updates/history` when the tab is active (aae1040)
- [x] Task: Conductor - User Manual Verification 'Phase 3: UI Implementation' (Protocol in workflow.md) (aae1040)

## Phase 4: Final Cleanup and Verification
Ensure everything is working correctly and clean up legacy logic.

- [ ] Task: Verify full end-to-end flow
    - [ ] Simulate a deployment and check both "Latest" and "History" tabs
- [ ] Task: (Optional) Migrate existing JSON metadata to the database
    - [ ] Create a one-time script to seed the DB from the current `latest-deploy-update.json`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Cleanup and Verification' (Protocol in workflow.md)
