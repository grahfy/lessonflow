---
type: bug
priority: high
created: 2026-03-03
status: implemented
tags: [admin, customers, dialog, communication, learning-materials, table, ux, scrolling]
keywords: [customer details communication send email ui width, customer details learning materials upload browse width, customers table colorful columns, customers list fixed header and footer while scrolling]
patterns: [src/components/admin/customers/customers-client.tsx, src/components/admin/customers/customer-dialog-wrapper.tsx, src/components/admin/customers/customer-email-dialog.tsx, src/components/admin/customers/customer-materials-dialog.tsx, src/components/admin/customers/customer-table.tsx, src/components/admin/ui/admin-table.tsx, src/components/pagination.tsx, src/styles/globals.css]
---

# BUG-003: Customers Dialog Tab Layout and Customers List Scroll Locking

## Description

The admin customers UI has multiple visual/layout issues:
- In `Customer Details` -> `Communication`, the `Send Email` section is too constrained; subject/message fields should use fuller width and align to dialog edges.
- In `Customer Details` -> `Learning Materials`, the upload area and file browse control are too narrow and should be wider/cleaner.
- The customer list requires fixed surrounding controls while list rows scroll:
  - keep top controls (header, `Create New Customer`, search) static
  - keep bottom pagination/footer controls static
  - scroll only the table rows
- Customer list columns should have clearer, intentional color differentiation.

## Context

Customers page is composed from:
- page shell and toolbar: `customers-client.tsx`
- row rendering: `customer-table.tsx`
- shared list container/pagination: `admin-table.tsx`, `pagination.tsx`
- dialog tabs: `customer-dialog-wrapper.tsx`, `customer-email-dialog.tsx`, `customer-materials-dialog.tsx`

Several styles currently mix component inline styles with shared CSS in `globals.css`, producing inconsistent widths and constrained controls in specific tabs.

## Requirements

### Functional Requirements
- Update `Communication` tab layout so compose area spans available column width with wider `Subject` and `Message` fields.
- Ensure send-email composer is visually aligned with card/dialog edges and does not appear compressed.
- Update `Learning Materials` tab layout so upload container and file input have adequate width; avoid narrow browse control clipping.
- Keep customers-page top controls fixed while list content scrolls vertically.
- Keep customers-page pagination/footer fixed while list content scrolls vertically.
- Improve customer row column color contrast/readability with accessible, consistent color intent per data group.

### Non-Functional Requirements
- Preserve existing email send/upload behaviors and API integration.
- No regression in table interactions (open/edit/delete customer actions).
- Maintain responsive behavior for desktop and smaller laptop viewports.
- Ensure color updates remain readable against existing admin dark theme.

## Current State

- `CustomerEmailDialog` and `CustomerMaterialsDialog` use split-column dialog layout where right-side content appears visually narrow.
- File input in materials upload form is styled, but user-reported width remains insufficient.
- Customers page already uses internal list overflow, but UX indicates header/footer still move during vertical navigation in real use.
- Column coloring exists in CSS, but current output is not meeting desired visual clarity.

## Desired State

- Customer dialog tabs (`Communication`, `Learning Materials`) have clean, full-width form sections with consistent spacing.
- Customers list has stable top and bottom controls; only rows scroll.
- Row columns are distinctly color-coded while remaining legible and professional.

## Research Context

### Keywords to Search
- `CustomerEmailDialog` - inspect compose card width constraints.
- `CustomerMaterialsDialog` - inspect upload container and file input widths.
- `dialog-layout` / `dialog-col is-notes` - identify column sizing behavior inside customer dialog.
- `admin-layout-content` - verify fixed-height + overflow interaction for page-level scroll.
- `AdminTable` / `customers-list` / `pagination-container` - confirm scroll container boundaries.
- `customer-item > div:nth-child` - refine column-specific coloring rules.

### Patterns to Investigate
- `src/components/admin/customers/customer-email-dialog.tsx` card/form styles and control widths.
- `src/components/admin/customers/customer-materials-dialog.tsx` upload form hierarchy and input sizing.
- `src/components/admin/customers/customer-dialog-wrapper.tsx` dialog layout composition.
- `src/components/admin/customers/customers-client.tsx` shell container height/overflow behavior.
- `src/components/admin/ui/admin-table.tsx` internal scroll + static header/footer structure.
- `src/components/pagination.tsx` footer positioning and shrink behavior.
- `src/styles/globals.css` `dialog-layout`, `customers-list`, `customer-item`, and pagination rules.

### Key Decisions Made
- Customer dialog form-width refinements and customers-list scrolling are grouped in one customer-domain ticket.
- Booking dialog sizing/materials concerns remain in bookings ticket.
- Invoices-list scrolling concerns are split into invoice-domain ticket.
- Customer dialog `Communication` and `Learning Materials` tabs should use one-column vertical sections to improve readability and full-width input usability on medium/desktop viewports.

## Success Criteria

### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update component tests for customer dialog tab rendering and key width classes/structure (where practical).

### Manual Verification
- [ ] In customer `Communication` tab, compose card reaches expected width and subject/message fields are visibly wider.
- [ ] In customer `Learning Materials` tab, upload section and browse control are wider and aligned.
- [ ] On customers page, scroll list rows and verify header + actions/search remain fixed.
- [ ] On customers page, verify pagination/footer controls remain fixed while rows scroll.
- [ ] Verify column colors are clearly differentiated and readable.

## Related Information

- `src/components/admin/customers/customers-client.tsx`
- `src/components/admin/customers/customer-table.tsx`
- `src/components/admin/customers/customer-dialog-wrapper.tsx`
- `src/components/admin/customers/customer-email-dialog.tsx`
- `src/components/admin/customers/customer-materials-dialog.tsx`
- `src/components/admin/ui/admin-table.tsx`
- `src/components/pagination.tsx`
- `src/styles/globals.css`
- Parent epic: `/home/grahf/jon/melbourne-guitar-school/thoughts/tickets/bug_admin_ui_dialogs_and_list_scrolling_epic.md`

## Notes

- Keep color changes minimal and data-semantic, avoiding decorative noise that harms readability.
- If scroll-locking cannot be achieved cleanly with current structure, prefer a shared `AdminTable` enhancement rather than page-specific hacks.
- Manual verification remains pending.
- `npm run lint` still fails due existing repo-wide lint debt.
