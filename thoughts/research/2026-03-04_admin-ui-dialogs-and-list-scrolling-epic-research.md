---
date: 2026-03-04T00:09:32+11:00
git_commit: fd312ab
branch: main
repository: melbourne-guitar-school
topic: "Research: BUG-EPIC-001 admin dialog usability and list scroll/persistence stabilization"
tags: [research, admin, bookings, customers, invoices, dialogs, scrolling, ui]
last_updated: 2026-03-04T00:09:32+11:00
---

## Ticket Synopsis

Research `BUG-EPIC-001` (`thoughts/tickets/bug_admin_ui_dialogs_and_list_scrolling_epic.md`) across bookings, customers, invoices, shared admin UI primitives, and global styles to identify why dialog sizing/linking and list-scroll persistence issues are occurring.

## Summary

The reported issues are real and come from multiple independent causes:

1. Manual booking customer linking has hard contract mismatches (frontend endpoint and payload keys do not match backend API contract).
2. Edit-booking “customer cross-check/edit” UI exists in the dialog component but is not wired by the parent.
3. `Invoice / Billing` from booking details uses a navigation-only flow that can silently fail to preselect customer context in edge cases.
4. Customer dialog tab width problems are caused by nested `dialog-layout` grids plus right-column compression.
5. Scroll persistence is partly implemented in `AdminTable`, but page-height math and duplicated CSS definitions still allow outer-page scroll in practical viewport/content conditions.
6. `globals.css` contains duplicate/conflicting definitions for dialog/table/layout classes, making sizing behavior unstable and hard to reason about.

## Detailed Findings

### Locate Phase

- Epic and child tickets are coherent and map to active pages/components:
  - Bookings: `src/components/admin/bookings/*`
  - Customers: `src/components/admin/customers/*`
  - Invoices: `src/components/admin/invoices/invoices-client.tsx`
  - Shared primitives: `src/components/admin/ui/admin-dialog.tsx`, `src/components/admin/ui/admin-table.tsx`, `src/components/pagination.tsx`
  - Shared styles: `src/styles/globals.css`
- Historical context exists for related work:
  - calendar/dialog evolution: `thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md`
  - invoice/customer-linking contract work: `thoughts/research/2026-02-20-admin-invoice-create-customer-selection-booking-linking-research.md`
  - bookings reliability audit: `thoughts/research/2026-02-26_admin-bookings-button-actions-reliability-audit.md`

### Pattern-Find Phase

- Manual booking backend contract pattern (tested) is:
  - `POST /api/admin/bookings`
  - payload uses `customerId`, optional `matchResolution`, optional `updateCustomerFromBooking`
  - see tests and route contract (`tests/admin-manual-booking-customer-match.test.ts:10`, `src/app/api/admin/bookings/route.ts:15`)
- Invoice create modal open-from-query pattern is implemented and working on invoices page:
  - `openCreate=true`, `customerId=<id>` (`src/components/admin/invoices/invoices-client.tsx:110`)
- Shared table pattern already isolates row scrolling:
  - header region
  - `.customers-list` scroll region
  - pagination region (`src/components/admin/ui/admin-table.tsx:34`)

### Analyze Phase

#### 1. Manual booking “select from list” is broken by API path + payload mismatches

- Frontend sends manual booking to `/api/admin/bookings/manual` (`src/components/admin/bookings/bookings-client.tsx:330`), but no such API route exists.
- Backend manual create is `POST /api/admin/bookings` (`src/app/api/admin/bookings/route.ts:191`), and tests confirm this endpoint (`tests/admin-manual-booking-customer-match.test.ts:10`).
- Frontend sends `manualCustomerId` and `resolution` (`src/components/admin/bookings/bookings-client.tsx:324`), while backend expects `customerId` and `matchResolution` (`src/app/api/admin/bookings/route.ts:15`).
- On conflict, frontend expects `data.match` (`src/components/admin/bookings/bookings-client.tsx:338`), but backend returns `customer` (`src/app/api/admin/bookings/route.ts:238`).

Result: selected-customer linking from manual booking cannot reliably work as implemented, and conflict resolution payloads are mismatched.

#### 2. Edit Booking customer cross-check/edit UI is present but disconnected

