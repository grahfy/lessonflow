# Admin Visual Calendar Booking Dialog Implementation Plan

## Overview
Implement a calendar-first admin booking interface where confirmed bookings and pending requests are shown visually, status-colored, and editable through a popup dialog that also supports manual customer reminders and custom emails, with polished in-ease/out-ease UI animations. Pending items are shown only when they fall in the current calendar range, and cancelled/rejected items remain visible for 48 hours.

## Current State Analysis
- Admin bookings UI is currently list-based (`Bookings` + `Pending Approvals`) and not event-calendar based (`src/components/admin-bookings-client.tsx:184`).
- Booking move currently uses `window.prompt` instead of an in-app dialog form (`src/components/admin-bookings-client.tsx:82`).
- The booking item PATCH API already supports `cancel`, `move`, and limited `edit` (notes only), so the backend has a foundation for dialog actions (`src/app/api/admin/bookings/[id]/route.ts:31`).
- Pending approvals are fetched from a separate endpoint and rendered in a separate panel, not merged into one visual timeline (`src/components/admin-bookings-client.tsx:49`, `src/components/admin-bookings-client.tsx:214`).
- Email infrastructure already exists (SMTP send + `OutboundEmail` log fallback), but there is no manual reminder/custom-email API entrypoint from admin UI (`src/lib/email/service.ts:39`).

## Desired End State
- Admin can view a visual day/week/month calendar that includes:
  - Confirmed bookings in green.
  - Pending requests in yellow.
- Pending requests are rendered only when `requestedStartAt` is inside the active day/week/month range.
- Cancelled bookings and rejected requests remain visible for up to 48 hours, then drop from the default calendar view.
- Clicking any calendar event opens a popup dialog with full customer and booking/request details.
- In popup, admin can:
  - Edit details.
  - Move date/time.
  - Cancel booking/request.
  - Send a manual reminder/notification email.
  - Send a custom email.
- Moving a confirmed booking automatically sends a customer update email.
- Calendar events, dialog open/close, and transient notices use subtle in-ease/out-ease animations for better interaction feedback.
- Existing approval/rejection, recurring behavior, audit logs, and admin authentication remain intact.

### Key Discoveries
- `src/components/admin-bookings-client.tsx:188` renders bookings as cards, not events.
- `src/components/admin-bookings-client.tsx:217` renders pending requests separately, making unified event color coding impossible without a new data model in UI.
- `src/app/api/admin/bookings/route.ts:19` returns only `Booking` rows, excluding pending requests.
- `src/app/api/admin/bookings/[id]/route.ts:85` supports `edit` but only updates `notes`.
- `src/lib/email/templates.ts:72` only has generic status emails; reminder/custom-message templates do not exist yet.

## What We're NOT Doing
- Replacing admin auth/session design.
- Adding drag-and-drop recurrence editing semantics (`this event` vs `series`) in this change.
- Building SMS/push channels.
- Reworking public site visuals outside admin booking workflow.

## Design Options
1. Extend existing list UI with status badges and inline detail drawers.
Pros: minimal changes, low risk.
Cons: does not satisfy requirement for visual calendar setup.

2. Introduce a calendar-first event layer with modal details/actions.
Pros: directly matches required UX, scales better for day/week/month operations.
Cons: larger client refactor and additional state management.

Selected approach: Option 2.

## Implementation Approach
- Build a unified admin event DTO (`booking` + `pending_request`) with color/status mapping in a single feed.
- Render day/week/month in a visual calendar component and use event click to open a modal dialog.
- Route dialog actions to explicit APIs:
  - booking mutate (edit/move/cancel),
  - request mutate (edit/move/cancel/approve/reject), with pending cancel mapped to `rejected`,
  - notify endpoints for reminder/custom email.
- Add dedicated email templates for reminder and admin custom messages.
- Trigger automatic customer update email on confirmed-booking move operations.
- Add a shared motion pattern (duration/easing tokens) for event state transitions and dialog enter/exit animations, with `prefers-reduced-motion` support.
- Keep all actions auditable and logged to `BookingAuditLog` (for booking records) plus `OutboundEmail`; include communication actions in audit history.

