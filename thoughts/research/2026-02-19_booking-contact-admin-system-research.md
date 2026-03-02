---
date: 2026-02-19T12:01:54Z
git_commit: 5d00dae
branch: main
repository: melbourne_guitar_school_website
topic: "Research: booking-contact-admin implementation plan"
tags: [research, booking, contact-form, admin-calendar, email]
last_updated: 2026-02-19T12:01:54Z
---

## Ticket Synopsis
The ticket requires evolving the current static marketing site into an operational scheduling system: real contact backend, booking request workflow, owner approval queue, day/week/month admin calendar views, manual booking operations (add/move/cancel/edit), recurring weekly bookings, and customer/owner email automation (`thoughts/tickets/2026-02-19-booking-contact-admin-system.md:7`).

## Summary
The plan in `thoughts/plans/booking-contact-admin-implementation-plan.md` is directionally correct and feasible, but the current codebase baseline is more constrained than a typical incremental feature addition. The repository is static HTML/CSS/JS with no server runtime, package manager manifest, database layer, auth stack, or test harness (`README.md:17`, `README.md:27`, `assets/js/site.js:2`).

The largest practical risk is UI architecture mismatch: current pages are intentionally full-viewport and non-scrolling (`assets/css/styles.css:24`, `assets/css/styles.css:183`), while booking/admin/calendar workflows naturally require scrollable forms, lists, and dense timeline interactions. A split layout strategy (marketing shell vs admin app shell) is recommended from the first implementation phase.

## Detailed Findings

### Locate Phase
- Project runtime is static and local-server driven (`README.md:17`), with content distributed across root HTML pages (`README.md:10`).
- Contact page has no `<form>`; it relies on static contact details and `mailto:`/`tel:` CTAs (`contact.html:39`, `contact.html:47`).
- Navigation and transitions are centralized in a single script that intercepts internal links with `data-nav` and performs animated navigation (`assets/js/site.js:12`, `assets/js/site.js:23`, `assets/js/site.js:145`).
- Existing policy text already encodes cancellation and voucher constraints that should inform booking/cancellation flows (`terms.html:40`).

### Pattern-Find Phase
- No existing backend/API/auth/data-access implementation patterns were found in live code; patterns exist only as planning intent in `thoughts/plans/` (`thoughts/plans/booking-contact-admin-implementation-plan.md:40`, `thoughts/plans/lessonflow-modern-website-implementation-plan.md:40`).
- UI patterns are reusable for marketing pages (`.site-shell`, `.panel-copy`, `.list`, `.button-row`), but they are not suitable as-is for an admin operations console (`assets/css/styles.css:108`, `assets/css/styles.css:194`, `assets/css/styles.css:342`).

### Analyze Phase
- The new plan correctly introduces domain entities and status transitions, but overlap/conflict semantics need explicit definition:
  - Should `pending` requests reserve timeslots or only `approved` bookings?
  - How to resolve conflicts when manually moving bookings.
- “Current calendar year” constraint is clear in the plan (`thoughts/plans/booking-contact-admin-implementation-plan.md:17`), but recurring booking behavior at year boundary needs explicit rules:
  - auto-truncate at Dec 31
  - or allow manual extension to next year
- Admin day/week/month requirement is compatible with FullCalendar, but drag/drop rescheduling must emit audit entries and deterministic email side effects (move -> confirmation or update notice).
- Email automation requirement is feasible; delivery reliability needs retry/dead-letter strategy and visibility for failures (plan already points to observability in Phase 6).
- Justified text is low risk if scoped only to selected long-form copy blocks (existing `.lead` class is a natural extension point: `assets/css/styles.css:217`).

## Code References
- `README.md:17` - static local run command (`python3 -m http.server`), no app runtime.
- `README.md:27` - content/edit split between page HTML, global CSS, and JS.
- `contact.html:39` - contact info is static list content.
- `contact.html:47` - current contact actions are `mailto:` and `tel:` links.
- `assets/js/site.js:2` - static `PAGE_ORDER` route model.
- `assets/js/site.js:23` - client-side interception for `data-nav` links.
- `assets/js/site.js:145` - transition-based navigation approach.
- `assets/css/styles.css:24` - `html, body` with `overflow: hidden`.
- `assets/css/styles.css:183` - `.view` uses clipped overflow and split grid.
- `assets/css/styles.css:217` - `.lead` class used for body copy style.
- `terms.html:40` - policy constraints relevant to cancellation behavior.
- `thoughts/plans/booking-contact-admin-implementation-plan.md:40` - selected full-stack architecture.

## Architecture Insights
- A two-surface architecture is recommended:
  - Marketing surface: preserve current visual style and transition behavior.
  - Admin surface: separate shell optimized for operational workflows (calendar, forms, tables).
- Keep booking logic in a domain service layer (`validation`, `recurrence`, `status transitions`) so API routes and admin UI remain thin.
- Treat time as first-class: store UTC timestamps, render using `Australia/Melbourne`, and test DST boundaries.
- Make email dispatch event-driven from booking state changes to avoid inconsistent side effects.

## Historical Context (from thoughts/)
- The prior modernization plan focuses on CMS-driven marketing content and initially excludes operational systems like portals/auth (`thoughts/plans/lessonflow-modern-website-implementation-plan.md:35`).
- The new booking plan extends that direction into transactional operations, introducing auth, persistence, and scheduling concerns (`thoughts/plans/booking-contact-admin-implementation-plan.md:40`).
- This means implementation sequencing should avoid trying to deliver CMS + booking operations simultaneously in early phases.

## Related Research
- `thoughts/plans/booking-contact-admin-implementation-plan.md`
- `thoughts/tickets/2026-02-19-booking-contact-admin-system.md`
- `thoughts/plans/lessonflow-modern-website-implementation-plan.md`
- `thoughts/tickets/2026-02-19-lessonflow-modern-site.md`

## Open Questions
- Should pending requests block identical timeslots before approval?
- For recurring weekly bookings, should edits/cancellations support `this occurrence`, `this and future`, and `entire series` modes?
- Is owner notification email single-recipient or multi-recipient?
- Should customers receive email on manual reschedule performed by owner?
- Should historical bookings outside the current year remain visible/read-only in admin reporting?
