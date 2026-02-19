# Invoice Management and Customer Billing Implementation Plan

## Overview
Implement an admin invoicing system that supports invoice creation from completed appointments, customer-linked invoice history, searchable invoice management, editable line items, AU GST-aware totals, payment tracking, downloadable/printable PDF output, and email delivery with PDF attachments.

## Current State Analysis
- Admin booking actions are centralized in the appointment dialog and currently include save/move/cancel/notify flows, but no invoice action (`src/components/admin-bookings-client.tsx:1949`).
- Customer search and management already exist in modal form and can be extended with invoice-history affordances (`src/components/admin-bookings-client.tsx:1455`, `src/components/admin-bookings-client.tsx:1480`).
- Backend admin APIs already use authenticated route handlers and Zod validation patterns (`src/app/api/admin/bookings/route.ts:159`, `src/app/api/admin/customers/route.ts:54`).
- Email sending exists and logs all outbound outcomes, but does not yet support attachments (`src/lib/email/service.ts:39`).
- Existing Prisma schema has no invoice entities yet (`prisma/schema.prisma:220` currently ends with `OutboundEmail`).

### Key Discoveries
- The booking dialog is already action-dense and supports nested modals, so an invoice-create modal can be added without route redesign (`src/components/admin-bookings-client.tsx:1712`, `src/components/admin-bookings-client.tsx:1998`).
- Customer directory already supports query filtering and CRUD, which can be reused for customer-level invoice history search (`src/components/admin-bookings-client.tsx:1493`, `src/app/api/admin/customers/route.ts:30`).
- Existing email template/service split provides a clean extension point for invoice email templates and PDF attachments (`src/lib/email/templates.ts:137`, `src/lib/email/service.ts:57`).
- AU compliance requires explicit tax-invoice fields and 5-year record retention, so invoice snapshots/audit history are mandatory (research source in `thoughts/research/2026-02-19_invoice-management-and-customer-billing-research.md`).

## Desired End State
- In appointment dialog (confirmed booking), add `Create Invoice` action.
- Invoice-create popup includes:
  - base lesson price,
  - temporary extras (educational books, digital guitar lessons),
  - custom charge entry,
  - GST mode visibility,
  - due-date default.
- Invoice template includes:
  - seller details (name, ABN, placeholder logo),
  - customer details,
  - itemized charges,
  - GST/subtotal/total,
  - banking details (bank, BSB, account name, account number),
  - status metadata (issued/sent/paid).
- Admin adds invoices entry point with:
  - global search/filter,
  - outstanding view,
  - edit/delete/create/send/mark-paid actions.
- Customer workflows include invoice history list and per-customer invoice create/edit/delete.
- Email send includes rendered invoice PDF attachment.
- Print and one-click PDF download are available from invoice detail/actions.

## What We're NOT Doing
- Payment collection gateway integration (Stripe/Square/PayPal).
- Direct accounting platform sync (Xero/MYOB/QuickBooks).
- Fully customizable invoice designer/branding CMS.
- Complex multi-rate taxation engine beyond requested AU GST handling.

## Design Options
1. `Booking`-embedded invoice fields only (no dedicated invoice model).
   - Pros: fewer tables.
   - Cons: cannot represent multi-line items/history/search/edit/delete cleanly.
2. Dedicated invoice domain (`Invoice` + `InvoiceLineItem` + audit) linked to booking/customer (selected).
   - Pros: supports all requested workflows, clean filtering/history, compliant record retention.
   - Cons: larger migration and API surface.
3. Separate standalone invoicing module not linked to bookings/customers.
   - Pros: generic billing model.
   - Cons: loses “create from appointment” and customer-history continuity.

Selected approach: Option 2.

## Implementation Approach
- Add dedicated invoice persistence with immutable snapshots + auditable lifecycle changes.
- Reuse existing admin auth/API/UI patterns and modal architecture.
- Add GST-aware calculation utilities with conservative defaults and explicit overrides.
- Add dedicated admin invoices page plus context actions from booking/customer surfaces.
- Extend email service to support attachments and add invoice email template.
- Keep delete operations safe via soft-delete + audit (with optional hard-delete only for unsent drafts if required later).

