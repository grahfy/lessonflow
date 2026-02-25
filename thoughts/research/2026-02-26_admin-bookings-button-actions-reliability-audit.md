---
date: 2026-02-26T00:37:21+11:00
git_commit: 271e280
branch: main
repository: melbourne_guitar_school_website
topic: "Admin bookings button actions reliability audit"
tags: [research, admin, bookings, ui, api, reliability, nginx]
last_updated: 2026-02-26T00:51:48+11:00
---

## Ticket Synopsis

Investigate intermittent and generic-failure behavior for `/admin/bookings` button actions (for example portal credential regenerate and move-booking flow), map handlers to API routes, identify code-side root causes, and account for deployment/proxy confounders (Nginx SSL/canonical redirects, forwarded headers, non-JSON responses).

## Summary

The user reports are credible and appear to involve multiple root causes rather than one defect.

Primary confirmed code issue:
- `POST /api/admin/customers/[id]/portal-credential` catches errors for `reveal` but not `regenerate`, so regenerate exceptions can surface as non-JSON/opaque failures and collapse into the UI fallback `Unable to manage portal credential.`

Broader reliability issue:
- Several routes used by `/admin/bookings` actions still lack top-level `try/catch` JSON normalization, so thrown errors (DB/email/storage/runtime) can return non-JSON responses that the client reduces to generic error banners.

Likely intermittent UI issue:
- The booking dialog open/close flow uses animated presence state with asynchronous `closeDialog()` cleanup and unkeyed dialog state. This creates a plausible state race where late close cleanup can clear a newly opened selection.

Operational confounder (must be checked on server):
- Nginx SSL/canonical redirects or missing forwarded headers can cause API mutation requests to return redirects/HTML, which the client then surfaces as generic action errors.
- The repo template `deploy/nginx-http.conf` should be reviewed and compared against the deployed Nginx config to detect redirect/header drift.

## Action Inventory (Phase 1)

Compact action map for the main `/admin/bookings` console and nested dialogs (client handler -> endpoint -> generic fallback surface before fixes).

| Action | Client Handler | Endpoint / Method | Fallback Surface (pre-fix) |
| --- | --- | --- | --- |
| Select calendar event | `openDialog()` | None (UI only) | Dialog intermittency / no popup report |
| Save booking/request details | `saveDetails()` -> `mutateBooking()` / `mutateRequest()` | `PATCH /api/admin/bookings/[id]` or `PATCH /api/admin/booking-requests/[id]` | `Booking update failed.` / `Pending request update failed.` |
| Move booking/request | `moveSelected()` -> `mutateBooking()` / `mutateRequest()` | `PATCH /api/admin/bookings/[id]` or `PATCH /api/admin/booking-requests/[id]` | Same as above; user also expected a separate popup |
| Cancel booking/request | `cancelSelected()` | Same `PATCH` routes | Generic mutation fallback + possible post-load generic error |
| Delete booking/request | `deleteSelected()` | `DELETE /api/admin/bookings/[id]` or `DELETE /api/admin/booking-requests/[id]` | `Unable to delete booking.` / `Unable to delete booking request.` |
| Approve/reject request | `approveSelected()` -> `mutateRequest()` | `PATCH /api/admin/booking-requests/[id]` | `Pending request update failed.` |
| Send reminder/custom email | `sendNotification()` | `POST /api/admin/bookings/[id]/notify` or `POST /api/admin/booking-requests/[id]/notify` | `Notification failed.` |
| Create invoice | `createInvoiceFromBooking()` | `POST /api/admin/bookings/[id]/invoice` | `Unable to create invoice.` |
| Reveal/regenerate portal password | `revealPortalPassword()` / `regeneratePortalPassword()` -> `mutatePortalCredential()` | `POST /api/admin/customers/[id]/portal-credential` | `Unable to manage portal credential.` |
| Load/upload/delete learning materials | `loadLearningMaterials()` / `uploadLearningMaterial()` / `deleteLearningMaterial()` | `GET|POST /api/admin/customers/[id]/learning-materials`, `DELETE /api/admin/learning-materials/[id]` | `Unable to load learning materials.` / `Upload failed.` / `Unable to delete learning material.` |
| Remove booking series | `removeSeries()` | `DELETE /api/admin/booking-series/[id]` | `Unable to remove series.` |
| Save/delete customer from nested dialogs | `saveCustomer()` / `deleteCustomer()` | `POST|PATCH|DELETE /api/admin/customers...` | `Unable to save customer.` / `Unable to delete customer.` |