- `BookingDetailDialog` supports a read-only linked-customer section via `selectedCustomer` (`src/components/admin/bookings/booking-detail-dialog.tsx:126`).
- Parent `bookings-client` always passes `selectedCustomer={null}` (`src/components/admin/bookings/bookings-client.tsx:438`).
- No customer-resolution/fetch flow feeds `selectedCustomer` during `openDialog`.

Result: user-visible “cross-check current customer DB and allow edit customer” behavior cannot occur in current wiring.

#### 3. `Invoice / Billing` action is navigation-only and does not use booking invoice endpoint

- Booking dialog button calls `onOpenInvoice` (`src/components/admin/bookings/booking-detail-dialog.tsx:240`).
- Parent implementation just pushes to invoices with query params (`src/components/admin/bookings/bookings-client.tsx:467`).
- If `customerId` is missing from row data, modal opens without valid preselection (`src/components/admin/bookings/bookings-client.tsx:470`), making it feel “not working.”
- A dedicated booking invoice endpoint exists (`src/app/api/admin/bookings/[id]/invoice/route.ts:20`) but is not used by this flow.

Result: CTA behavior is fragile and not semantically “create invoice from this booking”; it is “navigate to invoices and attempt prefilter/preselect.”

#### 4. Customer dialog tabs are layout-compressed by nested grids

- Wrapper renders a `dialog-layout` container (`src/components/admin/customers/customer-dialog-wrapper.tsx:123`).
- Each tab component (`CustomerEmailDialog` and `CustomerMaterialsDialog`) also renders its own `dialog-layout` root (`src/components/admin/customers/customer-email-dialog.tsx:27`, `src/components/admin/customers/customer-materials-dialog.tsx:35`).
- Global `dialog-layout` uses a split `1.18fr / 0.82fr` column ratio (`src/styles/globals.css:1647`), compounding when nested.

Result: compose/upload panes can appear narrower than expected even when inner controls use width `100%`.

#### 5. Scroll persistence exists in structure, but height contracts are inconsistent

- `AdminTable` keeps rows inside a dedicated scroll container (`.customers-list`) and renders pagination separately (`src/components/admin/ui/admin-table.tsx:52`, `src/components/admin/ui/admin-table.tsx:61`).
- Customers and invoices pages both set inline fixed heights (`calc(100vh - 120px)`) on `admin-layout-content` (`src/components/admin/customers/customers-client.tsx:237`, `src/components/admin/invoices/invoices-client.tsx:321`).
- CSS also defines `admin-layout-content` multiple times, including conflicting fixed height (`calc(100vh - 140px)`) (`src/styles/globals.css:1205`, `src/styles/globals.css:1288`).
- Admin shell includes header and optional notices above content (`src/components/admin/layout/admin-shell.tsx:22`), so fixed 100vh calculations can still cause outer-page overflow depending on header/notice height and viewport.

Result: in some viewports/state combinations, body/page scroll still occurs, making top toolbars and footer controls move.

#### 6. `globals.css` has duplicated class definitions with conflicting dialog/list behavior

- `dialog-backdrop`, `dialog-panel`, `dialog-panel-wide` are defined twice with different values (`src/styles/globals.css:1254`, `src/styles/globals.css:1581`).
- `admin-layout-content`, `admin-actions-bar`, and `manual-section-title` are also redefined (`src/styles/globals.css:1205`, `src/styles/globals.css:1288`, `src/styles/globals.css:919`, `src/styles/globals.css:1308`).
- `customers-list` has a generic capped height (`50vh`) (`src/styles/globals.css:1805`) then invoice-specific override (`src/styles/globals.css:2469`).

Result: effective layout depends on declaration order and local inline styles, increasing regression risk and making “10% larger uniform dialog” difficult to guarantee.

#### 7. Pagination non-shrink rule currently targets a non-existent class

- CSS intends to pin pagination with `.admin-card.invoice-list-card .pagination` (`src/styles/globals.css:1214`).
- Pagination component root class is `.pagination-container` (`src/components/pagination.tsx:30`).

Result: intended rule is not applied as written.

#### 8. Customer column color rules are globally coupled and also hit invoice rows

- Color rules use `.customer-item > div:nth-child(...)` (`src/styles/globals.css:1302`).
- Invoice rows include `customer-item` class (`src/components/admin/invoices/invoices-client.tsx:365`).

Result: customer color styling bleeds into invoice rows; the approach is brittle because it depends on exact child structure (including separators).

## Code References