## Phase 1: Schema, Migration, and Domain Contracts

### Overview
Introduce invoice persistence and configuration primitives while preserving existing booking/customer behavior.

### Changes Required

#### 1. Prisma Schema
**File**: `prisma/schema.prisma`  
**Changes**:
- Add `InvoiceStatus` enum (`draft`, `sent`, `paid`, `void`).
- Add `InvoiceTaxMode` enum (`taxable`, `gst_free`).
- Add `Invoice` model with:
  - identifiers (`id`, `invoiceNumber` unique),
  - relations (`customerId` nullable, `bookingId` nullable),
  - snapshot fields (`customerName`, `customerEmail`, `customerAddress`, seller/bank snapshot fields),
  - money fields in cents (`subtotalCents`, `gstCents`, `totalCents`),
  - lifecycle timestamps (`issuedAt`, `dueAt`, `sentAt`, `paidAt`),
  - status flags (`status`, `isDeleted`),
  - metadata (`notes`, `createdAt`, `updatedAt`).
- Add `InvoiceLineItem` model (`invoiceId`, `description`, `quantity`, `unitPriceCents`, `taxMode`, `lineSubtotalCents`, `lineGstCents`, `lineTotalCents`, `sortOrder`).
- Add `InvoiceAuditLog` model for create/edit/send/mark-paid/delete/void activity.
- Add optional relation fields:
  - `Booking.invoiceIds` via relation table semantics (or one-to-many if a booking may have multiple invoices).
  - `Customer.invoices` relation.
- Add indexes for search/reporting:
  - `invoiceNumber`, `status`, `isDeleted`, `dueAt`, `paidAt`, `customerId`, `bookingId`, `createdAt`.

#### 2. Migration
**Files**:
- `prisma/migrations/<timestamp>_add_invoice_management/migration.sql`
- `prisma/migrations/migration_lock.toml` (generated update)
**Changes**:
- Create new invoice tables/indexes/enums.
- Keep all existing booking/customer data unchanged.

#### 3. Shared Types/Validation
**Files**:
- `src/lib/invoices/types.ts` (new)
- `src/lib/invoices/schema.ts` (new)
**Changes**:
- Define strict Zod contracts for invoice payloads and line items.
- Normalize currency to cents and quantity constraints.
- Define allowed temporary extra item presets:
  - `lesson_fee`,
  - `educational_books`,
  - `digital_guitar_lessons`,
  - `custom`.

### Success Criteria

#### Automated Verification
- [x] `npx prisma validate`
- [x] `npm run test:prepare`

#### Manual Verification
- [x] Existing admin booking/customer flows still function after migration.
- [x] New tables appear in Prisma schema/migration without data loss.

---

## Phase 2: Calculation, Numbering, GST, and Snapshot Services

### Overview
Build deterministic invoice-domain utilities used by all API handlers and UI flows.

### Changes Required

#### 1. Invoice Calculation Service
**File**: `src/lib/invoices/calculate.ts` (new)  
**Changes**:
- Compute per-line and aggregate totals from cents values.
- Apply GST at 10% only when tax mode is `taxable` and business is GST-registered.
- Return normalized totals (`subtotalCents`, `gstCents`, `totalCents`) for storage and display.

#### 2. GST Policy Service
**File**: `src/lib/invoices/gst-policy.ts` (new)  
**Changes**:
- Encode implementation assumptions from research:
  - default to taxable when GST-registered,
  - permit explicit GST-free line overrides.
- Read configuration from env defaults (Phase 6 docs updates):
  - `INVOICE_GST_REGISTERED`,
  - `INVOICE_DEFAULT_TAX_MODE`.
- Expose warning metadata for UI when GST registration is disabled but taxable mode requested.

