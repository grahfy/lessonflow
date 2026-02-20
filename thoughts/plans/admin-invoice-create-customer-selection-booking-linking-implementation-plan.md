# Admin Invoice Create: Customer Selection, Booking Linking, and Flexible Price Input Implementation Plan

## Overview
Refactor admin invoice creation so invoices are created from selected existing customers, optionally linked to a booking, and can be either lesson-based or standalone. The create flow will accept common AUD entry formats (`$50.00`, `$50`, `50`, `50.00`) and remove payload-shape mismatches that currently produce `Invalid invoice payload.`.

## Current State Analysis
- The `Create Invoice` modal currently captures manual customer snapshot fields and has no customer picker (`src/components/admin-invoices-client.tsx:770`).
- Client create logic assumes a lesson fee line item is always present and parses amounts with `Number.parseFloat` (`src/components/admin-invoices-client.tsx:443`), which rejects `$`-prefixed values.
- Global create payload validation requires full customer snapshot fields even if `customerId` is supplied (`src/lib/invoices/schema.ts:39`).
- Global create route supports optional `customerId` and `bookingId` checks but still writes customer snapshot from request body, not from selected customer (`src/app/api/admin/invoices/route.ts:127`, `src/app/api/admin/invoices/route.ts:159`).
- Customer-scoped create route snapshots selected customer automatically but does not currently allow optional `bookingId` in its create schema (`src/app/api/admin/customers/[id]/invoices/route.ts:141`).
- Booking-scoped create route already proves booking-linking behavior and customer/booking snapshots work when linked (`src/app/api/admin/bookings/[id]/invoice/route.ts:92`).

## Desired End State
- Admin can open `Create Invoice`, search/select an existing customer, and proceed without manually entering customer identity fields.
- Admin can optionally link invoice to one booking/appointment belonging to that customer.
- Admin can choose invoice basis:
  - lesson-based (default): includes lesson fee + optional extras,
  - standalone: no lesson fee required; custom line-item driven invoice.
- Price fields accept `$50.00`, `$50`, `50`, and `50.00` while storing integer cents.
- API validation accepts customer-selected create payloads without forcing duplicate customer snapshot strings.
- `Invalid invoice payload.` frequency drops because modal validation and API contract are aligned.

### Key Discoveries
- Create modal state and fields are fully local and can be refactored without route/page changes (`src/components/admin-invoices-client.tsx:107`).
- Current `createInvoice` method already chooses different endpoints based on `customerId` filter context (`src/components/admin-invoices-client.tsx:508`), so endpoint strategy can be consolidated there.
- Existing customer list API already provides suitable search + selection payloads for picker UIs (`src/app/api/admin/customers/route.ts:24`).
- `createInvoiceSchema` is the primary blocker for customer-selected global create because it always requires manual customer snapshot fields (`src/lib/invoices/schema.ts:42`).

## What We're NOT Doing
- Reworking invoice send/reminder/payment lifecycle actions.
- Altering invoice PDF template structure beyond existing invoice data fields.
- Introducing online payments or accounting-system sync.
- Replacing the existing booking-dialog `Create Invoice` endpoint behavior unless required for schema consistency.

## Design Options
1. Keep current endpoints and add customer picker that still submits manual snapshot fields.
- Pros: minimal backend changes.
- Cons: duplicates customer data entry risks, does not fix payload mismatch root cause cleanly.

2. Use customer-scoped create endpoint for selected customers and extend it with optional `bookingId` validation (selected).
- Pros: snapshot stays server-derived from canonical customer record, smaller schema churn, clear ownership of booking/customer validation.
- Cons: requires modal to switch endpoint + requires new customer-booking list query.

3. Rework global create schema to allow either `customerId` or full snapshot, and do all creation via `/api/admin/invoices`.
- Pros: single endpoint contract.
- Cons: more conditional schema complexity and broader regression surface.

Selected approach: Option 2, with a fallback-safe adjustment in global create route only if needed for parity.

