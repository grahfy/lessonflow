---
date: 2026-02-19T14:39:51Z
git_commit: 7086c7a
branch: main
repository: melbourne_guitar_school_website
topic: "Research: admin visual calendar ticket vs global sequenced tween plan"
tags: [research, admin-calendar, animation, tween, ui-motion]
last_updated: 2026-02-19T14:44:38Z
---

## Ticket Synopsis
The admin calendar ticket defines a calendar-first booking workflow with status colors, popup editing/actions, and manual customer notifications (`thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md:7`). The global tween plan expands animation scope to all active public and admin routes with sequential in/out tween orchestration (`thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md:3`).

## Summary
The admin ticket scope is functionally implemented in live code, including unified event feeds, status colors, popup action flows, notify endpoints, and audit logging. The remaining gap is animation architecture depth: current motion is CSS keyframe/transition based and mostly entry-focused, while the global plan requires route-level and dialog-level sequential in/out tween orchestration across all pages.

The global tween plan is compatible with the implemented admin architecture. It is mostly an additive frontend layer and does not require booking-domain API redesign. The two major risks identified in this research (exit lifecycle coordination and calendar-density performance) are now explicitly resolved in the plan/ticket via state-machine transitions, delayed unmount contracts, watchdog fallbacks, and hard animation caps.

## Detailed Findings

### Locate Phase
- Ticket status is marked `researched` for this pass (`thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md:4`).
- Unified admin events endpoint includes confirmed bookings, pending requests in-range, and recency-gated cancelled/rejected records (`src/app/api/admin/bookings/route.ts:22`, `src/app/api/admin/bookings/route.ts:49`, `src/app/api/admin/bookings/route.ts:72`).
- Color mapping is centralized and aligned with ticket semantics (`src/lib/admin-calendar-events.ts:5`, `src/lib/admin-calendar-events.ts:9`).
- Day/week/month visual rendering and event chips are in a dedicated component (`src/components/admin-booking-calendar.tsx:100`, `src/components/admin-booking-calendar.tsx:117`, `src/components/admin-booking-calendar.tsx:139`).
- Dialog actions and nested email dialog are implemented in the admin client (`src/components/admin-bookings-client.tsx:229`, `src/components/admin-bookings-client.tsx:628`, `src/components/admin-bookings-client.tsx:862`).
- Booking and request mutate endpoints support edit/move/cancel/approve/reject behavior (`src/app/api/admin/bookings/[id]/route.ts:86`, `src/app/api/admin/bookings/[id]/route.ts:121`, `src/app/api/admin/booking-requests/[id]/route.ts:72`, `src/app/api/admin/booking-requests/[id]/route.ts:237`).
- Manual notify endpoints exist for both bookings and requests (`src/app/api/admin/bookings/[id]/notify/route.ts:20`, `src/app/api/admin/booking-requests/[id]/notify/route.ts:20`).
- Audit actions include communication events in schema (`prisma/schema.prisma:38`, `prisma/schema.prisma:45`).

### Pattern-Find Phase
- Existing motion patterns are CSS-first and local to element classes:
  - button transitions (`src/styles/globals.css:174`),
  - notice entry animation (`src/styles/globals.css:412`),
  - calendar event entry animation (`src/styles/globals.css:534`, `src/styles/globals.css:545`),
  - dialog backdrop/panel entry animation (`src/styles/globals.css:590`, `src/styles/globals.css:610`).
- Reduced-motion behavior is globally enforced via media query (`src/styles/globals.css:849`).
- Shared composition points for broad motion rollout are stable:
  - app root (`src/app/layout.tsx:11`),
  - public shell (`src/components/site-shell.tsx:13`),
  - shared public content layout (`src/components/panel-layout.tsx:17`).
- Internal navigation uses plain `Link` without exit-transition interception (`src/components/site-shell.tsx:28`).
- Test coverage currently focuses on backend/admin route contracts and email/audit behavior; no motion/orchestrator tests exist (`tests/admin-bookings.test.ts:46`, `tests/admin-booking-mutations.test.ts:28`, `tests/admin-notify-actions.test.ts:28`).

### Analyze Phase
- The admin ticket implementation and global tween plan are architecturally complementary:
  - ticket delivers data/actions,
  - global plan delivers cross-route choreography.
