# Implementation Plan: Deployment Update History

This plan outlines the steps to transition deployment tracking to the database and add a history view to the admin console.

## Phase 1: Database and API Infrastructure
Implement the data models and backend endpoints for recording and retrieving deployments.

- [ ] Task: Create Prisma migration for `DeployUpdate` and `DeployCommit`
    - [ ] Add models to `schema.prisma`
    - [ ] Run `npx prisma migrate dev --name add_deploy_tracking`
- [ ] Task: Create internal API for recording deployments
    - [ ] Implement `src/app/api/admin/deploy-updates/record/route.ts`
    - [ ] Require a shared secret (e.g., `CRON_SECRET` or new `DEPLOY_SECRET`) for authorization
- [ ] Task: Update `/api/admin/deploy-updates/latest`
    - [ ] Modify to fetch the latest entry from the database instead of the JSON file
- [ ] Task: Create `/api/admin/deploy-updates/history`
    - [ ] Implement to return the last 100 deployments with their commits
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database and API Infrastructure' (Protocol in workflow.md)

## Phase 2: Deployment Process Integration
Update the deployment scripts to use the new database-backed tracking.

- [ ] Task: Modify `deploy/deploy.sh` to record deployment
    - [ ] Update `write_latest_deploy_update_metadata` to call the new record API using `curl`
    - [ ] (Optional) Keep writing to the JSON file as a local backup/fallback
- [ ] Task: Verify deployment recording in a simulated environment
    - [ ] Use a test script to trigger the record API and verify DB entries
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Deployment Process Integration' (Protocol in workflow.md)

## Phase 3: UI Implementation
Add the history view and tabbed navigation to the admin console.

- [ ] Task: Add tabbed navigation to `AdminDeployUpdatesButton`
    - [ ] Implement state for active tab ("Latest" vs "History")
    - [ ] Style tabs using project conventions
- [ ] Task: Implement History view
    - [ ] Create a component to render the list of past deployments
    - [ ] Add expand/collapse logic for commit lists in the history view
- [ ] Task: Connect History view to API
    - [ ] Fetch data from `/api/admin/deploy-updates/history` when the tab is active
- [ ] Task: Conductor - User Manual Verification 'Phase 3: UI Implementation' (Protocol in workflow.md)

## Phase 4: Final Cleanup and Verification
Ensure everything is working correctly and clean up legacy logic.

- [ ] Task: Verify full end-to-end flow
    - [ ] Simulate a deployment and check both "Latest" and "History" tabs
- [ ] Task: (Optional) Migrate existing JSON metadata to the database
    - [ ] Create a one-time script to seed the DB from the current `latest-deploy-update.json`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Cleanup and Verification' (Protocol in workflow.md)