- `src/components/admin/bookings/bookings-client.tsx:324` - sends `manualCustomerId`
- `src/components/admin/bookings/bookings-client.tsx:325` - sends `resolution`
- `src/components/admin/bookings/bookings-client.tsx:330` - posts to `/api/admin/bookings/manual`
- `src/components/admin/bookings/bookings-client.tsx:338` - expects conflict payload `match`
- `src/app/api/admin/bookings/route.ts:15` - expects `customerId` and `matchResolution`
- `src/app/api/admin/bookings/route.ts:191` - manual booking create endpoint location
- `tests/admin-manual-booking-customer-match.test.ts:10` - test uses `/api/admin/bookings`
- `src/components/admin/bookings/bookings-client.tsx:438` - `selectedCustomer` hardcoded `null` for edit dialog
- `src/components/admin/bookings/booking-detail-dialog.tsx:126` - linked customer UI branch
- `src/components/admin/bookings/booking-detail-dialog.tsx:240` - `Invoice / Billing` button
- `src/components/admin/bookings/bookings-client.tsx:467` - invoice routing from booking dialog
- `src/app/api/admin/bookings/[id]/invoice/route.ts:20` - booking-scoped invoice create API
- `src/components/admin/invoices/invoices-client.tsx:110` - create modal query-param open/preselect logic
- `src/components/admin/customers/customer-dialog-wrapper.tsx:123` - outer `dialog-layout`
- `src/components/admin/customers/customer-email-dialog.tsx:27` - inner `dialog-layout` (nested)
- `src/components/admin/customers/customer-materials-dialog.tsx:35` - inner `dialog-layout` (nested)
- `src/styles/globals.css:1647` - `dialog-layout` split columns
- `src/components/admin/ui/admin-table.tsx:52` - row scroll container
- `src/components/admin/ui/admin-table.tsx:61` - pagination outside row scroll
- `src/components/admin/customers/customers-client.tsx:237` - fixed page content height (customers)
- `src/components/admin/invoices/invoices-client.tsx:321` - fixed page content height (invoices)
- `src/styles/globals.css:1205` - first `admin-layout-content` rule
- `src/styles/globals.css:1288` - second `admin-layout-content` rule
- `src/styles/globals.css:1254` - first dialog definitions
- `src/styles/globals.css:1581` - second dialog definitions
- `src/styles/globals.css:1214` - pagination selector mismatch
- `src/components/pagination.tsx:30` - actual class: `pagination-container`
- `src/styles/globals.css:1302` - nth-child customer color rules
- `src/components/admin/invoices/invoices-client.tsx:365` - invoices row includes `customer-item`

## Architecture Insights

- The shared primitives (`AdminDialog`, `AdminTable`) are directionally correct, but global style duplication undermines predictability.
- Fixing this epic safely should prioritize:
  1. API contract alignment first (manual booking + invoice handoff reliability).
  2. CSS deduplication and single-source layout tokens for dialogs/list shells.
  3. Component-specific UI refinements after shared layout stability.
- The current color strategy should move from structural selectors (`nth-child`) to semantic class names per column cell to avoid cross-page leakage.

## Historical Context (from thoughts/)

- Prior invoice research already identified contract mismatch risks in create flows and customer/booking linking (`thoughts/research/2026-02-20-admin-invoice-create-customer-selection-booking-linking-research.md`).
- Prior bookings reliability research showed multiple action-path inconsistencies and generic-failure masking in admin bookings (`thoughts/research/2026-02-26_admin-bookings-button-actions-reliability-audit.md`).
- Calendar/dialog work established this area as high-change and sensitive to UI-state regressions (`thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md`).

## Related Research

- `thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md`
- `thoughts/research/2026-02-20-admin-invoice-create-customer-selection-booking-linking-research.md`
- `thoughts/research/2026-02-26_admin-bookings-button-actions-reliability-audit.md`

## Open Questions

- Should `Invoice / Billing` create a draft directly through `POST /api/admin/bookings/[id]/invoice` (booking-linked) or continue routing to invoices create modal with preselected customer?
- Should customer cross-check in edit booking be strict (exact ID only) or heuristic (email/phone normalized match) with explicit operator confirmation?
- For list persistence, should `admin-layout-content` use viewport-relative height at all, or should admin shell switch to a stricter `grid-template-rows` layout to eliminate body scrolling?
- Should dialog tabs on customers page be one-column sections per tab (history above composer/upload) instead of split columns to improve readability on medium widths?