## Phase 1: Calendar Event Data Contract

### Overview
Create a unified data contract for confirmed bookings and pending requests suitable for visual rendering and dialog hydration.

### Changes Required
#### 1. Unified Events API
**File**: `src/app/api/admin/bookings/route.ts`  
**Changes**: Extend GET response to include both confirmed bookings and pending requests in one `events` payload with event type, status, and color token (`green` for confirmed, `yellow` for pending). Pending events must be filtered to the active range, and cancelled/rejected events should be included only for the 48-hour post-status-change window.

#### 2. View Range Reuse
**File**: `src/lib/calendar-range.ts`  
**Changes**: Reuse existing day/week/month range logic for both bookings and pending request date filters.

#### 3. Event Types
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**: Introduce discriminated union type for `booking` vs `pending_request` events and normalize date parsing/formatting.

### Success Criteria
#### Automated Verification
- [x] `npm run test -- admin-bookings`
- [x] Add/update API tests verifying both confirmed + pending are returned in selected range.

#### Manual Verification
- [ ] API response for each view contains unified events with status metadata.
- [ ] Pending and confirmed entries align to expected calendar dates in Melbourne time.

---

## Phase 2: Visual Calendar UI with Status Colors

### Overview
Replace list-first admin booking rendering with a visual calendar surface for day/week/month.

### Changes Required
#### 1. Calendar Component
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**: Replace card list block with calendar rendering and event click handling.

#### 2. Optional Component Extraction
**File**: `src/components/admin-booking-calendar.tsx`  
**Changes**: Create a dedicated calendar component for event rendering and status color styling.

#### 3. Styling
**File**: `src/styles/globals.css`  
**Changes**: Add calendar layout styles, event chips, legend, and explicit status color rules:
- Confirmed: green palette.
- Pending: yellow palette.

#### 4. Motion and Easing
**File**: `src/styles/globals.css`  
**Changes**: Add animation tokens and transitions for:
- event chip enter/hover/focus,
- popup backdrop and panel in-ease/out-ease,
- toast/notice appearance and dismissal,
- reduced-motion fallback (`@media (prefers-reduced-motion: reduce)`).

### Success Criteria
#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`

#### Manual Verification
- [ ] Day/week/month views are visually navigable.
- [ ] Confirmed events are green and pending events are yellow.
- [ ] Event and UI transitions use smooth in-ease/out-ease motion without distracting jitter.
- [ ] Mobile and desktop layouts remain usable.

---

## Phase 3: Booking Detail Popup Dialog and Core Actions

### Overview
Introduce click-to-open popup dialog that shows full details and supports edit, move, cancel flows.

### Changes Required
#### 1. Dialog UI
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**: Add selected-event state, popup open/close logic, and editable form fields for booking/request details.

#### 2. Booking Mutation Enhancements
**File**: `src/app/api/admin/bookings/[id]/route.ts`  
**Changes**: Expand `edit` action beyond `notes` to support name/email/phone/address/mode/level/duration/time updates from dialog.

#### 3. Pending Request Mutation Enhancements
**File**: `src/app/api/admin/booking-requests/[id]/route.ts`  
**Changes**: Add editable pending-request update action (details + requested time) and add cancel/reject handling from dialog controls; popup cancel maps to `rejected`.

### Success Criteria
#### Automated Verification
- [x] Add/extend tests for booking PATCH `edit/move/cancel`.
- [x] Add/extend tests for pending request PATCH `edit/reject`.

#### Manual Verification
- [ ] Clicking an event opens popup with full details.
- [ ] Dialog open/close uses in-ease/out-ease motion and feels responsive on desktop and mobile.
- [ ] Edit, move, and cancel actions work from popup and refresh calendar state.
- [ ] Moving a confirmed booking triggers automatic customer update email.
- [ ] Approval/rejection still works for pending requests.

---

## Phase 4: Manual Reminder and Custom Email Actions

### Overview
Support direct customer communication from the popup without changing booking status.

