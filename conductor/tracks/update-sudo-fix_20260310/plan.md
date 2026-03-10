# Implementation Plan: update_permissions_sudo_fix

## Phase 1: Research and Analysis [checkpoint: 0186dd4]
- [x] Task: Analyze current `deploy/update.sh` and identifying `sudo` usage.
- [x] Task: Map out required directory permissions for the deployment user.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Research and Analysis' (Protocol in workflow.md)

## Phase 2: Permission and Ownership Updates [checkpoint: 52c5021]
- [x] Task: Implement updates to directory ownership for deployment targets.
    - [x] Create a shell script/commands to set ownership to the deployment user.
- [x] Task: Configure targeted passwordless `sudo` for service restarts if necessary.
    - [x] Draft the `sudoers` entry for the specific service restart command.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Permission and Ownership Updates' (Protocol in workflow.md)

## Phase 3: Script Refactoring and Verification
- [ ] Task: Write Tests: Verify script execution without `sudo` (e.g., via a mock environment or dry-run).
- [ ] Task: Implement: Refactor `deploy/update.sh` to remove global `sudo` requirement.
- [ ] Task: Verify Green Phase: Ensure tests pass and the script executes as expected.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Script Refactoring and Verification' (Protocol in workflow.md)

## Phase 4: Final Documentation and Cleanup
- [ ] Task: Update deployment documentation (`Documentation/digitalocean-admin-operations.md`).
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Documentation and Cleanup' (Protocol in workflow.md)
