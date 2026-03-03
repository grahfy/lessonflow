# Implementation Plan: Consolidate and verify booking request notification workflows

This plan outlines the steps to audit, verify, and consolidate booking-related notification workflows in LessonFlow.

## Phase 1: Research & Audit
Identify and document all existing notification triggers and their current implementations.

- [x] Task: Audit `src/lib/booking-events.ts` and document all public functions and their parameters. [f68f8d8]
- [ ] Task: Trace calls to `booking-events.ts` from API routes to identify all notification triggers.
- [ ] Task: Document the current state of error handling and audit logging for each trigger.
- [ ] Task: Conductor - User Manual Verification 'Research & Audit' (Protocol in workflow.md)

## Phase 2: Baseline Testing
Create integration tests to verify the current behavior of all identified notification flows.

- [ ] Task: Write failing tests for booking request submission owner notifications.
- [ ] Task: Implement/verify owner notification tests.
- [ ] Task: Write failing tests for customer notifications on status changes (Approve/Reject).
- [ ] Task: Implement/verify status change notification tests.
- [ ] Task: Write failing tests for customer notifications on booking moves.
- [ ] Task: Implement/verify booking move notification tests.
- [ ] Task: Conductor - User Manual Verification 'Baseline Testing' (Protocol in workflow.md)

## Phase 3: Consolidation & Refinement
Address inconsistencies and improve error handling or logging based on audit findings.

- [ ] Task: Standardize error handling across all notification wrappers in `src/lib/booking-events.ts`.
- [ ] Task: Ensure consistent audit logging for all outbound notifications.
- [ ] Task: Refactor API routes to use consolidated notification helpers if redundant logic is found.
- [ ] Task: Conductor - User Manual Verification 'Consolidation & Refinement' (Protocol in workflow.md)

## Phase 4: Final Verification
Ensure the entire notification system is robust and well-tested.

- [ ] Task: Verify >80% test coverage for notification-related logic.
- [ ] Task: Perform final E2E manual verification of all notification flows.
- [ ] Task: Conductor - User Manual Verification 'Final Verification' (Protocol in workflow.md)
