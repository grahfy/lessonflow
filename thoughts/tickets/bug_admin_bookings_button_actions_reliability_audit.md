---
type: bug
priority: high
created: 2026-02-25
status: implemented
tags: [admin, bookings, ui, api, reliability, regressions]
keywords: [admin bookings buttons fail, unable to manage portal credential, move booking dialog not opening, admin action audit, generic error messages]
patterns: [src/components/admin-bookings-client.tsx, /api/admin/bookings/**, /api/admin/booking-requests/**, /api/admin/customers/[id]/portal-credential, setError(payload?.error || ...), safeFetch]
---

# BUG-001: Admin Bookings Page Button Actions Reliability Audit And Fixes

## Description

Audit and stabilize all interactive button actions on the `/admin/bookings` page (including nested customer/materials dialogs) because multiple actions intermittently fail or surface generic error messages. Known examples include:
- `Regenerate password` showing `Unable to manage portal credential.`
- `Move booking` intermittently not presenting the expected dialog/date-time edit workflow
- Other admin bookings actions appearing to fail with generic UI error banners/fallback messages

This ticket should identify root causes (UI-state, event handling, route errors, non-JSON responses, auth/session issues, stale deployment mismatches) and implement contained fixes for high-frequency failures.

## Context

The `/admin/bookings` page is a dense operational console (`src/components/admin-bookings-client.tsx`) with many buttons that trigger different API endpoints and UI overlays:
- booking/request edit/move/cancel/reject/approve/delete
- portal credential reveal/regenerate
- notifications, invoice creation
- customer CRUD and customer invoice navigation
- learning materials upload/delete
- series removal

Many of these paths share a generic client error pattern (`setError(payload?.error || "...")`), so server-side exceptions or non-JSON responses often collapse into broad messages (for example `Unable to manage portal credential.`), making diagnosis harder and creating the impression that "all buttons fail."

Recent fixes improved some booking-request mutation reliability, but the user still reports intermittent failures and UI behavior regressions (especially modal/open flows).

## Requirements

### Functional Requirements
- Inventory all button-triggered actions on `/admin/bookings` and nested dialogs and map each to its handler + API endpoint (if any).
- Reproduce and document failures for representative actions, including:
  - portal credential regenerate
  - move booking / move request interaction
  - one booking mutation action (cancel/reject/delete)
  - one customer or learning-material action
- Fix confirmed root causes for high-frequency/critical action failures in this ticket where changes are contained.
- Ensure button actions return/consume JSON error responses consistently so the UI can display specific error messages.
- Ensure move/edit flows reliably open/retain the expected dialog state and date/time form controls.
- Verify that actions that mutate data refresh the calendar/customers/materials state correctly after success.
- Include production proxy/Nginx confounder checks (SSL redirect/canonical host redirects, forwarded headers, non-JSON HTML responses on API routes) when diagnosing generic button failures.

### Non-Functional Requirements
- Keep fixes scoped to admin bookings action reliability (no broad UI redesign).
- Prefer low-risk, targeted changes with reproducible before/after behavior.
- Preserve existing auth/session semantics and action permissions.
- Maintain accessible button behavior (keyboard-triggered actions, disabled/busy states, confirmation dialogs).
- Add/update targeted tests where practical for API behavior regressions.

## Current State

- `/admin/bookings` client centralizes many action handlers in `src/components/admin-bookings-client.tsx`.
- Generic fallback messages exist for many actions (examples):
  - `Unable to manage portal credential.` (`src/components/admin-bookings-client.tsx:932`)
  - `Unable to load admin data...` (`src/components/admin-bookings-client.tsx:458`, `src/components/admin-bookings-client.tsx:459`)
  - `Unable to delete booking request.` (`src/components/admin-bookings-client.tsx:1297`)
- Portal credential regenerate uses:
  - client handler `mutatePortalCredential()` -> `POST /api/admin/customers/[id]/portal-credential`
  - route currently has partial try/catch coverage (reveal path catches, regenerate path returns directly)
- Calendar event selection/dialog open is driven by:
  - `AdminBookingCalendar` `onSelect`
  - `openDialog(event)` in `src/components/admin-bookings-client.tsx`
- Intermittent UI issues may involve state timing across dialog presence/animation, busy action state, and post-mutation reloads.

## Desired State

- All major buttons on `/admin/bookings` (and nested dialogs) work reliably under normal admin usage.
- Failures return parseable JSON with actionable messages instead of generic fallbacks whenever possible.
- `Move booking` / `Move request` flow consistently opens and uses the dialog date/time controls.
- Portal credential regenerate/reveal actions behave consistently and surface precise errors if they fail.
- Intermittent issues are either fixed or narrowed to clearly documented, reproducible residual cases with follow-up tickets.

## Research Context

### Keywords to Search
- `Unable to manage portal credential` - locate the exact fallback path and corresponding API route behavior.
- `mutatePortalCredential` - trace portal credential UI action flow in admin bookings client.
- `openDialog` / `moveSelected` - verify modal open/state handling for move booking/request interactions.
- `safeFetch` - inspect normalized network error handling and how non-JSON responses surface in UI.
- `30x` / `Location` / `Content-Type: text/html` on `/api/admin/*` - detect proxy redirects or HTML error pages causing generic client fallback messages.
- `X-Forwarded-Proto` / canonical host redirects / `308` vs `301|302` - verify Nginx behavior for API mutation methods.
- `deploy/nginx-http.conf` - review the repo Nginx template for redirect and proxy-header correctness against admin API requirements.
- `setError(payload?.error ||` - audit generic fallback error messaging across admin bookings actions.
- `booking-requests/[id]/route.ts` - review action handlers and JSON error normalization consistency.
- `portal-credential/route.ts` - inspect regenerate/reveal error handling asymmetry.
- `dialogPresence` / `animateOut` / `usePresenceExit` - investigate modal timing/race issues.

### Patterns to Investigate
- `src/components/admin-bookings-client.tsx` async button handlers vs `busyAction`/dialog state interactions.
- API routes with missing top-level `try/catch` or branch-specific catch blocks causing non-JSON/opaque failures.
- Action success -> `await load()` sequences that may race with dialog close animations or stale selected state.
- Event-selection flow in `src/components/admin-booking-calendar.tsx` and `openDialog(event)` timing.
- Button handlers shared across booking vs booking_request entity types with divergent endpoint semantics.
- Routes that return `404/400` for valid user actions due to stale selected event IDs after reloads.
- Portal credential operations throwing domain errors from `rotatePortalCredential()` / `revealPortalPasswordForAdmin()`.
- Reverse proxy behavior returning redirects/HTML to API requests (method-changing redirects, auth/session cookie issues from missing forwarded proto/host headers).

### Key Decisions Made
- Scope is `/admin/bookings` page action reliability (including nested dialogs) rather than every admin route/page.
- This is an audit + implementation bug ticket: reproduce, fix contained failures, and split broader issues only if needed.
- Start from user-reported examples (`Regenerate password`, intermittent `Move booking`) and expand to all high-impact action buttons.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update targeted tests for at least one portal credential action failure/success path
- [ ] Add/update targeted tests for one booking/request mutation path affected by the audit
- [ ] `npm run build` (with MySQL `DATABASE_URL` if required by current Prisma client/schema setup)

### Manual Verification
- [ ] `Regenerate password` and `Reveal password` in customer directory work (or show precise actionable errors)
- [ ] Clicking a calendar appointment consistently opens the details dialog
- [ ] `Move booking` / `Move request` uses the dialog date/time field and completes successfully
- [ ] `Cancel`, `Reject`, and `Remove request entirely` behave correctly and refresh the calendar without generic load failures
- [ ] At least one customer action and one learning-material action complete successfully from the admin bookings page
- [ ] Generic catch-all messages are reduced for reproducible server-side failures (specific JSON errors shown where applicable)
- [ ] On production/staging proxy, failing actions are checked for redirect/HTML responses (`30x`, `Location`, non-JSON `Content-Type`) and Nginx proxy header correctness is documented if relevant
- [ ] `deploy/nginx-http.conf` is reviewed and compared with deployed Nginx behavior (redirect codes, API path handling, forwarded headers)

## Related Information

- Main UI action hub: `src/components/admin-bookings-client.tsx`
- Calendar selection component: `src/components/admin-booking-calendar.tsx`
- Booking mutations: `src/app/api/admin/bookings/[id]/route.ts`
- Booking request mutations/deletes: `src/app/api/admin/booking-requests/[id]/route.ts`
- Portal credential action route: `src/app/api/admin/customers/[id]/portal-credential/route.ts`
- Portal credential domain logic: `src/lib/student-portal/credentials.ts`
- Nginx template to verify: `deploy/nginx-http.conf`
- Prior admin reliability work:
  - `thoughts/tickets/debt_admin_production_readiness_audit.md`
  - `thoughts/tickets/debt_admin_prod_verification_and_test_harness_mysql_alignment.md`

## Notes

- User reports intermittent behavior, so reproduction should capture browser actions precisely (click sequence, selected entity type, busy state, timing after load/reload).
- Deployment mismatch is a plausible confounder for some "generic error" reports (UI and API route changes may be out of sync on the server). Record deployed commit SHA during investigation.
- Nginx SSL/canonical redirects and proxy header forwarding (`Host`, `X-Forwarded-Proto`, `X-Forwarded-For`) are also plausible confounders for generic API action failures; inspect browser network responses and proxy logs before attributing every failure to client code.
- Compare the deployed Nginx config with `deploy/nginx-http.conf` during investigation; config drift may explain production-only or intermittent behavior.
- Code-side fixes and automated verification for route/client reliability were implemented in the associated execution pass; live droplet/proxy comparison and manual UI stress verification remain follow-up validation steps.
- If the audit finds multiple unrelated root causes (UI-state race vs route error normalization vs domain-specific portal credential failures), split follow-up tickets after fixing the highest-severity issues first.
