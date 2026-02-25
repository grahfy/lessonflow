# Admin Bookings Button Actions Reliability Audit And Fixes Implementation Plan

## Overview

Stabilize high-impact button actions on `/admin/bookings` by addressing confirmed route error-normalization gaps, tightening client-side error parsing and action-state handling, and hardening the booking dialog lifecycle against intermittent open/close races. The plan also includes a production proxy audit step to verify that deployed Nginx behavior matches `deploy/nginx-http.conf` and is not introducing redirects/HTML responses on admin API mutation requests.

## Current State Analysis

The admin bookings console is a single, dense client component with many action handlers and nested dialogs (`src/components/admin-bookings-client.tsx`). Multiple handlers still reduce any non-OK response to generic fallback messages via `payload?.error || ...`, which masks root cause differences.

The research confirms a concrete route bug and several systemic risks:
- Portal credential `POST` only catches `reveal` errors, not `regenerate` (`src/app/api/admin/customers/[id]/portal-credential/route.ts:80`, `src/app/api/admin/customers/[id]/portal-credential/route.ts:104`)
- Several routes used by `/admin/bookings` actions still lack top-level JSON error normalization (`src/app/api/admin/bookings/[id]/invoice/route.ts:20`, `src/app/api/admin/bookings/[id]/notify/route.ts:20`, `src/app/api/admin/booking-requests/[id]/notify/route.ts:20`, `src/app/api/admin/customers/[id]/learning-materials/route.ts:23`, `src/app/api/admin/learning-materials/[id]/route.ts:17`)
- The booking dialog uses async close cleanup with delayed presence unmounting, creating a plausible race with rapid reopen (`src/components/admin-bookings-client.tsx:615`, `src/components/admin-bookings-client.tsx:627`, `src/components/admin-bookings-client.tsx:2441`, `src/components/motion/use-presence-exit.ts:36`)
- The current move action uses the existing dialog `Start` field rather than a separate popup (`src/components/admin-bookings-client.tsx:2703`, `src/components/admin-bookings-client.tsx:2731`)

The repo Nginx template already contains expected forwarded headers and a `308` redirect for `www` -> apex (`deploy/nginx-http.conf:21`, `deploy/nginx-http.conf:91`, `deploy/nginx-http.conf:94`, `deploy/nginx-http.conf:105`, `deploy/nginx-http.conf:108`), but production drift still needs to be checked.

## Desired End State

- Admin bookings actions return precise, parseable error messages for expected failures and normalized JSON for unexpected failures.
- `Regenerate password` and `Reveal password` behave consistently (same error semantics, no unhandled exceptions).
- Booking dialog opens reliably when selecting events, and rapid user interactions do not intermittently clear the dialog due to late close cleanup.
- Move/edit flows are clear and reliable (either via improved UX copy or stable existing dialog behavior).
- The production proxy path is verified: admin API actions are not being redirected and forwarded headers are correct.

### Key Discoveries

- Portal credential regenerate path lacks exception normalization: `src/app/api/admin/customers/[id]/portal-credential/route.ts:104`
- Generic fallback messages are widespread in button handlers: `src/components/admin-bookings-client.tsx:930`, `src/components/admin-bookings-client.tsx:1109`, `src/components/admin-bookings-client.tsx:1126`, `src/components/admin-bookings-client.tsx:1159`, `src/components/admin-bookings-client.tsx:1297`
- Dialog close/open race risk from animated presence + delayed cleanup: `src/components/admin-bookings-client.tsx:615`, `src/components/admin-bookings-client.tsx:627`, `src/components/motion/use-presence-exit.ts:36`
- Template Nginx config appears conceptually correct, but must be compared against deployed config: `deploy/nginx-http.conf:99`

## What We're NOT Doing

- No broad redesign of `/admin/bookings` layout or modal UX.
- No replacement of the animation/presence system across the app.
- No changes to admin authentication/session model unless a bug is directly confirmed in this audit.
- No full Nginx deployment automation rewrite; this plan only audits/fixes config correctness related to admin API action reliability.

## Implementation Approach

Use a targeted, layered approach:
1. Normalize server-side errors on the routes directly used by `/admin/bookings` actions (highest leverage, lowest UX churn).
2. Harden client-side action error parsing so non-JSON/redirect/HTML responses yield actionable diagnostics instead of generic messages.
3. Fix the booking dialog lifecycle race with minimal state-management changes (guard stale callbacks/requests and force reset by selected entity identity where appropriate).
4. Validate production proxy behavior against `deploy/nginx-http.conf`, document drift, and patch template/docs only if the repo config is deficient.

