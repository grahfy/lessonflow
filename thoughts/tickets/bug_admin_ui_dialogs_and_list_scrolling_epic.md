---
type: bug
priority: high
created: 2026-03-04
status: implemented
tags: [admin, epic, bookings, customers, invoices, dialogs, scrolling, ux]
keywords: [admin ui epic, bookings dialog sizing, invoice billing action routing, customer dialog tab layout, customers list scroll locking, invoices list scroll locking]
patterns: [thoughts/tickets/bug_admin_bookings_dialog_sizing_invoice_cta_and_customer_linking.md, thoughts/tickets/bug_admin_customers_dialog_tabs_layout_and_table_scroll_locking.md, thoughts/tickets/bug_admin_invoices_list_scroll_locking_and_toolbar_persistence.md, src/components/admin/bookings/**, src/components/admin/customers/**, src/components/admin/invoices/**, src/components/admin/ui/admin-table.tsx, src/styles/globals.css]
---

# BUG-EPIC-001: Admin Dialog Usability and List Scroll/Persistence Stabilization

## Description

Master epic to coordinate a set of related admin UX regressions across bookings, customers, and invoices:
- booking dialog sizing/alignment and cross-page action linking
- customer dialog tab layout and list/table usability
- invoices page list scroll behavior and toolbar/pagination persistence

This epic keeps implementation coordinated where shared components (`AdminDialog`, `AdminTable`, global styles) impact more than one area.

## Scope

- Orchestrate and track implementation across child bug tickets.
- Ensure shared layout changes are applied consistently and do not regress adjacent admin pages.
- Validate end-to-end behavior for affected admin workflows.

## Child Tickets

- [BUG-002 bookings dialog sizing, invoice CTA, customer DB linking](/home/grahf/jon/melbourne-guitar-school/thoughts/tickets/bug_admin_bookings_dialog_sizing_invoice_cta_and_customer_linking.md)
- [BUG-003 customers dialog tab layout and customer list scroll locking](/home/grahf/jon/melbourne-guitar-school/thoughts/tickets/bug_admin_customers_dialog_tabs_layout_and_table_scroll_locking.md)
- [BUG-004 invoices list scroll locking and toolbar/pagination persistence](/home/grahf/jon/melbourne-guitar-school/thoughts/tickets/bug_admin_invoices_list_scroll_locking_and_toolbar_persistence.md)

## Decision Log (2026-03-04)

- `Invoice / Billing` from booking dialog will create a draft directly via `POST /api/admin/bookings/[id]/invoice` (booking-linked), then route into invoices editing context.
- Edit-booking customer cross-check will use heuristic matching (normalized email/phone) with explicit operator confirmation before link/update actions.
- Admin list persistence will move to a stricter shell/layout model (grid rows) rather than page-level viewport `calc(...)` height coupling.
- Customer dialog tabs (`Communication`, `Learning Materials`) will switch to one-column sections (history/list above composer/upload) for readability.

## Coordination Requirements

### Functional Requirements
- Shared dialog sizing rules must be consistent across bookings and customers dialogs.
- Shared table scroll behavior must keep top controls and bottom pagination stable while rows scroll (customers + invoices).
- Booking-to-invoice handoff must reliably open create-invoice flow with customer context.
- Manual booking customer selection must reliably link to customer DB records.

### Non-Functional Requirements
- Keep changes incremental and low risk across shared UI components.
- Avoid page-specific hacks when a shared component fix is viable.
- Preserve existing admin authentication and data mutation workflows.

## Execution Order

1. Implement shared layout primitives (`AdminDialog`, `AdminTable`, `globals.css`) with cross-page checks.
2. Implement bookings-specific behavior fixes (invoice CTA + manual booking linking + materials/edit-booking cleanup).
3. Implement customers-specific dialog tab width and table color refinements.
4. Final verification pass across bookings, customers, invoices.

## Success Criteria

### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Relevant tests added/updated for routing/linking and shared table/dialog behavior

### Manual Verification
- [ ] Booking, customer, and invoice admin pages all pass their child-ticket manual checks.
- [ ] Shared UI changes behave consistently across desktop/laptop breakpoints.
- [ ] No new visual clipping/overflow regressions in admin dialogs and lists.

## Notes

- This epic is complete only when all linked child tickets are complete and cross-page regression checks pass.
- Implementation plan: `/home/grahf/jon/melbourne-guitar-school/thoughts/plans/admin-ui-dialogs-and-list-scrolling-epic-implementation-plan.md`
- Targeted DB-backed suites passed: `admin-manual-booking-customer-match`, `admin-invoices`, `admin-bookings`.
- `npm run lint` still fails due existing repo-wide lint debt outside this epic scope.
