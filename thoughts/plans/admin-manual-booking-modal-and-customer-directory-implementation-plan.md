# Admin Manual Booking Modal and Customer Directory Implementation Plan

## Overview
Implement a customer-first admin workflow by moving manual booking creation into a popup and introducing a reusable customer directory with CRUD, selection, and duplicate-detection support. The plan preserves the existing calendar/event dialog behavior while reducing repeat data entry for returning students.

## Current State Analysis
- Manual booking is currently always visible as a full inline card under the calendar, not launched by a button (`src/components/admin-bookings-client.tsx:623`).
- The legend/status chips already exist in a separate card and are the right anchor point for action buttons (`src/components/admin-bookings-client.tsx:577`).
- Manual booking submission posts directly to `/api/admin/bookings` using a payload built from form fields (`src/components/admin-bookings-client.tsx:484`, `src/components/admin-bookings-client.tsx:520`).
- Backend manual booking create uses `bookingRequestSchema` and writes directly to `Booking`/`BookingSeries`; no customer entity exists today (`src/app/api/admin/bookings/route.ts:115`, `src/app/api/admin/bookings/route.ts:125`, `src/app/api/admin/bookings/route.ts:180`).
- Prisma models store customer details on each booking/request/series record but there is no reusable customer table (`prisma/schema.prisma:60`, `prisma/schema.prisma:91`, `prisma/schema.prisma:119`).
- Existing admin tests cover unified calendar feed and booking/request mutations; they do not cover customer CRUD/linking yet (`tests/admin-bookings.test.ts:46`, `tests/admin-booking-mutations.test.ts:28`).

### Key Discoveries
- Manual-booking UI and submission logic are already centralized in one component and can be moved into a modal without touching route structure (`src/components/admin-bookings-client.tsx:484`, `src/components/admin-bookings-client.tsx:623`).
- Dialog overlay infrastructure already exists and supports stacked modals, which can be reused for both Manual Booking and Customers popups (`src/components/admin-bookings-client.tsx:844`, `src/components/admin-bookings-client.tsx:1128`, `src/styles/globals.css:666`).
- Current schema denormalizes customer data into bookings/requests/series; adding a customer table should be additive (optional `customerId`) to avoid historical regressions (`prisma/schema.prisma:60`, `prisma/schema.prisma:119`).
- README and manual verification checklists already track admin operations and should be expanded for customer workflows (`README.md:75`).

## Desired End State
- A compact action row appears under the status legend with two buttons:
  - `Add Manual Booking`
  - `Customers`
- `Add Manual Booking` opens a popup that:
  - supports selecting existing customer records,
  - auto-fills customer fields when selected,
  - still allows manual entry for new customers,
  - detects existing customers from entered email/phone and asks for confirmation before save.
- `Customers` opens a popup directory/table with name, phone, email, skill level, plus create/edit/delete actions.
- Booking create flow links to `Customer` when possible while preserving snapshot fields on bookings/requests/series.
- Delete behavior is safe for historical records (archive-first semantics behind UI delete action).
- Existing calendar flows (approve/reject/move/cancel/email) continue working unchanged.

## What We're NOT Doing
- Replacing calendar/event data contracts or status colors.
- Rewriting public booking request UX.
- Introducing fuzzy ML matching or probabilistic dedupe outside deterministic email/phone normalization.
- Deleting historical booking data when customer records are deleted.

## Design Options
1. No customer table, only UI-level autocomplete from past bookings.
   - Pros: fewer schema changes.
   - Cons: weak CRUD model, fragile dedupe, difficult list management.
2. Dedicated `Customer` model + optional links from booking/request/series (selected).
   - Pros: explicit customer database, reliable selection, clean CRUD API, future extensibility.
   - Cons: migration and backfill complexity.
3. Separate customer management page instead of modal.
   - Pros: scalable for very large directories.
   - Cons: does not match requested popup workflow and adds navigation overhead.

Selected approach: Option 2 with modal-based management for UX alignment and long-term maintainability.

## Implementation Approach
- Add a first-class `Customer` model and `customerId` optional relations on `Booking`, `BookingRequest`, and `BookingSeries`.
- Keep existing denormalized name/contact/address fields on booking entities as immutable snapshots for historical integrity.
- Add admin customer APIs (`GET/POST/PATCH/DELETE`) with safe archive behavior.
- Refactor manual booking UI to modal-based flow and add customer selector + duplicate confirmation handshake.
- Extend manual booking create API to:
  - accept `customerId`,
  - run deterministic duplicate checks by normalized email/phone when `customerId` is absent,
  - return a structured conflict payload for user confirmation when a likely customer exists.