- No evidence of a JS tween engine or orchestrator in runtime dependencies or layout wiring (`package.json:20`, `src/app/layout.tsx:14`).
- Current modal lifecycle unmounts immediately on close state (`src/components/admin-bookings-client.tsx:208`, `src/components/admin-bookings-client.tsx:628`), so exit animations cannot fully run without introducing a delayed unmount/state phase.
- Calendar event animation currently applies per event render (`src/components/admin-booking-calendar.tsx:81`, `src/styles/globals.css:545`); global “animate every element” behavior needs node-count caps to avoid month-view over-animation.
- The plan’s explicit safeguards (reduced-motion short-circuit, selector scoping, node caps, timeline cleanup) are necessary, not optional, for the admin surface (`thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md:216`, `thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md:224`, `thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md:230`).
- Risk closure decision set is now recorded:
  - shared transition state machine + two-phase presence,
  - timeout fallback for interrupted exits,
  - explicit public/admin/calendar node caps and overflow immediate mode (`thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md`, `thoughts/tickets/2026-02-19-global-sequenced-ui-tween-animations.md`).

## Code References
- `thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md:4` - ticket status is `researched` after this run.
- `thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md:49` - selected GSAP tween orchestration approach.
- `src/app/api/admin/bookings/route.ts:22` - approved/cancelled booking range and recency filtering.
- `src/app/api/admin/bookings/route.ts:49` - pending/rejected request range and recency filtering.
- `src/app/api/admin/bookings/route.ts:72` - unified `events` payload composition.
- `src/lib/admin-calendar-events.ts:9` - request status color mapping (`yellow`/`red`/`green`/`slate`).
- `src/components/admin-booking-calendar.tsx:100` - day/week/month render branching.
- `src/components/admin-booking-calendar.tsx:81` - event chip rendering and selection.
- `src/components/admin-bookings-client.tsx:229` - booking mutate dispatch.
- `src/components/admin-bookings-client.tsx:246` - request mutate dispatch.
- `src/components/admin-bookings-client.tsx:268` - reminder/custom notification dispatch.
- `src/components/admin-bookings-client.tsx:628` - dialog conditional mount.
- `src/components/admin-bookings-client.tsx:862` - nested email dialog conditional mount.
- `src/app/api/admin/bookings/[id]/route.ts:111` - moved-booking customer update email.
- `src/app/api/admin/bookings/[id]/notify/route.ts:47` - reminder audit write.
- `src/app/api/admin/booking-requests/[id]/notify/route.ts:55` - request reminder audit write with request context.
- `prisma/schema.prisma:45` - `reminder_sent` audit enum.
- `prisma/schema.prisma:46` - `custom_email_sent` audit enum.
- `src/styles/globals.css:534` - calendar event transition/animation.
- `src/styles/globals.css:590` - dialog backdrop animation.
- `src/styles/globals.css:849` - global reduced-motion override.
- `src/components/site-shell.tsx:28` - current navigation uses direct `Link`.

## Architecture Insights
- Implemented admin APIs and UI state machine are already adequate for animation layering; no domain-model or endpoint redesign is needed for global tween rollout.
- The strongest integration seam for global sequencing is shared shell composition (`SiteShell` + `PanelLayout`) plus targeted admin-specific roots (`AdminBookingsClient` and `AdminBookingCalendar`).
- To satisfy “animate in and out,” modal and route transitions must adopt two-phase visibility state (visible vs mounted) rather than direct conditional unmount.
- Motion rollout should remain selector-driven and scoped to avoid animating extremely large node sets in calendar month views.

## Resolution Update (2026-02-19)
- Route-level and dialog-level sequential in/out tween orchestration is now explicitly specified as a transition-state contract with delayed unmount and timeout fallback in the implementation plan.
- Calendar-density and lifecycle risks are now mitigated by explicit cap constants, per-cell animation limits, duplicate-transition locks, and timeline cleanup requirements in plan/ticket docs.

## Historical Context (from thoughts/)
- Earlier plan/research artifacts for this ticket captured the same feature goals before implementation (`thoughts/plans/admin-visual-calendar-booking-dialog-implementation-plan.md:3`, `thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md:11`).
- Those earlier docs reference a pre-calendar/list-first baseline and are now partially historical relative to current code (`thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md:27`).
- The new global tween plan extends beyond admin into all active routes and emphasizes sequential in/out choreography (`thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md:14`, `thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md:17`).

## Related Research
- `thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md`
- `thoughts/plans/admin-visual-calendar-booking-dialog-implementation-plan.md`
- `thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md`
- `thoughts/tickets/2026-02-19-global-sequenced-ui-tween-animations.md`

## Open Questions
- None. The previously identified motion-depth and rollout-risk questions are now resolved in the current plan/ticket revisions.