This sequencing reduces noise during debugging: once route responses are consistently JSON and client parsing is stronger, remaining intermittent issues become easier to isolate.

## Phase 1: Action Inventory And Reproduction Matrix

### Overview

Create a concrete action map and reproduce representative failures before patching, so fixes are tied to observed behavior and not assumptions.

### Changes Required

#### 1. Action Handler → Endpoint Inventory (research artifact extension)
**File**: `thoughts/research/2026-02-26_admin-bookings-button-actions-reliability-audit.md`
**Changes**: Add a compact matrix listing each `/admin/bookings` button action, client handler, endpoint/method (if any), and current generic fallback message.

#### 2. Reproduction Notes For Reported Failures
**Files**: `thoughts/research/2026-02-26_admin-bookings-button-actions-reliability-audit.md`, optional `thoughts/tickets/bug_admin_bookings_button_actions_reliability_audit.md`
**Changes**: Record exact click sequences and whether the issue is reproducible locally vs production-only (including deployment SHA and proxy observations if production).

### Success Criteria

#### Automated Verification
- [x] No code changes required in this phase

#### Manual Verification
- [ ] At least one reproducible path is captured for `Regenerate password` failure (or confirmed fixed by earlier deploy mismatch)
- [x] `Move booking` behavior is categorized as UX expectation mismatch, intermittent dialog race, or both

---

## Phase 2: Server-Side JSON Error Normalization For Admin-Bookings Routes

### Overview

Patch all routes directly exercised by `/admin/bookings` actions so unexpected exceptions return JSON using `jsonUnexpectedError()` (or consistent `NextResponse.json` error payloads), preventing opaque failures in the client.

### Changes Required

#### 1. Portal Credential Route Parity (`reveal`/`regenerate`)
**File**: `src/app/api/admin/customers/[id]/portal-credential/route.ts`
**Changes**:
- Add top-level `try/catch` wrapping the `POST` handler (and optionally `GET` for consistency)
- Preserve current domain-specific `404` behavior for known reveal failures
- Normalize unexpected exceptions (including regenerate path) to JSON 500
- Ensure both actions (`reveal`, `regenerate`) return parseable JSON error payloads on failure

#### 2. Route Sweep For Button-Triggered Endpoints
**Files**:
- `src/app/api/admin/customers/[id]/learning-materials/route.ts`
- `src/app/api/admin/learning-materials/[id]/route.ts`
- `src/app/api/admin/bookings/[id]/invoice/route.ts`
- `src/app/api/admin/bookings/[id]/notify/route.ts`
- `src/app/api/admin/booking-requests/[id]/notify/route.ts`
**Changes**:
- Add top-level `try/catch`
- Use `jsonUnexpectedError()` with route-specific fallback messages
- Preserve explicit validation/auth/not-found responses

#### 3. Test Coverage For Portal Credential Failure Normalization
**File**: `tests/admin-portal-credential.test.ts`
**Changes**:
- Add a targeted failure-path test (e.g., mock/induce regenerate exception) asserting JSON error response and stable status code

### Success Criteria

#### Automated Verification
- [x] `npm test -- tests/admin-portal-credential.test.ts`
- [x] `npm run typecheck`

#### Manual Verification
- [ ] `Regenerate password` no longer surfaces an opaque/non-JSON failure when route exceptions occur
- [ ] Representative notify/invoice/material actions return JSON errors in browser Network responses when forced to fail

---

## Phase 3: Client Action Error Handling Hardening In `/admin/bookings`

### Overview

Make client-side handlers produce clearer, more specific errors for non-JSON responses and proxy misbehavior while preserving current UX and action semantics.

### Changes Required

#### 1. Reusable Error-Parsing Utility For Action Handlers
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Expand or replace `readApiErrorMessage()` to accept `Response` (or response metadata) and gracefully handle:
  - JSON error payloads
  - non-JSON text/html responses
  - redirect-like statuses / auth statuses (`401/403`)
- Reuse this helper across major action handlers, not just `load()`

