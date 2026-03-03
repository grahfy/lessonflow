# Track Specification: Consolidate and verify booking request notification workflows

## Context
LessonFlow handles booking requests and appointments through several stages: submission, approval, rejection, moving, and reminders. Each stage triggers notifications to either the school owner or the customer. Currently, these triggers are spread across multiple API routes and services.

## Goals
- Ensure all booking-related notification triggers are identified and verified.
- Consolidate notification logic to ensure consistent behavior, error handling, and audit logging.
- Verify that notifications are delivered correctly (or logged appropriately if delivery fails).

## Scope
- **Triggers to Audit:**
  - New booking request submission (Owner notification).
  - Admin approval of a booking request (Customer notification).
  - Admin rejection of a booking request (Customer notification).
  - Admin moving/rescheduling a booking (Customer notification).
  - Admin sending a manual reminder or custom email.
- **Key Files:**
  - `src/lib/booking-events.ts`
  - `src/app/api/booking-requests/route.ts`
  - `src/app/api/admin/booking-requests/[id]/route.ts`
  - `src/app/api/admin/bookings/[id]/route.ts`
  - `src/app/api/admin/bookings/[id]/notify/route.ts`

## Success Criteria
- [ ] Comprehensive list of notification triggers mapped.
- [ ] Integration tests covering all identified triggers.
- [ ] Consistent error handling and audit logging across all notification paths.
- [ ] >80% test coverage for `src/lib/booking-events.ts`.