#### 3. Invoice Numbering and Snapshot Service
**Files**:
- `src/lib/invoices/numbering.ts` (new)
- `src/lib/invoices/snapshots.ts` (new)
**Changes**:
- Generate sequential invoice numbers (e.g. `MGS-2026-0001`) with transactional safety.
- Build customer and seller/bank snapshots at create time to preserve historical integrity.
- Include placeholder logo reference in snapshot payload until real branding exists.

### Success Criteria

#### Automated Verification
- [x] Add unit tests for tax calculations and rounding rules.
- [x] Add unit tests for numbering uniqueness and order.

#### Manual Verification
- [x] Mixed taxable/GST-free line items produce expected totals.
- [ ] Snapshot fields remain stable after customer profile edits.

---

## Phase 3: Admin Invoice APIs

### Overview
Add authenticated API routes for invoice CRUD, search, status transitions, and booking/customer-linked creation.

### Changes Required

#### 1. Invoice Collection and Search Routes
**Files**:
- `src/app/api/admin/invoices/route.ts` (new)
- `src/app/api/admin/invoices/[id]/route.ts` (new)
**Changes**:
- `GET /api/admin/invoices` with filters:
  - `q` (invoice number/customer/email),
  - `status`,
  - `outstanding=true`,
  - `customerId`,
  - pagination controls.
- `POST /api/admin/invoices` create invoice from payload or from linked booking/customer.
- `PATCH /api/admin/invoices/[id]` edit line items/notes/due date/status transitions.
- `DELETE /api/admin/invoices/[id]` soft-delete with audit trail.

#### 2. Booking-Linked Create Endpoint
**File**: `src/app/api/admin/bookings/[id]/invoice/route.ts` (new)  
**Changes**:
- Create draft invoice prefilled from selected booking/customer snapshot.
- Validate booking existence and admin auth.
- Return invoice draft payload for UI modal.

#### 3. Invoice Send/PDF Endpoints
**Files**:
- `src/app/api/admin/invoices/[id]/send/route.ts` (new)
- `src/app/api/admin/invoices/[id]/pdf/route.ts` (new)
**Changes**:
- `POST send`: render PDF, send email with attachment, update status to `sent`, append audit log.
- `GET pdf`: return `application/pdf` for download/print workflows.

#### 4. Customer-Invoice History Endpoint
**File**: `src/app/api/admin/customers/[id]/invoices/route.ts` (new)  
**Changes**:
- Return per-customer invoice history with search and status filters.
- Support create shortcut payload defaults.

### Success Criteria

#### Automated Verification
- [x] Route auth tests for all invoice endpoints.
- [x] CRUD/search/outstanding filter tests.
- [x] Booking-linked create endpoint tests.

#### Manual Verification
- [x] Admin can create, edit, delete, and mark invoices paid.
- [x] Outstanding filter excludes paid/void/deleted invoices.
- [x] Customer invoice history endpoint returns expected records.

---

## Phase 4: Admin UI Integration

### Overview
Surface invoice actions in booking and customer workflows, and add a dedicated invoice management area.

### Changes Required

#### 1. Booking Dialog Invoice Action
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**:
- Add `Create Invoice` button for confirmed bookings in existing dialog action row.
- Add invoice-create modal collecting:
  - base lesson price,
  - temporary extras (books/digital lessons/custom),
  - GST mode per item,
  - optional notes and due date.
- On submit, call booking-linked create endpoint then navigate/open invoice detail panel.

#### 2. Admin Invoices Page
**Files**:
- `src/app/admin/invoices/page.tsx` (new)
- `src/components/admin-invoices-client.tsx` (new)
**Changes**:
- Add new admin route with global invoice table/list.
- Include search, filters, outstanding toggle, and quick actions:
  - view,
  - download PDF,
  - edit,
  - send,
  - mark paid,
  - delete.
- Add admin navigation affordance from bookings screen (button/link).