## Reproduction Notes (Phase 1 / Execution)

- Local browser reproduction was not performed in this execution session; user-reported failures were analyzed from code paths and server/client behavior.
- `Regenerate password` failure root cause was confirmed and regression-tested at route level by forcing `rotatePortalCredential()` to throw and asserting a JSON `500` response in `tests/admin-portal-credential.test.ts`.
- `Move booking` issue was categorized as both:
  - UX expectation mismatch (move uses the existing dialog `Start` field, not a second popup), and
  - plausible intermittent dialog lifecycle race (late close cleanup clearing a newly opened selection).
- `deploy/nginx-http.conf` review (repo template) found no obvious defect for this issue class:
  - `www` canonical redirect uses `308`
  - `api/admin` and `api` proxy locations set `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`
- Live droplet Nginx comparison and browser-network capture for failing admin actions remains a manual follow-up (needed to confirm or eliminate proxy drift/redirect behavior).

## Detailed Findings

### 1. Portal credential regenerate path has asymmetric error handling (confirmed)

`mutatePortalCredential()` in the admin UI posts to `/api/admin/customers/:id/portal-credential` and uses a generic fallback when the response is not OK (`Unable to manage portal credential.`) (`src/components/admin-bookings-client.tsx:921`, `src/components/admin-bookings-client.tsx:932`).

The route handler catches exceptions only in the `reveal` branch (`src/app/api/admin/customers/[id]/portal-credential/route.ts:80`), but the `regenerate` path directly awaits `rotatePortalCredential()` without a top-level catch (`src/app/api/admin/customers/[id]/portal-credential/route.ts:104`). Any thrown error from credential rotation, audit logging, or crypto/storage path will escape as an unnormalized server error.

This matches the user report where `Regenerate password` intermittently shows the generic UI message while `Reveal` may behave differently.

### 2. `/admin/bookings` action client still assumes JSON errors in many handlers

A helper exists (`readApiErrorMessage`) to tolerate non-JSON responses (`src/components/admin-bookings-client.tsx:299`), but it is only used in the main calendar load path (`src/components/admin-bookings-client.tsx:455`, `src/components/admin-bookings-client.tsx:460`).

Many button handlers still do `await response.json().catch(() => null)` and then fallback to generic text:
- portal credentials (`src/components/admin-bookings-client.tsx:930`)
- learning materials load/upload/delete (`src/components/admin-bookings-client.tsx:984`, `src/components/admin-bookings-client.tsx:1061`, `src/components/admin-bookings-client.tsx:1087`)
- booking/request mutations (`src/components/admin-bookings-client.tsx:1107`, `src/components/admin-bookings-client.tsx:1124`)
- notify (`src/components/admin-bookings-client.tsx:1157`)
- delete booking/request (`src/components/admin-bookings-client.tsx:1295`)
- remove series (`src/components/admin-bookings-client.tsx:1332`)

Result: any HTML/plain-text error from a route/proxy appears as a generic UI failure, which makes unrelated issues look identical.

### 3. Multiple routes used by admin-bookings buttons still lack top-level JSON error normalization

The project already has `jsonUnexpectedError()` for parseable JSON 500s (`src/lib/api-errors.ts:6`), and many admin routes were normalized earlier, but several routes directly used by `/admin/bookings` actions are still unwrapped.

