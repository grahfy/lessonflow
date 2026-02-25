# Admin Bookings Error Hardening And Login Title Implementation Plan

## Overview

Resolve misleading admin bookings load failures that tell users to sign in again when the underlying failure is a non-auth server/network issue, and rename the admin login page title to `Booking Console Login`.

## Current State Analysis

The admin bookings client redirected correctly on `401`, but it also used sign-in wording as the fallback for non-JSON/non-auth errors. This caused backend failures to surface as authentication issues in the UI.

The `/api/admin/bookings` GET handler did not wrap database/range processing in a top-level `try/catch`, so unexpected exceptions could return a non-JSON error page and trigger the misleading fallback message.

The admin login page heading and route title were not aligned with the requested `Booking Console Login` wording.

## Desired End State

Admin bookings page should:
- Redirect to `/admin/login` only for auth failures (`401/403`).
- Show accurate retry-oriented messaging for server/network failures.
- Receive JSON error responses from `/api/admin/bookings` even on unexpected backend exceptions.

Admin login page should display and expose the updated `Booking Console Login` title.

### Key Discoveries
- Misleading non-auth fallback message in admin bookings load path at `src/components/admin-bookings-client.tsx:448`.
- `/api/admin/bookings` GET lacked top-level exception normalization before this change at `src/app/api/admin/bookings/route.ts:61`.
- Admin login page heading/title lives in `src/app/admin/login/page.tsx:12`.

## What We're NOT Doing

- Refactoring all admin clients into a shared fetch/error utility.
- Changing admin auth/session token format or cookie configuration.
- Reworking admin route structure or navigation IA.

## Implementation Approach

Use a focused patch with three pieces:
1. Harden `/api/admin/bookings` GET with date validation and JSON error normalization.
2. Update admin bookings client error handling to reserve redirects for auth statuses and use neutral fallback messages for non-auth failures.
3. Rename admin login page heading and set route metadata title to `Booking Console Login`.

## Phase 1: Admin Bookings Error Handling Hardening

### Overview

Normalize backend and frontend behavior so admin users see accurate error messages and auth redirects only happen for actual authorization failures.

### Changes Required

#### 1. Admin bookings API response normalization
**File**: `src/app/api/admin/bookings/route.ts`
**Changes**: Wrap GET handler body in `try/catch`, validate parsed calendar range dates, and return JSON error payloads for invalid input / unexpected failures.

#### 2. Admin bookings client load error classification
**File**: `src/components/admin-bookings-client.tsx`
**Changes**: Add safe API error message reader, treat `401/403` as auth redirects only, and replace sign-in fallback text with non-auth retry guidance for 4xx/5xx/network/unexpected-response cases.

#### 3. Admin login title update
**File**: `src/app/admin/login/page.tsx`
**Changes**: Set route metadata title and visible heading to `Booking Console Login`.

#### 4. Login success navigation hardening (related robustness)
**File**: `src/components/admin-login-form.tsx`
**Changes**: Use full-page navigation after successful login so the first admin page/data requests consistently include the fresh httpOnly session cookie.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint` (passes with unrelated existing warning in `src/components/student-portal-client.tsx`)

#### Manual Verification
- [ ] Sign in via `/admin/login` and confirm the page heading reads `Booking Console Login`.
- [ ] Confirm admin login browser tab title includes `Booking Console Login`.
- [ ] Load `/admin/bookings` while authenticated and verify calendar data renders normally.
- [ ] Simulate a backend failure (or invalid date query) and verify the bookings page shows a retry-oriented error instead of a sign-in message.
- [ ] Expire/logout session and verify `/admin/bookings` redirects to `/admin/login` (no persistent error banner).

---

## Testing Strategy

Prioritize type safety and lint validation for touched files, then manually verify auth and non-auth failure paths in the admin bookings UI because the user-reported issue is runtime-state-dependent.

## Performance Considerations

No material performance impact. Changes affect error branching and response normalization only.

## Migration Notes

No migration or environment changes required.

## References
- Ticket: Ad hoc user request (2026-02-25)
- Research: Codebase inspection of admin bookings/auth flow (`src/components/admin-bookings-client.tsx`, `src/app/api/admin/bookings/route.ts`, `src/components/admin-login-form.tsx`)
