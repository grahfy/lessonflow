---
type: debt
priority: high
created: 2026-03-04
status: implemented
tags: [student-portal, admin, api, contracts, refactor, typescript]
keywords: [refactor student portal due admin api changes, student portal contract drift, shared api schema]
patterns: [src/components/student-portal-client.tsx, src/components/student-materials-client.tsx, src/app/api/student/portal/route.ts, src/app/api/student/bookings/route.ts, src/lib/admin/use-bookings.ts, src/lib/admin/types.ts]
---

# DEBT: Refactor Student Portal for Admin/API Contract Changes

## Description

Refactor student portal data flow and types to align with current admin/API contract changes and prevent future drift.

## Context

Student portal clients currently define local payload types and directly fetch student routes, while admin-side evolution has introduced new fields/workflows over time. This creates risk of silent contract mismatch and brittle UI behavior.

## Requirements

### Functional Requirements
- Audit student portal payload contracts against current API route outputs.
- Introduce shared runtime schemas/types for student portal API payloads.
- Refactor portal UI to consume shared contracts (remove duplicated local type definitions where possible).
- Validate portal booking request/cancel flows still align with admin approval lifecycle.
- Ensure learning-material rendering remains correct for booking-linked and standalone materials.

### Non-Functional Requirements
- No regression in login/session behavior.
- Keep portal interactions performant and resilient to partial payload failures.
- Improve maintainability by reducing type duplication and implicit assumptions.

## Current State

`StudentPortalClient` includes inline payload type definitions and relies on route responses without shared schema validation. Contract evolution on admin/student routes can require manual synchronization.

## Desired State

Student portal and student API routes share validated schemas/types, with refactored client logic that remains stable as admin contracts evolve.

## Research Context

### Keywords to Search
- `PortalPayload` - locate duplicated client-side type assumptions.
- `/api/student/portal` - inspect authoritative response shape.
- `booking request` + `approval lifecycle` - verify end-to-end consistency.

### Patterns to Investigate
- `src/components/student-portal-client.tsx`
- `src/components/student-materials-client.tsx`
- `src/app/api/student/portal/route.ts`
- `src/app/api/student/bookings/route.ts`
- `src/lib/admin/use-bookings.ts`

### Key Decisions Made
- Treat this as debt/refactor with behavior parity requirements.
- Prioritize schema sharing and contract validation before UI restyling.
- Keep public/student auth model unchanged.

## Success Criteria

### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] Add/update tests for student portal payload parsing and booking request/cancel flows.
- [x] `npm run test`

### Manual Verification
- [x] Student login succeeds with valid credentials.
- [x] Student portal loads upcoming/previous bookings and materials correctly.
- [x] Student can submit pending booking request and see it reflected.
- [x] Student can cancel upcoming appointment and status updates correctly.

## Related Information

- Existing baseline ticket: `thoughts/tickets/2026-02-20-student-portal-login-learning-materials.md`
- `src/components/student-portal-client.tsx`
- `src/app/api/student/portal/route.ts`

## Notes

- Consider extracting shared student portal schemas into `src/lib/student-portal/` with Zod.