#### 3. Customer Invoice History UI
**File**: `src/components/admin-bookings-client.tsx` (or extracted customer-dialog component)  
**Changes**:
- In customer directory actions, add `Invoices`.
- Open per-customer invoice history modal/panel with search and actions:
  - view,
  - create invoice,
  - edit,
  - delete.

#### 4. Styling and Responsive Layout
**File**: `src/styles/globals.css`  
**Changes**:
- Add invoice list/detail/modal styles matching existing admin UI language.
- Ensure mobile behavior for invoice table filters and line-item editor.
- Add print media styles for clean invoice print output.

### Success Criteria

#### Automated Verification
- [ ] Add UI logic tests for invoice modal state and status updates where practical.

#### Manual Verification
- [ ] Create invoice from booking dialog works end-to-end.
- [ ] Invoice PDF download works from invoice detail/list actions.
- [ ] Global invoices page search/filter/outstanding view works.
- [x] Customer-level invoice history search and actions work.
- [ ] Mobile layouts remain usable for invoice edit/create flows.

---

## Phase 5: Invoice Template, PDF, Email, and Payment State

### Overview
Deliver user-facing invoice outputs and communication workflows.

### Changes Required

#### 1. Invoice Template Rendering
**Files**:
- `src/lib/invoices/template.tsx` (new)
- `public/invoice-logo-placeholder.svg` (new)
**Changes**:
- Build reusable invoice template with AU-required sections:
  - invoice number/date,
  - supplier identity and ABN,
  - recipient details,
  - line items and tax totals,
  - bank details,
  - payment instructions and due date,
  - paid status marker.

#### 2. PDF Rendering
**File**: `src/lib/invoices/pdf.ts` (new)  
**Changes**:
- Render template to PDF buffer server-side.
- Ensure deterministic formatting for emailed and downloaded copies.

#### 3. Email Template and Attachment Send
**Files**:
- `src/lib/email/templates.ts`
- `src/lib/email/service.ts`
- `src/lib/invoice-events.ts` (new)
**Changes**:
- Add customer invoice email template.
- Extend `sendEmail` contract to support attachments.
- Send invoice email with PDF attachment and log outbound result.

#### 4. Payment Status Controls
**Files**:
- `src/components/admin-invoices-client.tsx`
- `src/app/api/admin/invoices/[id]/route.ts`
**Changes**:
- Add `Mark Paid` / `Mark Unpaid` actions.
- Persist `paidAt` and status transitions with audit logging.

### Success Criteria

#### Automated Verification
- [x] Email template tests for invoice content and escaping.
- [x] API tests assert outbound email row creation after invoice send.
- [x] PDF endpoint test validates content-type and non-empty payload.

#### Manual Verification
- [x] Invoice email is sent with PDF attachment.
- [ ] Downloaded PDF and printed invoice match expected layout.
- [x] Mark-paid updates outstanding views immediately.

---

## Phase 6: Verification, Documentation, and Environment/Test Sync

### Overview
Finalize with complete verification coverage and synchronized config/docs updates.

### Changes Required

#### 1. Test Coverage
**Files**:
- `tests/admin-invoices.test.ts` (new)
- `tests/admin-invoice-mutations.test.ts` (new)
- `tests/admin-customer-invoice-history.test.ts` (new)
- `tests/email-templates.test.ts`
- `tests/admin-notify-actions.test.ts` (or new invoice-email test file)
**Changes**:
- Cover invoice CRUD, status transitions, outstanding filter, customer-history search, send-email side effects.

#### 2. Environment and Docs
**Files**:
- `.env.example`
- `.env.test.example`
- `tests/setup-env.ts`
- `README.md`
**Changes**:
- Add invoice configuration vars:
  - `INVOICE_BUSINESS_NAME`,
  - `INVOICE_BUSINESS_ABN`,
  - `INVOICE_BANK_NAME`,
  - `INVOICE_BANK_BSB`,
  - `INVOICE_BANK_ACCOUNT_NAME`,
  - `INVOICE_BANK_ACCOUNT_NUMBER`,
  - `INVOICE_PAYMENT_TERMS_DAYS`,
  - `INVOICE_GST_REGISTERED`,
  - `INVOICE_DEFAULT_TAX_MODE`.
