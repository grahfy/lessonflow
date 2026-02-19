---
date: 2026-02-19T13:54:05Z
git_commit: bcf62e1
branch: main
repository: melbourne_guitar_school_website
topic: "Research: admin visual calendar booking dialog plan"
tags: [research, admin-calendar, booking, modal, notifications, animation]
last_updated: 2026-02-19T13:54:05Z
---

## Ticket Synopsis
The ticket asks for a calendar-first admin booking experience with status colors (confirmed green, pending yellow), click-to-open popup details, in-dialog booking controls (cancel/edit/move), and manual customer messaging (reminder/custom email), plus in-ease/out-ease UI animations (`thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md:7`).

## Summary
The implementation plan is feasible and well aligned with current architecture. Key product decisions are now captured for execution:
- Pending requests are displayed only if `requestedStartAt` is inside the active day/week/month range.
- Popup cancel on pending requests maps to `rejected`.
- Moving a confirmed booking sends an automatic customer update email.
- Cancelled/rejected items remain visible for 48 hours in calendar/history views.
- Recommended implementation default for communication traceability: log reminder/custom-email actions in both `OutboundEmail` and `BookingAuditLog`.

The rest of the stack is already a good fit: admin auth guards, booking mutation endpoints, SMTP + `OutboundEmail` logging fallback, and day/week/month range helpers are all in place.

## Detailed Findings

### Locate Phase
- Admin dashboard UI is list-based and split into two panels (`Bookings` and `Pending Approvals`), not a visual calendar (`src/components/admin-bookings-client.tsx:184`, `src/components/admin-bookings-client.tsx:214`).
- Booking data and pending-request data are fetched from separate endpoints (`src/components/admin-bookings-client.tsx:49`, `src/components/admin-bookings-client.tsx:51`).
- Calendar view controls already exist (`day|week|month`) and query range-aware booking data (`src/components/admin-bookings-client.tsx:170`, `src/app/api/admin/bookings/route.ts:14`).
- Pending list endpoint returns all pending requests ordered by time with no date-range filter (`src/app/api/admin/booking-requests/route.ts:12`).
- Reminder/custom-email actions do not exist yet as admin endpoints; email sending is currently action-driven from booking state transitions only (`src/app/api/admin/bookings/[id]/route.ts:49`, `src/app/api/admin/booking-requests/[id]/route.ts:117`).
- Existing style system has no admin modal/calendar animation layer beyond basic transitions on nav links (`src/styles/globals.css:93`, `src/styles/globals.css:408`).

### Pattern-Find Phase
- Auth pattern for admin APIs is consistent and reusable through `requireAdminFromRequest` (`src/lib/admin-route.ts:5`).
- Mutation pattern uses `PATCH` with `action` dispatch and audit write for booking records (`src/app/api/admin/bookings/[id]/route.ts:21`, `src/app/api/admin/bookings/[id]/route.ts:41`).
- Pending approvals use a separate route and currently support only `approve` and `reject` actions (`src/app/api/admin/booking-requests/[id]/route.ts:41`, `src/app/api/admin/booking-requests/[id]/route.ts:127`).
- Email pattern is reusable: template function -> `sendEmail()` -> persisted send status in `OutboundEmail` (`src/lib/email/templates.ts:51`, `src/lib/email/service.ts:39`, `prisma/schema.prisma:156`).
- Existing tests cover auth rejection and basic email fallback but do not cover unified events, popup workflows, or manual notify actions (`tests/admin-bookings.test.ts:18`, `tests/booking-events.test.ts:11`).

### Analyze Phase
- Data-model split is the main structural constraint:
  - `Booking` represents confirmed/cancelled records (`prisma/schema.prisma:101`).
  - `BookingRequest` represents pending/approved/rejected request workflow (`prisma/schema.prisma:58`).
  - A combined calendar feed should use an explicit discriminant (`entityType`) rather than overloading a single status field.
- Current “edit” support for bookings is too narrow for popup editing:
  - Booking edit currently mutates only `notes` (`src/app/api/admin/bookings/[id]/route.ts:85`).
  - Pending requests have no edit/move action path at all (`src/app/api/admin/booking-requests/[id]/route.ts:146`).
- Time and validation behavior is mostly good but needs action-specific schemas:
  - Current request schema enforces future date + current Melbourne calendar year (`src/lib/booking-rules.ts:38`, `src/lib/booking-rules.ts:46`).
  - Reusing this schema for all popup edits may over-constrain admin actions (for example editing legacy or already-started records).
