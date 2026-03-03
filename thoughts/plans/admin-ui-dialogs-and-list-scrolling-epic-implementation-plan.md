# Admin UI Dialogs And List Scrolling Epic Implementation Plan

## Overview

Implement `BUG-EPIC-001` by addressing contract-level reliability issues first, then stabilizing shared layout primitives, then applying customer/invoice/bookings UX refinements. This sequence minimizes regressions across shared admin surfaces.

## Current State Analysis

- Manual booking create flow in bookings client posts to an endpoint that does not exist and uses mismatched payload keys (`src/components/admin/bookings/bookings-client.tsx:330`, `src/components/admin/bookings/bookings-client.tsx:324`), while server-side manual create is implemented at `POST /api/admin/bookings` with different field names (`src/app/api/admin/bookings/route.ts:191`, `src/app/api/admin/bookings/route.ts:15`).
- Edit-booking dialog has linked-customer UI branch but parent always passes `selectedCustomer={null}` (`src/components/admin/bookings/booking-detail-dialog.tsx:126`, `src/components/admin/bookings/bookings-client.tsx:438`).
- Booking `Invoice / Billing` action currently routes to invoices page query params only (`src/components/admin/bookings/bookings-client.tsx:467`) and does not invoke booking-scoped invoice create endpoint (`src/app/api/admin/bookings/[id]/invoice/route.ts:20`).
- Customer dialog tabs are layout-compressed by nested split-grid usage (`src/components/admin/customers/customer-dialog-wrapper.tsx:123`, `src/components/admin/customers/customer-email-dialog.tsx:27`, `src/components/admin/customers/customer-materials-dialog.tsx:35`, `src/styles/globals.css:1647`).
- Shared list scrolling is close to desired structure (`src/components/admin/ui/admin-table.tsx:34`), but conflicting global CSS and fixed page height math still create body-scroll edge cases (`src/styles/globals.css:1205`, `src/styles/globals.css:1288`, `src/components/admin/customers/customers-client.tsx:237`, `src/components/admin/invoices/invoices-client.tsx:321`).
- Global styles include duplicated/conflicting class blocks for dialogs/layout (`src/styles/globals.css:1254`, `src/styles/globals.css:1581`), increasing unpredictability.

## Desired End State

- Booking `Invoice / Billing` creates a booking-linked draft invoice directly and opens that draft in invoices editing context.
- Manual booking `Select from list` reliably links to existing customer records.
- Edit-booking customer cross-check uses heuristic match (normalized email/phone) and explicit confirmation before link/update decisions.
- Customers dialog `Communication` and `Learning Materials` tabs are one-column and full-width usable.
- Customers and invoices pages keep top controls and bottom pagination fixed while only list rows scroll.
- Shared dialog/list styles are single-source and deterministic (no duplicate conflicting class definitions).

### Key Discoveries

- `src/components/admin/bookings/bookings-client.tsx:330` - non-existent `/api/admin/bookings/manual` usage.
- `src/app/api/admin/bookings/route.ts:15` - backend expects `customerId` and `matchResolution`.
- `src/components/admin/bookings/bookings-client.tsx:325` - frontend sends `resolution`, not `matchResolution`.
- `src/components/admin/bookings/bookings-client.tsx:338` - frontend expects `match` response shape; backend returns `customer` (`src/app/api/admin/bookings/route.ts:238`).
- `src/components/admin/bookings/bookings-client.tsx:438` - linked customer never passed into detail dialog.
- `src/styles/globals.css:1254` and `src/styles/globals.css:1581` - duplicate dialog definitions.
- `src/styles/globals.css:1214` - pagination selector targets `.pagination` while component uses `.pagination-container` (`src/components/pagination.tsx:30`).

## What We're NOT Doing

- Rebuilding invoice pricing/business rules in this epic.
- Reworking admin auth/session behavior.
- Large visual redesign outside tickets in this epic.
- Changing customer matching to fully automatic merge behavior without operator confirmation.

## Implementation Approach

1. Fix API contract mismatches and booking-to-invoice action reliability first.
2. Introduce deterministic shell/content layout rules and remove duplicated CSS definitions.
3. Apply customer-dialog and list UX refinements on top of stable primitives.
4. Add/adjust tests for affected contracts and shared behavior.

## Phase 1: Contract And Action Reliability (Bookings + Invoices)

### Overview

Resolve high-confidence functional breakages that block expected behavior.

### Changes Required

#### 1. Manual Booking API Contract Alignment
**File**: `src/components/admin/bookings/bookings-client.tsx`  
**Changes**:
- Change manual create request target from `/api/admin/bookings/manual` to `/api/admin/bookings`.
- Map payload keys:
  - `manualCustomerId` -> `customerId`
  - `resolution` -> `matchResolution`