- Update admin operations docs and manual verification checklist with invoice workflows.
- Confirm new test setup defaults include invoice env vars.

### Success Criteria

#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`

#### Manual Verification
- [ ] Admin can create/send/download/print/pay/delete invoices from booking and customer contexts.
- [x] Outstanding invoices view reflects invoice status accurately.
- [x] Invoice history/search works globally and per customer.
- [x] Existing booking/customer/admin flows remain unchanged functionally.

---

## Testing Strategy
- Unit tests for monetary calculations, GST logic, and invoice numbering.
- API integration tests for authenticated invoice operations and filter behavior.
- Email/PDF tests for attachment pipeline and template correctness.
- Manual regression across booking calendar, customer directory, invoice creation flows, and print UX.

## Performance Considerations
- Keep invoice list endpoint paginated and indexed.
- Avoid rendering full PDF during list queries; generate on demand for send/download only.
- Keep customer-history queries bounded by pagination + search constraints.
- Reuse existing modal mount/unmount patterns to avoid admin UI performance regressions.

## Migration Notes
- Invoice schema is additive; no destructive changes to booking/customer tables.
- Use soft-delete (`isDeleted`) for invoice records to preserve compliance/audit needs.
- Preserve seller/customer snapshot values on invoice rows for historical correctness.
- GST assumptions should be validated with accountant before production billing.

## Workflow Suggestions (Recommended)
1. Add a `draft`-first invoice lifecycle and require explicit `send` action to reduce accidental billing.
2. Use immutable snapshots for customer/bank details on each invoice so historical documents never change.
3. Support per-line tax mode override while defaulting from business-level GST settings.
4. Store all money in integer cents only to avoid rounding drift.
5. Add invoice status chips and aging buckets (current, overdue 1-30, overdue 31+) once baseline launch is stable.
6. Add a future `credit note` flow instead of hard deleting sent/paid invoices.

## Deviations from Plan

### Phase 4: Admin UI Integration
- **Original Plan**: Add a dedicated per-customer invoice history modal/panel inside the customer directory flow.
- **Actual Implementation**: Added `Invoices` actions that open the dedicated admin invoices console with `customerId` filtering, while still exposing per-customer history API endpoints.
- **Reason for Deviation**: Reusing the new invoice console avoids duplicating list/search/action UIs and keeps behavior consistent across global and customer-scoped workflows.
- **Impact Assessment**: Functional requirements are met (customer-scoped search/history/actions), but the UX is route-based rather than nested modal-based.
- **Date/Time**: 2026-02-19T19:09:35Z

### Phase 4: Admin UI Integration
- **Original Plan**: Add UI logic tests for invoice modal state and status updates where practical.
- **Actual Implementation**: Focused coverage on domain + API integration tests, with no dedicated component-level invoice UI tests in this pass.
- **Reason for Deviation**: Existing admin bookings UI is large/stateful and currently has limited unit-test scaffolding for component interaction coverage.
- **Impact Assessment**: Core invoice behavior is validated through integration tests, but UI-specific regressions still require manual verification.
- **Date/Time**: 2026-02-19T19:09:35Z

## References
- Ticket: `thoughts/tickets/2026-02-19-invoice-management-and-customer-billing.md`
- Research: `thoughts/research/2026-02-19_invoice-management-and-customer-billing-research.md`
- Admin action surface: `src/components/admin-bookings-client.tsx:1949`
- Admin dialog entry point: `src/components/admin-bookings-client.tsx:1712`
- Customer directory/search UI: `src/components/admin-bookings-client.tsx:1455`
- Customer API query pattern: `src/app/api/admin/customers/route.ts:24`
- Email service baseline: `src/lib/email/service.ts:39`
- Email template baseline: `src/lib/email/templates.ts:137`
- Prisma baseline (no invoice models yet): `prisma/schema.prisma:220`