## Phase 1: Data Model and Migration

### Overview
Introduce `Customer` persistence and relational links while keeping existing booking schemas backward-compatible.

### Changes Required

#### 1. Prisma Schema
**File**: `prisma/schema.prisma`  
**Changes**:
- Add `Customer` model with:
  - `id`, `fullName`, `email`, `phone`, `skillLevel`,
  - normalized lookup fields (`normalizedEmail`, `normalizedPhone`),
  - optional address snapshot fields,
  - `isArchived`, `createdAt`, `updatedAt`.
- Add optional `customerId` relation fields on:
  - `BookingRequest`,
  - `BookingSeries`,
  - `Booking`.
- Add indexes for directory listing and matching (`isArchived`, normalized fields, `fullName`).

#### 2. Migration and Backfill
**Files**:
- `prisma/migrations/<timestamp>_add_customer_directory/migration.sql`
- `scripts/backfill-customers.ts` (or migration-safe equivalent)
**Changes**:
- Create new customer table and foreign keys.
- Backfill customers from existing bookings/requests by normalized email first, then phone.
- Populate `customerId` on historical rows where deterministic match exists.

### Success Criteria

#### Automated Verification
- [ ] `npx prisma validate`
- [ ] `npm run test:prepare`

#### Manual Verification
- [ ] Existing admin bookings page still loads after migration.
- [ ] Existing booking/request rows remain accessible and unchanged in calendar display.

---

## Phase 2: Customer API and Matching Utilities

### Overview
Build backend endpoints and deterministic matching logic needed by both popups and manual booking submit flow.

### Changes Required

#### 1. Customer Route Handlers
**Files**:
- `src/app/api/admin/customers/route.ts`
- `src/app/api/admin/customers/[id]/route.ts`
**Changes**:
- `GET /api/admin/customers`: paged/searchable list for modal table.
- `POST /api/admin/customers`: create customer with normalization + duplicate guards.
- `PATCH /api/admin/customers/[id]`: edit details.
- `DELETE /api/admin/customers/[id]`: archive (safe delete semantics) when linked records exist; hard delete only when fully unlinked.

#### 2. Shared Matching Utilities
**File**: `src/lib/customer-match.ts` (new)  
**Changes**:
- Normalize email (trim/lowercase).
- Normalize phone (digits only; AU-compatible).
- Deterministic matcher priority:
  1. exact normalized email,
  2. exact normalized phone.
- Provide helper to diff form fields against matched customer for UI confirmation messaging.

#### 3. Manual Booking API Extension
**File**: `src/app/api/admin/bookings/route.ts`  
**Changes**:
- Extend POST payload contract with:
  - optional `customerId`,
  - optional `matchResolution` (`use_existing` | `create_new` | `update_existing`).
- If `customerId` provided, attach link and hydrate customer snapshot defaults.
- If no `customerId`, attempt matcher and return `409` with candidate payload when a deterministic match is found and confirmation is required.
- On success, ensure booking/series rows store both `customerId` and current snapshot fields.

### Success Criteria

#### Automated Verification
- [ ] Add tests for customer CRUD route auth + validation.
- [ ] Add tests for manual booking POST conflict/confirm flows.
- [ ] `npm run test -- admin-bookings admin-booking-mutations`

#### Manual Verification
- [ ] Unauthorized customer API requests return `401`.
- [ ] Customer create/edit/archive behaves correctly for linked and unlinked records.
- [ ] Manual booking returns explicit conflict payload when matching existing customer details are detected.

---

## Phase 3: Admin UI Refactor (Buttons + Popups)

### Overview
Convert always-on manual booking form to modal workflow and add a customer directory popup aligned to requested UX.

### Changes Required

#### 1. Action Row Under Legend
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**:
- Keep legend card.
- Add button row directly under legend with:
  - `Add Manual Booking`,
  - `Customers`.
- Remove inline always-visible manual booking card (`src/components/admin-bookings-client.tsx:623`).

#### 2. Manual Booking Popup
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**:
- Move existing manual form sections into a modal panel.
- Add customer selector (search + select) above manual fields.
- Auto-populate form when customer selected.
- Submit flow:
  - first attempt create,
  - if API responds with `409` match candidate, open confirmation UI:
    - use existing customer,
    - create new anyway,
    - optionally apply selected customer details to form before retry.

#### 3. Customers Popup
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**:
- Add directory popup with list/table columns:
  - Name,
  - Contact number,
  - Email,
  - Skill level.