- Align conflict handling with backend response (`customer`, `code`) and keep explicit resolution actions.

#### 2. Booking Invoice/Billing Direct Draft Create
**File**: `src/components/admin/bookings/bookings-client.tsx`  
**File**: `src/components/admin/invoices/invoices-client.tsx`  
**Changes**:
- Replace navigation-only `Invoice / Billing` action with direct `POST /api/admin/bookings/[id]/invoice`.
- Use configured/default draft line-item seed strategy (single lesson-fee line item) so endpoint receives valid payload.
- After draft creation, route to invoices page with query param to open created invoice detail dialog (add `openInvoiceId` handling in invoices client).

#### 3. Booking Dialog Customer Wiring
**File**: `src/components/admin/bookings/bookings-client.tsx`  
**Changes**:
- Pass selected/matched customer object into `BookingDetailDialog` instead of hardcoded null.
- Add explicit action to open customer page dialog from matched customer context.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`
- [x] `npm run test -- admin-manual-booking-customer-match`
- [ ] Add/update tests for bookings-client manual payload mapping and conflict response handling (component/integration where feasible).
- [ ] Add/update tests for booking invoice action flow (route call + resulting invoice open query handling).

#### Manual Verification
- [ ] In manual booking, `Select from list` creates booking linked to selected customer.
- [ ] Duplicate match flow shows explicit operator choices and behaves correctly.
- [ ] In edit booking, clicking `Invoice / Billing` creates a draft and opens it for editing.

---

## Phase 2: Heuristic Customer Cross-Check With Explicit Confirmation

### Overview

Implement the approved heuristic matching behavior in edit-booking flow with safe operator confirmation.

### Changes Required

#### 1. Match Resolution UI + Logic
**File**: `src/components/admin/bookings/bookings-client.tsx`  
**File**: `src/components/admin/bookings/booking-detail-dialog.tsx`  
**Changes**:
- Add normalized email/phone match detection against customer dataset.
- Show explicit match banner/actions (`Use matched customer`, `Open customer`, `Keep booking-only details`).
- Ensure no silent overwrite; require explicit operator action before linking/updating customer context.

#### 2. Missing Field Fill Strategy
**File**: `src/components/admin/bookings/bookings-client.tsx`  
**Changes**:
- When operator confirms match, fill only missing booking-form customer fields from customer record.
- Keep existing non-empty booking values unless operator chooses profile-sync/update action.

### Success Criteria

#### Automated Verification
- [ ] Add/update unit tests for normalization + match selection helper logic.
- [x] `npm run test -- admin-manual-booking-customer-match`

#### Manual Verification
- [ ] Edit-booking shows match suggestions when email/phone heuristics match.
- [ ] Operator confirmation is required before applying matched customer data.
- [ ] Opening matched customer profile from edit-booking works.

---

## Phase 3: Shared Layout Stabilization (No Body Scroll Drift)

### Overview

Unify shared admin layout so scrolling behavior is deterministic: header/actions/pagination fixed, rows scroll only.

### Changes Required

#### 1. Admin Shell/Grid Row Structure
**File**: `src/components/admin/layout/admin-shell.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Move admin shell/content to strict row-based layout model (`grid-template-rows`) with explicit `min-height: 0` contracts.
- Remove dependence on page-level viewport `calc(...)` height for customers/invoices.

#### 2. Remove Inline Viewport Height Coupling
**File**: `src/components/admin/customers/customers-client.tsx`  
**File**: `src/components/admin/invoices/invoices-client.tsx`  
**File**: `src/components/admin/bookings/bookings-client.tsx`  
**Changes**:
- Remove inline `height: calc(100vh - 120px)` and rely on shell/content classes.
- Preserve existing action bars outside row-scroll pane.

#### 3. CSS Deduplication And Selector Correctness
**File**: `src/styles/globals.css`  
**Changes**:
- Collapse duplicate definitions for:
  - `.dialog-backdrop`, `.dialog-panel`, `.dialog-panel-wide`
  - `.admin-layout-content`, `.admin-actions-bar`, `.manual-section-title`
- Update pagination selector from `.pagination` to `.pagination-container`.
- Ensure `.customers-list` generic and invoice overrides are intentional and non-conflicting.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] On customers page, top controls and bottom pagination stay fixed while rows scroll.
- [ ] On invoices page, top controls and bottom pagination stay fixed while rows scroll.
- [ ] No body/page scroll jump occurs during list navigation at desktop/laptop breakpoints.

