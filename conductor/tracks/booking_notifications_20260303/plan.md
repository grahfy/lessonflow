# Implementation Plan: Consolidate and verify booking request notification workflows

This plan outlines the steps to audit, verify, and consolidate booking-related notification workflows in LessonFlow.

## Phase 1: Research & Audit [checkpoint: 9ce7093]
Identify and document all existing notification triggers and their current implementations.

- [x] Task: Audit `src/lib/booking-events.ts` and document all public functions and their parameters. [f68f8d8]
- [x] Task: Trace calls to `booking-events.ts` from API routes to identify all notification triggers. [746582b]
- [x] Task: Document the current state of error handling and audit logging for each trigger. [6f8c4e8]
- [x] Task: Conductor - User Manual Verification 'Research & Audit' (Protocol in workflow.md) [9ce7093]

## Phase 2: Baseline Testing [checkpoint: faeca3c]
Create integration tests to verify the current behavior of all identified notification flows.

- [x] Task: Write failing tests for booking request submission owner notifications. [017c922]
- [x] Task: Implement/verify owner notification tests. [00207d7]
- [x] Task: Write failing tests for customer notifications on status changes (Approve/Reject). [885ae21]
- [x] Task: Implement/verify status change notification tests. [c7c91fa]
- [x] Task: Write failing tests for customer notifications on booking moves. [d42fde5]
- [x] Task: Implement/verify booking move notification tests. [6b480cc]
- [x] Task: Conductor - User Manual Verification 'Baseline Testing' (Protocol in workflow.md) [faeca3c]

## Phase 3: Consolidation & Refinement [checkpoint: 9aa1e63]
Address inconsistencies and improve error handling or logging based on audit findings.

- [x] Task: Standardize error handling across all notification wrappers in `src/lib/booking-events.ts`. [d644b8d]
- [x] Task: Ensure consistent audit logging for all outbound notifications. [3d0b191]
- [x] Task: Refactor API routes to use consolidated notification helpers if redundant logic is found. [3d0b191]
- [x] Task: Conductor - User Manual Verification 'Consolidation & Refinement' (Protocol in workflow.md) [9aa1e63]

## Phase 4: Final Verification
Ensure the entire notification system is robust and well-tested.

- [x] Task: Verify >80% test coverage for notification-related logic. [04535a5]
- [~] Task: Perform final E2E manual verification of all notification flows.
- [ ] Task: Conductor - User Manual Verification 'Final Verification' (Protocol in workflow.md)
