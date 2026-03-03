---
type: bug
priority: high
created: 2026-03-03
status: implemented
tags: [admin, bookings, dialog, invoices, customers, manual-booking, learning-materials]
keywords: [edit booking dialog larger, invoice billing button not working, edit booking learning materials ui, manual booking customer selection not linking, customer database cross-check]
patterns: [src/components/admin/bookings/booking-detail-dialog.tsx, src/components/admin/bookings/bookings-client.tsx, src/components/admin/bookings/manual-booking-dialog.tsx, src/components/admin/bookings/booking-materials-dialog.tsx, src/components/admin/ui/admin-dialog.tsx, src/app/api/admin/bookings/manual/route.ts, src/app/api/admin/bookings/[id]/invoice/route.ts]
---

# BUG-002: Admin Bookings Dialog Sizing, Invoice CTA Routing, and Customer DB Linking

## Description

The admin bookings workflow has multiple regressions around the `Edit Booking` and `Add Manual Booking` dialogs:
- `Edit Booking` must be 10% larger overall and maintain uniform sizing with related bookings dialogs.
- `Invoice / Billing` action from `Edit Booking` does not reliably open invoice creation pre-linked to the selected customer.
- `Learning Materials` UI from booking edit flow needs cleaner, more readable layout and matching dialog dimensions.
- `Edit Booking` customer details should cross-check against existing customers and support direct edit flow when a match exists, while exposing/filling missing customer fields.
- `Add Manual Booking` customer `Select from list` behavior should properly link the selected customer from the customer database.

## Context

Bookings operations are concentrated in `src/components/admin/bookings/bookings-client.tsx` and modal components:
- `booking-detail-dialog.tsx` (`Edit Booking`)
- `manual-booking-dialog.tsx` (`Add Manual Booking`)
- `booking-materials-dialog.tsx` (`Learning Materials`)

Invoice linking is expected to route to `/admin/invoices` with create modal pre-opened and customer context. Customer matching and profile update behavior must align with existing customer records and avoid duplicate/partial data drift.

## Requirements

### Functional Requirements
- Increase `Edit Booking` dialog dimensions by 10% overall without causing overflow or clipping on supported viewport sizes.
- Ensure `Invoice / Billing` always opens invoice creation flow from bookings context and pre-selects the matching customer when available.
- Standardize booking-related dialog sizing (`Edit Booking`, booking learning materials, related nested booking modals) to a consistent width/height strategy.
- Improve booking learning materials UI readability:
  - better spacing and hierarchy
  - clearer upload/list sections
  - consistent field/button sizing
- Add customer cross-check in `Edit Booking` flow:
  - detect if entered/loaded booking customer maps to an existing customer record
  - expose explicit action to open/edit that customer in the Customers page/dialog
  - populate missing customer detail fields where reliable source data exists
- Fix manual booking `Select from list` path so selected customer data is always linked to the booking payload and backend relation.

### Non-Functional Requirements
- Preserve current booking mutation behavior (`save`, `move`, `approve/reject`, `delete`) with no regression.
- Keep existing admin auth and permission boundaries unchanged.
- Maintain accessibility of modal actions (keyboard/focus and clear action states).
- Ensure layout remains usable on desktop and tablet breakpoints.

## Current State

- `booking-detail-dialog.tsx` already renders `Invoice / Billing`, but the route handoff depends on booking row fields and may fail in edge cases.
- `manual-booking-dialog.tsx` selects customers client-side, but reported behavior indicates link/persistence gaps.
- Booking learning materials modal is structurally separate and visually inconsistent from edit-booking modal layout.
- Dialog sizing is partly controlled in `AdminDialog` and global CSS, but user-reported dimensions are still not meeting expected consistency.

## Desired State

- Booking edit and related dialogs are visually consistent and approximately 10% larger overall.
- `Invoice / Billing` from booking details consistently opens `Create Invoice` with customer context pre-wired.
- Manual booking customer selection reliably links to customer records in DB.
- Booking flows can leverage existing customer records to reduce duplicate edits and fill missing details safely.

## Research Context

### Keywords to Search
- `onOpenInvoice` - validate bookings-to-invoices routing and fallback behavior.
- `openCreate=true customerId` - ensure invoice page receives and applies query params.
- `manualCustomerId` - trace manual booking selected customer through payload and API route.
- `onApplyCustomer` - verify selected customer data hydration in manual booking form.
- `dialog-panel-wide` / `wide` - map effective dialog sizing controls.
- `booking materials dialog` - align modal sizing/layout with booking edit dialog.
- `customer match` / `resolution` - inspect manual match and dedupe resolution flow.

### Patterns to Investigate
- `src/components/admin/bookings/bookings-client.tsx` booking modal open/route handlers and manual booking submit.
- `src/components/admin/bookings/booking-detail-dialog.tsx` actions panel and customer detail section.
- `src/components/admin/bookings/manual-booking-dialog.tsx` selection UI and linked customer fields.
- `src/components/admin/bookings/booking-materials-dialog.tsx` layout/width behavior.
- `src/components/admin/ui/admin-dialog.tsx` plus `src/styles/globals.css` dialog width and responsive constraints.
- `src/app/api/admin/bookings/manual/route.ts` customer linking logic and conflict resolution paths.

### Key Decisions Made
- Scope is limited to admin bookings dialog behavior and linked navigation/customer-resolution concerns.
- Broader customers-page table scrolling/color refinements are split into a separate ticket.
- Invoices-list sticky/scroll behavior is split into a separate ticket.
- `Invoice / Billing` action should create booking-linked draft invoices directly through `POST /api/admin/bookings/[id]/invoice` rather than rely only on invoice page preselect query params.
- Customer cross-check behavior in edit-booking flow should use heuristic matching (normalized email/phone) with explicit operator confirmation before applying link/update behavior.

## Success Criteria

### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update tests covering manual booking customer link from selected customer ID.
- [ ] Add/update tests for bookings-to-invoices create-link query behavior.

### Manual Verification
- [ ] Open `Edit Booking` and confirm larger dialog dimensions and consistent sizing with related booking dialogs.
- [ ] Click `Invoice / Billing` and verify invoices page opens create flow with the booking customer pre-selected.
- [ ] Open booking `Learning Materials` and confirm cleaner, readable layout and consistent modal sizing.
- [ ] In `Edit Booking`, verify existing customer match can be surfaced and edited via customer workflow.
- [ ] Create a manual booking using `Select from list` and verify resulting booking is linked to the selected customer record.

## Related Information

- `src/components/admin/bookings/bookings-client.tsx`
- `src/components/admin/bookings/booking-detail-dialog.tsx`
- `src/components/admin/bookings/manual-booking-dialog.tsx`
- `src/components/admin/bookings/booking-materials-dialog.tsx`
- `src/components/admin/ui/admin-dialog.tsx`
- `src/app/api/admin/bookings/manual/route.ts`
- `src/components/admin/invoices/invoices-client.tsx`
- Parent epic: `/home/grahf/jon/melbourne-guitar-school/thoughts/tickets/bug_admin_ui_dialogs_and_list_scrolling_epic.md`

## Notes

- If customer matching introduces ambiguous matches (same/similar names), retain explicit operator confirmation before auto-linking.
- Keep a strict distinction between prefill and authoritative overwrite when filling missing customer fields.
- Targeted DB-backed suites passed: `admin-manual-booking-customer-match`, `admin-bookings`.
- `npm run lint` still fails due existing repo-wide lint debt.