Examples (all reachable from admin bookings dialogs or nested customer/materials flows):
- portal credential `POST` (`src/app/api/admin/customers/[id]/portal-credential/route.ts:58`)
- learning materials list/upload routes (`src/app/api/admin/customers/[id]/learning-materials/route.ts:23`, `src/app/api/admin/customers/[id]/learning-materials/route.ts:97`) — only the final metadata create is inside a local catch (`src/app/api/admin/customers/[id]/learning-materials/route.ts:164`)
- learning material delete (`src/app/api/admin/learning-materials/[id]/route.ts:17`)
- booking invoice create (`src/app/api/admin/bookings/[id]/invoice/route.ts:20`)
- booking notify (`src/app/api/admin/bookings/[id]/notify/route.ts:20`)
- booking-request notify (`src/app/api/admin/booking-requests/[id]/notify/route.ts:20`)

Any thrown exception in these routes can produce an opaque/non-JSON response and trigger the generic client fallbacks.

### 4. `Move booking` UX is single-dialog, not a second popup (expectation mismatch risk)

There is no separate “move” popup. The action works from the existing booking details dialog using the same `Start` `datetime-local` field (`src/components/admin-bookings-client.tsx:2703`) and then `Move booking` calls `moveSelected()` (`src/components/admin-bookings-client.tsx:1226`, `src/components/admin-bookings-client.tsx:2731`).

This means part of the user report (“clicking move booking doesn’t bring a pop up showing where to move”) may reflect a UX mismatch: the current design expects editing the date/time inside the already-open dialog.

That said, the user also reported intermittent dialog-open issues, which are likely a separate reliability problem (next finding).

### 5. Dialog lifecycle has a plausible race causing intermittent open/visibility issues

Event selection calls `openDialog(event)`, which immediately sets `selectedEvent`, `dialogForm`, and then `dialogPresence.show()` (`src/components/admin-bookings-client.tsx:580`, `src/components/admin-bookings-client.tsx:591`).

Dialog close is asynchronous and clears selection/form state after animation via `dialogPresence.hide(...callback...)` (`src/components/admin-bookings-client.tsx:615`, `src/components/admin-bookings-client.tsx:627`, `src/components/admin-bookings-client.tsx:629`).

The dialog render is gated by `dialogPresence.isMounted && selectedEvent && dialogForm` (`src/components/admin-bookings-client.tsx:2441`), and the dialog subtree is not keyed by selected entity identity.

This combination creates a plausible race:
- a close path starts (possibly after a mutation)
- before cleanup completes, a new open path begins
- late close callback clears `selectedEvent` / `dialogForm`, collapsing the newly opened dialog

This needs reproduction/verification, but it matches the “still happens occasionally” symptom and the current animation/presence implementation (`src/components/motion/use-presence-exit.ts:36`).

### 6. Stale async customer fetch can overwrite dialog customer state after selection changes

`openDialog()` triggers an async customer fetch when a linked customer exists (`src/components/admin-bookings-client.tsx:594`), but the response handler blindly calls `setSelectedCustomer(data.customer)` (`src/components/admin-bookings-client.tsx:603`) without checking that the currently selected event is still the same booking/request.

This will not prevent the dialog from opening, but it can create intermittent “wrong customer/details” state if users click between events quickly.

### 7. Test coverage exists for happy paths, but not for key failure modes or dialog races

Portal credential route tests cover reveal/regenerate happy paths (`tests/admin-portal-credential.test.ts:24`) but do not inject or assert regenerate exception normalization.

There is no UI-level test coverage for booking-dialog open/close sequencing or rapid reselection behavior (no matches for `openDialog`/dialog presence in tests).

This leaves the intermittent dialog issue and generic non-JSON error regressions largely unguarded.

### 8. Nginx SSL/canonical redirects remain a real production confounder for generic action failures

Because the client relies on relative `fetch('/api/admin/...')` calls with JSON parsing/fallback behavior (`src/components/admin-bookings-client.tsx:422`), proxy-generated redirects or HTML error pages can present as the same generic UI messages as app-code failures.

This is especially relevant for mutation actions if Nginx applies host/HTTPS redirects incorrectly (method-changing `301/302`, missing `X-Forwarded-Proto`, or HTML auth/error bodies on API paths). The ticket now explicitly includes this diagnostic branch.
The repo-side check should include `deploy/nginx-http.conf` so the audit verifies both live behavior and intended config.