### Changes Required
#### 1. Reminder + Custom Templates
**File**: `src/lib/email/templates.ts`  
**Changes**: Add templates/functions for:
- booking reminder notification,
- admin custom-email wrapper with safe HTML/text formatting.

#### 2. Notification APIs
**File**: `src/app/api/admin/bookings/[id]/notify/route.ts`  
**Changes**: Add secured endpoint for reminder/custom send for confirmed bookings.
**File**: `src/app/api/admin/booking-requests/[id]/notify/route.ts`  
**Changes**: Add secured endpoint for pending requests.

#### 3. Audit Trail for Communication
**File**: `prisma/schema.prisma`  
**Changes**: Extend `AuditAction` with communication events (for example `reminder_sent`, `custom_email_sent`) and write corresponding `BookingAuditLog` rows when manual reminder/custom emails are sent. For pending-request notifications, include `requestId` in audit `details` if no booking record exists yet.

#### 4. Dialog Actions
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**: Add popup controls:
- `Send reminder`,
- `Send custom email` (subject + message form),
- success/error feedback.

### Success Criteria
#### Automated Verification
- [x] Add tests for notify route authorization and payload validation.
- [x] Add template tests for reminder/custom subjects and body content.

#### Manual Verification
- [ ] Reminder email can be sent from popup for both confirmed and pending records.
- [ ] Custom email sends with admin-entered subject/body.
- [ ] OutboundEmail logs include these sends/fallback queues.

---

## Phase 5: Hardening and Regression Coverage

### Overview
Ensure the new admin workflow is reliable and does not regress existing booking behavior.

### Changes Required
#### 1. Regression Tests
**File**: `tests/admin-bookings.test.ts`  
**Changes**: Cover unified events response and status-color mapping contract, pending-in-range filtering, and 48-hour cancelled/rejected visibility window.
**File**: `tests/booking-events.test.ts`  
**Changes**: Cover reminder/custom email queue behavior and move-triggered automatic customer update emails.

#### 2. Operational Notes
**File**: `README.md`  
**Changes**: Document new admin popup actions and manual notification behavior.

### Success Criteria
#### Automated Verification
- [x] `npm run test`
- [x] `npm run lint && npm run typecheck && npm run build`

#### Manual Verification
- [ ] End-to-end admin flow: view calendar -> open popup -> edit -> move -> send reminder -> send custom email -> cancel.
- [ ] No console errors during main admin interactions.

---

## Testing Strategy
- Unit tests for template generation and payload validation logic.
- Route tests for admin auth enforcement and mutation behaviors.
- Component-level checks for event selection and dialog state transitions.
- Motion behavior checks: verify transitions are disabled or simplified when `prefers-reduced-motion` is enabled.
- Manual responsiveness checks at desktop and mobile breakpoints.

## Performance Considerations
- Query only current visible range (already supported by `view` + `date` range).
- Keep event payload minimal for initial calendar render, hydrate extra details on dialog open when needed.
- Avoid full-page reload; perform optimistic refresh of affected event after action.

## Migration Notes
- Implement behind a feature branch and verify admin-only routes before merge.
- Keep existing list controls as fallback until calendar dialog actions reach parity; remove fallback in final cleanup commit.
- No data migration required for initial rollout; existing booking/request tables already carry required fields.

## References
- Ticket: `thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md`
- Prior booking/admin ticket: `thoughts/tickets/2026-02-19-booking-contact-admin-system.md`
- Existing implementation plan: `thoughts/plans/booking-contact-admin-implementation-plan.md`
- Current admin UI: `src/components/admin-bookings-client.tsx:34`
- Booking list render: `src/components/admin-bookings-client.tsx:188`
- Pending approvals render: `src/components/admin-bookings-client.tsx:217`
- Calendar range API: `src/app/api/admin/bookings/route.ts:8`
- Booking mutation API: `src/app/api/admin/bookings/[id]/route.ts:14`
- Pending request mutation API: `src/app/api/admin/booking-requests/[id]/route.ts:23`
- Email service/logging: `src/lib/email/service.ts:39`