#### 2. Apply Helper Across High-Impact Actions
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Update handlers for portal credentials, booking/request mutations, notify, delete, learning materials, series removal, invoice creation
- Include route/action-specific fallbacks while surfacing status/context when payload is absent
- Preserve admin-login redirect behavior for `401/403` where appropriate

#### 3. Optional Instrumentation (Scoped)
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Add concise console diagnostics in development for non-JSON error responses on action requests (status + content-type), if this can be done without noisy production logs

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [ ] Generic catch-all messages are reduced for representative failures
- [ ] Browser network + UI messages allow distinguishing validation errors vs server exceptions vs proxy HTML/redirect responses

---

## Phase 4: Booking Dialog Open/Close Race Hardening (Move/Edit Reliability)

### Overview

Stabilize the booking dialog lifecycle so rapid close/open sequences and async secondary customer fetches cannot clear or corrupt the newly selected dialog state.

### Changes Required

#### 1. Guard Delayed Close Cleanup Against New Selections
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Prevent late `closeDialog()` cleanup callback from clearing a newly opened dialog selection
- Use a dialog session token / selected-key snapshot / monotonic counter to ignore stale close callbacks
- Keep animation behavior intact

#### 2. Reset Dialog Subtree By Selected Identity
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Key the dialog panel/form subtree by `${entityType}:${id}` (or equivalent) to ensure state reset when switching events
- Preserve nested dialog behavior (email/invoice) intentionally

#### 3. Guard Async Customer Fetch Against Stale Selection
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Snapshot selected event identity in `openDialog()` and ignore customer fetch responses for stale selections
- Optionally abort previous customer fetches if practical

#### 4. UX Copy Clarification For Move Action (If Needed)
**File**: `src/components/admin-bookings-client.tsx`
**Changes**:
- Add helper text near `Move booking` or date/time input clarifying that move uses the `Start` field in the current dialog (only if user confusion persists after reliability fix)

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [ ] Add/update focused test coverage if a practical component/unit test seam exists (otherwise document manual-only verification)

#### Manual Verification
- [ ] Clicking appointments repeatedly/rapidly consistently opens and retains the correct dialog content
- [ ] `Move booking` and `Move request` reliably use the `Start` field and complete without the dialog disappearing unexpectedly
- [ ] Customer details shown in dialog match the selected event after rapid reselection

---

## Phase 5: Production Proxy / Nginx Validation (Including `deploy/nginx-http.conf`)

### Overview

Verify whether production proxy behavior is contributing to generic admin action failures and ensure the repo template matches the required redirect/header semantics.

### Changes Required

#### 1. Review Repo Nginx Template For Admin/API Safety
**File**: `deploy/nginx-http.conf`
**Changes**:
- Audit redirect status codes (`308` preferred for canonical redirects)
- Confirm `/api/admin` handling inherits correct proxy headers and avoids redirect loops
- Confirm `X-Forwarded-Proto`, `Host`, `X-Real-IP`, `X-Forwarded-For` are set in admin/API locations
- Patch template only if an actual config defect is found

#### 2. Compare Template vs Deployed Nginx Config
**Files**: live droplet config (manual), `deploy/nginx-http.conf` (reference)
**Changes**:
- Document drift between deployed config and repo template
- Capture whether failing API actions return `30x`, HTML content, or JSON
- Record relevant Nginx access/error log evidence for a failing action

#### 3. Deployment/Docs Follow-Up (If Proxy Issue Confirmed)
**Files**: `deploy/README.md`, `README.md` (only if needed)
**Changes**:
- Add troubleshooting note for admin API action failures caused by redirects/HTML responses
- Document the network/log checks for future support workflows

### Success Criteria

#### Automated Verification
- [ ] `nginx -t` (only on target server if config changes are made)

#### Manual Verification
- [ ] Failing admin action requests on production/staging are confirmed to return JSON (or a proxy issue is explicitly identified and fixed)
- [ ] Deployed Nginx config behavior is compared with `deploy/nginx-http.conf`
- [ ] Admin mutation requests are not redirected with method-changing `301/302`

---

## Phase 6: End-to-End Regression Sweep And Ticket Closure

### Overview

Run the ticket’s representative action checks across local and deployed environments and capture residual risks/follow-up tickets if any intermittent edge cases remain.

### Changes Required

#### 1. Automated Regression Sweep
**Files**: tests and ticket/research artifacts
**Changes**:
- Run the agreed checks
- Record failures and splits if unrelated issues emerge

