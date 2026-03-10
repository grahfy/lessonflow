# Plan: Admin Booking Popup UI Re-adjustment

## Phase 1: Research and Baseline Verification
- [x] Task: Identify the specific component and styles for the Admin Booking Popup.
- [x] Task: Create a reproduction test using Playwright to verify the current "overflowing" state (scrolling required).
- [x] Task: Conductor - User Manual Verification 'Phase 1: Research and Baseline Verification' (Protocol in workflow.md)

## Phase 2: Compact UI Implementation (TDD)
- [x] Task: Write failing unit/integration tests for the compact layout requirements (e.g., verifying max-height or visibility properties).
- [x] Task: Implement CSS changes to condense the booking popup components.
- [x] Task: Adjust the "Lesson Notes" component to occupy less initial vertical space.
- [x] Task: Verify that "Lesson Config" and action buttons are visible without scrolling.
- [x] Task: Refactor styles for better maintainability and alignment with the compact design.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Compact UI Implementation (TDD)' (Protocol in workflow.md)

## Phase 3: Final Verification and Documentation
- [x] Task: Update the Playwright E2E test to confirm the fix across targeted resolutions.
- [x] Task: Update any relevant project documentation if styling patterns have changed significantly.
- [x] Task: Conductor - User Manual Verification 'Phase 3: Final Verification and Documentation' (Protocol in workflow.md)