- Add `Create New`, `Edit`, `Delete` controls (popup-based forms).
- Refresh list after CRUD actions and keep admin notices/errors consistent with existing patterns.

#### 4. Styling and Responsiveness
**File**: `src/styles/globals.css`  
**Changes**:
- Add styles for:
  - legend action row,
  - customers table/list in modal,
  - modal layout variants for manual booking and customer CRUD forms.
- Preserve existing mobile breakpoints and dialog layering behavior (`src/styles/globals.css:666`, `src/styles/globals.css:789`).

### Success Criteria

#### Automated Verification
- [ ] Add/extend UI behavior tests where practical (logic-level state tests or route-mock integration tests).

#### Manual Verification
- [ ] Legend remains visible with status chips and new action buttons under it.
- [ ] Manual booking popup opens/closes smoothly and submits successfully.
- [ ] Customer popup can create/edit/delete entries.
- [ ] Selecting a customer pre-fills booking form.
- [ ] Manual entry duplicate detection triggers confirmation workflow.

---

## Phase 4: Validation, Regression, and Test Environment Sync

### Overview
Ensure the new flows are fully testable and documented in the same change set.

### Changes Required

#### 1. Test Coverage Expansion
**Files**:
- `tests/admin-bookings.test.ts`
- `tests/admin-booking-mutations.test.ts`
- `tests/admin-customers.test.ts` (new)
- `tests/admin-manual-booking-customer-match.test.ts` (new)
**Changes**:
- Extend `beforeEach` cleanup to include customer table.
- Verify customer CRUD, archive/delete guard, customer linking on manual create, and conflict-confirm handshake.

#### 2. Test Environment and Docs Sync
**Files**:
- `README.md`
- `thoughts/tickets/2026-02-19-admin-manual-booking-modal-and-customer-directory.md`
**Changes**:
- Update admin operations section with new button/modal/customer flows.
- Add manual verification checklist items for customer selector and duplicate confirmation behavior.
- Keep ticket status at `planned` until implementation starts.

### Success Criteria

#### Automated Verification
- [ ] `npm run test:prepare`
- [ ] `npm test`

#### Manual Verification
- [ ] Full admin smoke test:
  - login,
  - view calendar,
  - open event dialog,
  - open manual booking popup,
  - create booking from selected customer,
  - create booking with manual duplicate detection,
  - manage customers via popup CRUD.

---

## Testing Strategy
- Unit/integration tests for normalization/matching helpers.
- API route tests for:
  - customer CRUD,
  - manual booking conflict responses,
  - confirmed booking create linked to customer.
- Regression tests for calendar feed and booking/request mutation endpoints.
- Manual UX validation for modal layering, focus behavior, and mobile rendering.

## Performance Considerations
- Customer list endpoint should support server-side search and page size caps to avoid loading all customers at once.
- Modal rendering should avoid mounting heavy lists/forms until opened.
- Keep calendar query payload stable; customer data should be fetched independently to avoid bloating event payloads.

## Migration Notes
- Backfill must be deterministic and idempotent.
- Preserve existing booking/request/series contact snapshots even when linked customer profile later changes.
- For delete behavior:
  - if linked records exist, treat delete as archive (`isArchived = true`);
  - if unlinked, allow hard delete.

## Workflow Suggestions (Recommended)
1. Default the manual booking popup to “Select existing customer” first, with “Create one-off customer details” as an explicit secondary path. This reduces duplicates.
2. Use deterministic match rules only (normalized email first, then phone) to avoid false positives from name-only matching.
3. Add an “Update customer profile from this booking” checkbox in confirmation flow so admins can intentionally refresh stored customer details when needed.
4. Keep customer profile separate from booking snapshot fields; this protects historical records and reporting consistency.
5. Label UI action as `Delete` but implement archive-safe behavior under the hood to prevent accidental data loss.

## References
- Ticket: `thoughts/tickets/2026-02-19-admin-manual-booking-modal-and-customer-directory.md`
- Related prior ticket: `thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md`
- Related research: `thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md`
- Manual booking UI and submit flow: `src/components/admin-bookings-client.tsx:484`, `src/components/admin-bookings-client.tsx:623`
- Legend/status anchor location: `src/components/admin-bookings-client.tsx:577`
- Manual booking POST handler: `src/app/api/admin/bookings/route.ts:108`
- Existing schema baseline: `prisma/schema.prisma:60`, `prisma/schema.prisma:91`, `prisma/schema.prisma:119`
- Existing admin tests baseline: `tests/admin-bookings.test.ts:46`, `tests/admin-booking-mutations.test.ts:28`
