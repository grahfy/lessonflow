---
type: bug
priority: high
created: 2026-03-04
status: implemented
tags: [admin, bookings, customers, invoices, dialogs, ux, navigation]
keywords: [edit booking custom details open customer alignment, booking linked text placement, remove extra helper lines, communication tab sizing, learning materials profile address uniform dialog size, invoice dialog ux re-layout, invoice view customer empty dialog bug]
patterns: [src/components/admin/bookings/booking-detail-dialog.tsx, src/components/admin/customers/customer-dialog-wrapper.tsx, src/components/admin/customers/customer-profile-dialog.tsx, src/components/admin/customers/customer-email-dialog.tsx, src/components/admin/customers/customer-materials-dialog.tsx, src/components/admin/invoices/invoices-client.tsx, src/components/admin/ui/admin-dialog.tsx, src/components/admin/customers/customers-client.tsx, src/app/admin/customers/page.tsx, src/styles/globals.css]
---

# BUG: Admin Dialog Layout Consistency and Invoice->Customer Navigation Regression

## Description

Fix multiple admin dialog regressions and layout inconsistencies across bookings, customers, and invoices, including a blocking issue where opening a customer from the invoice dialog can leave an empty/unclosable customer dialog state.

## Context

The edit-booking and customer dialog surfaces have mixed sizing rules and uneven action placement. Invoice dialog cross-navigation to customers currently causes broken dialog lifecycle behavior.

## Requirements

### Functional Requirements
- `Edit Booking` dialog (`Custom Details` / tabs area):
  - place `Open Customer` action on the same row as `Appointment` and `Communication` tabs, aligned to the far right.
  - place text `Booking is linked to an existing customer` on the same visual row as `Customer Details`, aligned to the right of the section header/box.
  - remove the extra two helper text lines under that section as requested.
- Make `Communication` tab dialog body dimensions match `Appointment` tab dimensions.
- Ensure bottom-right action buttons in booking communication context use differentiated color hierarchy (matching customer-details visual semantics).
- Standardize dialog sizing across:
  - booking communication tab
  - customer learning materials tab
  - customer profile/address tab
- Improve communication and learning-materials tab layouts for clearer spacing, hierarchy, and control grouping.
- Invoice dialog usability:
  - re-layout invoice detail content for clearer grouping and action discoverability.
- Fix invoice->customer navigation bug:
  - when `VIEW CUSTOMER` is used from invoice dialog, customer dialog state must be closable and should never render as an empty shell.

### Non-Functional Requirements
- Preserve all existing API calls and mutation behavior.
- Keep dialog focus trapping and keyboard escape handling intact.
- Prevent scroll-lock regressions previously fixed in admin dialogs.

## Current State

- Booking dialog uses ad-hoc inline styles for tabs and matched-customer card placement.
- Customer tab content components each set independent min-heights/layouts.
- Invoice dialog uses large mixed sections with uneven action density.
- Invoice-to-customer route handoff can leave customer dialog lifecycle/state inconsistent.

## Desired State

Dialog dimensions and tab layouts are consistent and polished, action hierarchy is clear, and cross-navigation from invoices to customers is stable and fully closable.

## Research Context

### Keywords to Search
- `booking-detail-dialog tabs open customer` - relocate tab-row actions.
- `Booking is linked to an existing customer` - adjust text placement and remove redundant helper lines.
- `dialog-tab-stack minHeight` - unify customer tab dimensions.
- `VIEW CUSTOMER router.push` - trace invoice->customer route state.
- `open=true customerId` on customers page - verify dialog open/close lifecycle.

### Patterns to Investigate
- `src/components/admin/bookings/booking-detail-dialog.tsx`
- `src/components/admin/customers/customer-dialog-wrapper.tsx`
- `src/components/admin/customers/customer-email-dialog.tsx`
- `src/components/admin/customers/customer-materials-dialog.tsx`
- `src/components/admin/customers/customer-profile-dialog.tsx`
- `src/components/admin/invoices/invoices-client.tsx`
- `src/components/admin/customers/customers-client.tsx`
- `src/components/admin/ui/admin-dialog.tsx`

### Key Decisions Made
- This ticket is scoped to admin dialog behavior/usability, not global theming.
- Cross-route invoice->customer regression is treated as a functional bug and prioritized first.
- Dialog size consistency must be tokenized/shared rather than repeated inline style constants.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update focused tests for invoice->customer dialog open/close route behavior.

### Manual Verification
- [ ] In `Edit Booking`, `Open Customer` sits on the tab row at far right.
- [ ] `Booking is linked to an existing customer` aligns on same row as `Customer Details`; redundant helper lines are removed.
- [ ] Booking `Appointment` and `Communication` tabs use matching dialog dimensions.
- [ ] Booking communication bottom-right actions use distinct visual colors.
- [ ] Customer `Profile & Address`, `Communication`, and `Learning Materials` tabs use uniform dialog sizing.
- [ ] Invoice dialog grouping/layout is clearer and easier to use.
- [ ] From invoice dialog, opening customer and pressing `Close` exits dialog correctly without empty stuck shell.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
- Related prior work: `thoughts/tickets/bug_admin_bookings_dialog_sizing_invoice_cta_and_customer_linking.md`

## Notes

- Confirm regression checks for bookings/customer modal stacking and scroll-lock behavior.