#### 2. Manual Admin Workflow Sweep
**Files**: ticket/research artifacts
**Changes**:
- Validate representative booking/request/customer/material actions
- Capture screenshots/network traces for any remaining issues

#### 3. Ticket/Thoughts Updates
**Files**:
- `thoughts/tickets/bug_admin_bookings_button_actions_reliability_audit.md`
- `thoughts/research/2026-02-26_admin-bookings-button-actions-reliability-audit.md`
- optional follow-up tickets
**Changes**:
- Mark implemented or split follow-ups with clear residual scope

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test` (with MySQL test DB configured)
- [x] `npm run build` (with MySQL `DATABASE_URL`)

#### Manual Verification
- [ ] `Regenerate password` / `Reveal password` work or fail with precise JSON-backed messages
- [ ] `Move booking` / `Move request` are stable and understandable
- [ ] Representative actions in booking/request/customer/materials flows complete successfully
- [ ] Production/staging proxy checks are documented, including `deploy/nginx-http.conf` comparison

---

## Testing Strategy

- Prioritize targeted API tests for route error normalization first (fast, deterministic).
- Add focused tests for portal credential failure behavior (`POST regenerate` exception path).
- For dialog race fixes, prefer minimal unit/component tests only if the current test setup can support them without heavy harness work; otherwise rely on a reproducible manual stress sequence and document it in the research/ticket.
- Run full suite (`npm test`) only after route/client changes stabilize to avoid noisy iteration costs.
- Validate build/tests with MySQL environment setup per current repo conventions (`TEST_DATABASE_URL` / MySQL provider).

## Performance Considerations

- Client error parsing should avoid reading large response bodies unnecessarily; only inspect body/content-type on non-OK responses.
- Dialog race hardening should avoid excessive re-renders; use lightweight identity snapshots/counters rather than broad state resets.
- Route-level `try/catch` normalization should not affect normal path performance materially.

## Migration Notes

- No database schema migration is planned for this ticket.
- If Nginx template changes are made, they require manual deployment to the droplet and `nginx -t` + reload on the server.
- Production validation should record deployed commit SHA and whether the running release matches the patched code before interpreting failures.

## References

- Ticket: `thoughts/tickets/bug_admin_bookings_button_actions_reliability_audit.md`
- Research: `thoughts/research/2026-02-26_admin-bookings-button-actions-reliability-audit.md`
- Main UI: `src/components/admin-bookings-client.tsx`
- Calendar UI: `src/components/admin-booking-calendar.tsx`
- Portal credential route: `src/app/api/admin/customers/[id]/portal-credential/route.ts`
- Shared API error helper: `src/lib/api-errors.ts`
- Presence helper: `src/components/motion/use-presence-exit.ts`
- Nginx template: `deploy/nginx-http.conf`

## Deviations from Plan

### Phase 4: Booking Dialog Open/Close Race Hardening (Move/Edit Reliability)
- **Original Plan**: Add/update focused automated coverage for the dialog race if a practical seam exists.
- **Actual Implementation**: Implemented dialog session guards, keyed dialog panel reset, and move-field UX copy clarification without adding UI-level automated tests.
- **Reason for Deviation**: The current test suite is route/domain heavy and does not include a lightweight component harness for the modal presence/animation lifecycle. Adding one would materially expand scope/risk for this bugfix pass.
- **Impact Assessment**: Risk reduced by targeted code hardening and broad regression checks, but intermittent dialog behavior still requires manual UI verification.
- **Date/Time**: 2026-02-26T00:51:48+11:00

### Phase 5: Production Proxy / Nginx Validation (Including `deploy/nginx-http.conf`)
- **Original Plan**: Compare repo template with deployed Nginx config and capture live failing admin action responses/logs.
- **Actual Implementation**: Reviewed `deploy/nginx-http.conf` locally and confirmed the template appears correct for redirects/proxy headers; no repo template patch was required. Live droplet config comparison and browser/network evidence capture were not performed in this local session.
- **Reason for Deviation**: No access to the target droplet's active Nginx config/process/logs from this workspace session.
- **Impact Assessment**: Code-side reliability improvements are implemented, but proxy drift remains an unresolved production-only confounder until manual droplet verification is completed.
- **Date/Time**: 2026-02-26T00:51:48+11:00