## Code References

- `src/components/admin-bookings-client.tsx:299` - `readApiErrorMessage()` helper exists but is not consistently used across button handlers
- `src/components/admin-bookings-client.tsx:422` - `safeFetch()` wraps network exceptions only, not HTTP/non-JSON route behavior
- `src/components/admin-bookings-client.tsx:580` - `openDialog(event)` selection + dialog open path
- `src/components/admin-bookings-client.tsx:615` - `closeDialog()` animated async close path with delayed state cleanup
- `src/components/admin-bookings-client.tsx:921` - portal credential UI mutation handler and generic fallback
- `src/components/admin-bookings-client.tsx:1226` - `moveSelected()` uses current dialog `startAtLocal` field (no separate popup)
- `src/components/admin-bookings-client.tsx:2441` - booking dialog render gate (`isMounted && selectedEvent && dialogForm`)
- `src/components/admin-bookings-client.tsx:2703` - dialog date/time field used for move/edit
- `src/app/api/admin/customers/[id]/portal-credential/route.ts:58` - portal credential `POST`
- `src/app/api/admin/customers/[id]/portal-credential/route.ts:80` - reveal branch catches exceptions
- `src/app/api/admin/customers/[id]/portal-credential/route.ts:104` - regenerate branch lacks catch / top-level normalization
- `src/app/api/admin/customers/[id]/learning-materials/route.ts:23` - learning materials list route (unwrapped)
- `src/app/api/admin/customers/[id]/learning-materials/route.ts:97` - learning materials upload route (partially wrapped only around metadata create)
- `src/app/api/admin/learning-materials/[id]/route.ts:17` - learning material delete route (unwrapped)
- `src/app/api/admin/bookings/[id]/invoice/route.ts:20` - invoice create route (unwrapped)
- `src/app/api/admin/bookings/[id]/notify/route.ts:20` - booking notify route (unwrapped)
- `src/app/api/admin/booking-requests/[id]/notify/route.ts:20` - booking request notify route (unwrapped)
- `src/lib/api-errors.ts:6` - shared JSON error normalization helper
- `src/components/motion/use-presence-exit.ts:36` - presence hide timing that can race with rapid reopen
- `tests/admin-portal-credential.test.ts:24` - portal credential happy-path coverage only
- `deploy/nginx-http.conf` - repo Nginx template to compare against production behavior during proxy/redirect diagnostics

## Architecture Insights

- `/admin/bookings` is a high-density action hub with one large client component that multiplexes many endpoints and modal flows. This increases the blast radius of inconsistent error parsing and route response formats.
- The generic `setError(payload?.error || ...)` pattern masks whether failures originate from app validation, route exceptions, auth/session issues, proxy redirects, or deployment mismatch.
- Animated presence and delayed cleanup improve UX but require explicit concurrency guards (or keyed dialog state) to avoid intermittent state races.

## Historical Context (from thoughts/)

- Prior admin hardening work normalized many `/api/admin/**` routes and fixed some booking-request mutation issues, but this research confirms remaining gaps in routes specifically exercised by the admin bookings page.
- The ticket was updated during this research to explicitly include Nginx SSL/canonical redirect and proxy-header checks as a production confounder for generic action failures.

## Related Research

- `thoughts/research/2026-02-25_admin-production-readiness-digitalocean-droplet.md` (prior production-readiness findings; relevant for proxy/scheduler/runtime assumptions)

## Open Questions

- Can the intermittent “move booking” report be reproduced as a dialog open race, or is it primarily a UX-labeling mismatch (user expecting a secondary popup)?
- Which failing actions on production return redirect/HTML vs JSON? (Need browser Network + Nginx logs on a live failure.)
- Does deployed Nginx match `deploy/nginx-http.conf` for HTTPS/canonical redirects and forwarded headers on `/api/admin/*`?
- Are there any additional `/admin/bookings` nested actions hitting routes not covered in this audit pass that still lack top-level JSON normalization?