- Manual notification features can be added without schema migration to email tables:
  - `sendEmail` already persists outcome and fallback state (`src/lib/email/service.ts:43`, `src/lib/email/service.ts:64`).
  - If booking-level traceability is required, current `AuditAction` enum lacks explicit `reminder_sent`/`custom_email_sent` values (`prisma/schema.prisma:38`).
- Animation requirement is straightforward but currently absent in admin layer:
  - There are no modal, event, or reduced-motion rules in current CSS (`src/styles/globals.css:408`).
  - Adding animation tokens and `prefers-reduced-motion` handling in phase 2 is the correct insertion point.

## Code References
- `thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md:7` - feature request scope.
- `thoughts/plans/admin-visual-calendar-booking-dialog-implementation-plan.md:52` - proposed unified event approach.
- `src/components/admin-bookings-client.tsx:49` - split fetching of bookings and pending.
- `src/components/admin-bookings-client.tsx:82` - move via `window.prompt`.
- `src/components/admin-bookings-client.tsx:184` - list-based booking rendering.
- `src/components/admin-bookings-client.tsx:214` - separate pending approvals list.
- `src/app/api/admin/bookings/route.ts:19` - range-filtered booking query.
- `src/app/api/admin/booking-requests/route.ts:12` - pending query without range filtering.
- `src/app/api/admin/bookings/[id]/route.ts:31` - cancel action path.
- `src/app/api/admin/bookings/[id]/route.ts:59` - move action path.
- `src/app/api/admin/bookings/[id]/route.ts:85` - edit limited to notes.
- `src/app/api/admin/booking-requests/[id]/route.ts:41` - approve action path.
- `src/app/api/admin/booking-requests/[id]/route.ts:127` - reject action path.
- `src/lib/booking-rules.ts:19` - booking request validation schema.
- `src/lib/booking-rules.ts:41` - current-year validation messaging.
- `src/lib/calendar-range.ts:5` - day/week/month date range utility.
- `src/lib/email/templates.ts:72` - existing customer booking status template.
- `src/lib/email/service.ts:39` - centralized email sender.
- `prisma/schema.prisma:58` - `BookingRequest` model.
- `prisma/schema.prisma:101` - `Booking` model.
- `prisma/schema.prisma:156` - `OutboundEmail` model.
- `src/styles/globals.css:408` - current admin shell styles.
- `tests/admin-bookings.test.ts:18` - existing auth-only admin route test.
- `tests/booking-events.test.ts:11` - existing queue fallback email test.

## Architecture Insights
- Use a unified calendar event DTO that preserves source identity:
  - `entityType: "booking" | "booking_request"`,
  - `entityId`,
  - `status`,
  - `startAt`/`endAt`,
  - display color token (`green`/`yellow`).
- Keep mutation endpoints entity-specific instead of forcing one polymorphic update route; this matches current auth and action patterns.
- Add two lightweight notify endpoints (`bookings/[id]/notify`, `booking-requests/[id]/notify`) that reuse `sendEmail` and explicit templates.
- Add a small modal/action state machine in the admin client (idle/view/edit/sending) to avoid race conditions between save, move, and notify actions.

## Historical Context (from thoughts/)
- The prior booking/contact/admin initiative has already been implemented with a list-based owner console and basic move/cancel/approve flows (`thoughts/plans/booking-contact-admin-implementation-plan.md:122`).
- The new plan is a UX elevation over that baseline, not a backend greenfield, which reduces risk and allows incremental rollout (`thoughts/plans/admin-visual-calendar-booking-dialog-implementation-plan.md:94`).
- This plan also introduces explicit animation quality requirements that were not part of the earlier implementation plan (`thoughts/plans/admin-visual-calendar-booking-dialog-implementation-plan.md:112`).

## Related Research
- `thoughts/plans/admin-visual-calendar-booking-dialog-implementation-plan.md`
- `thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md`
- `thoughts/plans/booking-contact-admin-implementation-plan.md`
- `thoughts/research/2026-02-19_booking-contact-admin-system-research.md`

## Decision Update (2026-02-19)
- Pending requests should be shown only when `requestedStartAt` is inside the active day/week/month range.
- Popup cancel on pending items maps to `rejected`.
- Moving a confirmed booking should automatically send a customer update email.
- Calendar should show cancelled and rejected items for up to 48 hours.
- Communication audit behavior clarified for implementation: recommended default is to log manual reminder/custom email actions in `BookingAuditLog` (with new `AuditAction` values) in addition to `OutboundEmail`.