## Implementation Approach
- Add a customer-picker-first create modal flow.
- Add optional booking selector populated from selected customer bookings.
- Introduce shared currency parsing utility for flexible AUD input syntax.
- Extend customer-scoped invoice create route to accept optional `bookingId` with ownership checks.
- Add invoice-basis mode to support standalone invoices that are not lesson-based.
- Keep persistence model unchanged (no schema migration required) since `bookingId` is already nullable on `Invoice`.

## Phase 1: API Contract and Validation Alignment

### Overview
Align API payload contracts to selected-customer + optional-booking create behavior and remove current create validation mismatch.

### Changes Required

#### 1. Extend customer-scoped create route for booking linking
**File**: `src/app/api/admin/customers/[id]/invoices/route.ts`
**Changes**:
- Extend `createCustomerInvoiceSchema` to include optional `bookingId`.
- Validate that `bookingId` exists and belongs to selected customer.
- Pass `bookingId` into `createInvoiceRecord` when valid.
- Return precise validation errors (`booking not found`, `booking does not belong to selected customer`).

#### 2. Harden global create route parity checks
**File**: `src/app/api/admin/invoices/route.ts`
**Changes**:
- Ensure booking/customer cross-validation if both IDs are supplied.
- Improve error details surfaced for create-schema failures and date parsing failures.
- Keep backward compatibility for existing payloads.

#### 3. Update create schemas
**File**: `src/lib/invoices/schema.ts`
**Changes**:
- Add customer-scoped create schema type export with optional `bookingId`.
- Keep line-item constraints strict (quantity >= 1, non-negative cents).
- Clarify schema comments for customer-selected vs manual snapshot flows.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] Add/extend API tests for customer-scoped create with `bookingId` valid/invalid ownership.

#### Manual Verification
- [ ] Creating invoice for selected customer + linked appointment succeeds.
- [ ] Linking a booking from another customer is blocked with clear error.

---

## Phase 2: Customer Picker + Booking Selector UX

### Overview
Replace manual customer identity entry with DB-backed customer selection and optional appointment linking.

### Changes Required

#### 1. Create modal data model refactor
**File**: `src/components/admin-invoices-client.tsx`
**Changes**:
- Remove manual customer name/email/phone/address fields from create modal.
- Add customer search input and selected-customer state (`id`, display summary).
- Fetch customer options from `/api/admin/customers?q=&limit=`.
- Add optional booking selector populated from selected customer bookings.

#### 2. Booking list source for selected customer
**Files**:
- `src/app/api/admin/customers/[id]/invoices/route.ts` (or dedicated lightweight endpoint)
- `src/components/admin-invoices-client.tsx`
**Changes**:
- Provide customer booking options suitable for invoice linking (id + startAt + status + duration).
- Prefer lightweight payload and only recent/upcoming bookings for usability.

#### 3. Create payload submission updates
**File**: `src/components/admin-invoices-client.tsx`
**Changes**:
- Route create requests through customer-scoped endpoint when customer selected.
- Submit optional `bookingId` when chosen.
- Preserve create-from-filter behavior, but now with explicit customer selection guard.

### Success Criteria

#### Automated Verification
- [ ] Component tests for customer-search selection and payload composition.
- [x] `npm run lint`

#### Manual Verification
- [ ] Admin can create invoice without typing customer details manually.
- [ ] Appointment dropdown only appears after customer selection and links correctly when chosen.

---

## Phase 3: Flexible Money Input and Standalone Invoice Mode

### Overview
Accept common AUD entry syntax while supporting both lesson-based and non-lesson-based invoices.

### Changes Required

#### 1. Shared currency parser utility
**File**: `src/lib/invoices/currency.ts` (new)
**Changes**:
- Add `parseAudInputToCents(input: string): { cents: number | null; error?: string }`.
- Accept formats: `$50.00`, `$50`, `50`, `50.00`, optional spaces/commas.
- Reject malformed values with user-friendly messages.