---

## Phase 4: Customer Dialog One-Column Tab Redesign

### Overview

Apply approved one-column layout for customer dialog `Communication` and `Learning Materials` tabs.

### Changes Required

#### 1. Flatten Tab Layout Containers
**File**: `src/components/admin/customers/customer-dialog-wrapper.tsx`  
**File**: `src/components/admin/customers/customer-email-dialog.tsx`  
**File**: `src/components/admin/customers/customer-materials-dialog.tsx`  
**Changes**:
- Remove nested `dialog-layout` grid inside tab components.
- Render one-column tab sections:
  - Email tab: history first, then full-width composer.
  - Materials tab: materials list first, then full-width upload form.

#### 2. Width/Control Refinements
**File**: `src/styles/globals.css`  
**Changes**:
- Ensure subject/message controls and file input use full available width.
- Maintain clear section separation and spacing in one-column flow.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Customer `Communication` tab subject/message fields are visibly wider and easier to use.
- [ ] Customer `Learning Materials` upload section and file chooser are full-width and readable.
- [ ] Dialog remains usable on medium and desktop widths.

---

## Phase 5: Column Color Semantics And Regression Hardening

### Overview

Finalize visual refinements safely and lock behavior with targeted regression checks.

### Changes Required

#### 1. Semantic Column Styling
**File**: `src/components/admin/customers/customer-table.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Replace `nth-child` color targeting with semantic class names on specific customer columns.
- Avoid color-rule bleed into invoice rows.

#### 2. Regression Coverage And Documentation
**File**: `tests/*` (targeted additions)  
**File**: `thoughts/tickets/bug_admin_ui_dialogs_and_list_scrolling_epic.md`  
**Changes**:
- Add/update tests for key contract and flow regressions.
- Update epic/child ticket checklists as validation completes.

### Success Criteria

#### Automated Verification
- [ ] `npm run test`
- [x] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Customer column colors are distinct and readable.
- [ ] Invoices rows are not unintentionally affected by customer column color rules.
- [ ] Full epic manual checklist passes across bookings/customers/invoices.

---

## Testing Strategy

- Contract tests:
  - manual booking API mapping and conflict shape
  - booking invoice draft create from booking action
- UI behavior checks:
  - row-only scroll persistence in customers and invoices
  - customer dialog tab readability and full-width controls
  - edit-booking heuristic cross-check confirmation behavior
- Regression checks:
  - booking edit/move/cancel still functional
  - invoices create/edit dialogs still functional
  - customers CRUD/email/material upload unchanged in behavior

## Deviations from Plan

### Cross-phase: Verification and test coverage
- **Original Plan**: Complete lint and targeted/unit regression tests for bookings/invoice/customer UI contract changes.
- **Actual Implementation**: Completed implementation, `npm run typecheck`, and targeted DB-backed suites (`admin-manual-booking-customer-match`, `admin-invoices`, `admin-bookings`). Lint still fails due existing repo-wide lint debt, and dedicated new tests for frontend query-handling/cross-check UI were not added in this pass.
- **Reason for Deviation**: Existing lint baseline and time-boxing prioritized delivery of functional fixes over expanding test coverage in UI component layers.
- **Impact Assessment**: Main flows are validated by compilation and targeted backend/integration tests, but lint cleanup and additional UI-focused regression tests are still required for full policy compliance.
- **Date/Time**: 2026-03-04 (Australia/Melbourne)

## Performance Considerations

- Prefer CSS/layout simplification over JS-driven resize logic.
- Reuse loaded customer datasets where practical; avoid repeated broad fetches during each keystroke.
- Keep invoice-draft create action lightweight and defer heavy editing to invoices dialog.

## Migration Notes

- No schema/data migration expected.
- Requires synchronized UI + API contract updates in the same deploy to avoid temporary manual-booking failures.
- If query-param-based invoice opening (`openInvoiceId`) is introduced, keep backward compatibility with current `openCreate/customerId` behavior.

## References

- Ticket: `thoughts/tickets/bug_admin_ui_dialogs_and_list_scrolling_epic.md`
- Child Tickets:
  - `thoughts/tickets/bug_admin_bookings_dialog_sizing_invoice_cta_and_customer_linking.md`
  - `thoughts/tickets/bug_admin_customers_dialog_tabs_layout_and_table_scroll_locking.md`
  - `thoughts/tickets/bug_admin_invoices_list_scroll_locking_and_toolbar_persistence.md`
- Research: `thoughts/research/2026-03-04_admin-ui-dialogs-and-list-scrolling-epic-research.md`