#### 2. Create modal pricing normalization
**File**: `src/components/admin-invoices-client.tsx`
**Changes**:
- Replace direct `Number.parseFloat` usage for all amount fields with shared parser.
- Add inline field-level errors before submit.
- Prevent server submission on parse errors.

#### 3. Invoice basis mode (lesson-based vs standalone)
**File**: `src/components/admin-invoices-client.tsx`
**Changes**:
- Add selector: `Lesson-based` / `Standalone`.
- Lesson-based mode retains lesson fee + optional extras.
- Standalone mode removes required lesson fee and allows one or more custom lines.
- Ensure final payload always has at least one valid line item.

### Success Criteria

#### Automated Verification
- [x] Unit tests for `parseAudInputToCents` covering accepted/rejected formats.
- [x] Update invoice-create tests to verify standalone and lesson-based payload building.

#### Manual Verification
- [ ] `$50.00`, `$50`, `50`, and `50.00` all create the same cents value.
- [ ] Standalone invoice can be created without lesson fee and without booking link.
- [ ] Error messaging is explicit when value parsing fails.

---

## Phase 4: Regression Coverage and UX Hardening

### Overview
Close gaps around `Invalid invoice payload.` handling and ensure predictable create behavior across contexts.

### Changes Required

#### 1. Expand route + UI test coverage
**Files**:
- `tests/admin-invoices.test.ts`
- `tests/admin-customer-invoice-history.test.ts`
- New focused tests if needed (e.g., `tests/admin-invoice-create-validation.test.ts`)
**Changes**:
- Add tests for selected-customer create with linked booking.
- Add tests for standalone create flow.
- Add tests for parse/validation failures to confirm actionable errors.

#### 2. Improve user-facing error mapping
**File**: `src/components/admin-invoices-client.tsx`
**Changes**:
- Map API `details` payload to a readable summary rather than generic `Invalid invoice payload.`.
- Preserve current fallback message behavior.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`

#### Manual Verification
- [ ] Create modal no longer frequently fails with opaque `Invalid invoice payload.` errors.
- [ ] Both linked and standalone invoice creation paths are stable.

---

## Testing Strategy
- Prioritize route tests for new customer+booking validation rules.
- Add unit tests for currency parser normalization and edge cases.
- Add UI/component-level tests for create modal state transitions and payload composition.
- Run full regression suite because invoice code touches shared admin surfaces.

## Performance Considerations
- Customer picker query should debounce requests and cap result size (existing `limit` endpoint support already exists).
- Booking selector payload should be lightweight and scoped to selected customer only.
- No DB migration required, so runtime risk is concentrated in API validation and UI state transitions.

## Migration Notes
- Prisma schema changes are not required for this scope (invoice already supports nullable `bookingId`).
- No data migration needed.
- If a new customer-bookings endpoint is added, it is additive and backward-compatible.

## References
- Ticket: `thoughts/tickets/2026-02-20-admin-invoice-create-customer-selection-and-booking-linking.md`
- Research: `thoughts/research/2026-02-20-admin-invoice-create-customer-selection-booking-linking-research.md`
- Prior invoice baseline plan: `thoughts/plans/invoice-management-and-customer-billing-implementation-plan.md`

## Deviations from Plan

### Phase 2: Customer Picker + Booking Selector UX
- **Original Plan**: Add component-level tests for customer-search selection and payload composition.
- **Actual Implementation**: Added end-to-end route-level coverage for linked and standalone create flows (`tests/admin-customer-invoice-history.test.ts`, `tests/admin-invoices.test.ts`) and full-suite regression verification instead of component tests.
- **Reason for Deviation**: Existing project test coverage is route/domain-centric, and this change was validated more robustly through API and integration-style tests that exercise the same payload paths.
- **Impact Assessment**: Core behavior is covered at the API contract level; UI interaction details remain dependent on manual verification.
- **Date/Time**: 2026-02-20
