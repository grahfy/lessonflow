---
type: bug
priority: high
created: 2026-03-03
status: implemented
tags: [admin, invoices, list, ux, scrolling, pagination, toolbar]
keywords: [invoices page scroll list only, sticky invoices header controls, create invoice button fixed, send overdue reminders fixed, outstanding only and search fixed, pagination footer fixed]
patterns: [src/components/admin/invoices/invoices-client.tsx, src/components/admin/ui/admin-table.tsx, src/components/pagination.tsx, src/styles/globals.css]
---

# BUG-004: Invoices List Scroll Locking and Toolbar/Pagination Persistence

## Description

On the invoices page, vertical scrolling should affect only invoice rows, not surrounding controls. Current behavior allows movement of controls that should remain fixed:
- page header/action controls (`Create Invoice`, `Send Overdue Reminders`, `Outstanding only`, search)
- bottom pagination/footer controls (`per page`, page navigation)

The UI should keep top and bottom controls stationary while invoice rows scroll independently.

## Context

Invoices list is rendered through `AdminTable` inside `invoices-client.tsx`, with shared pagination from `pagination.tsx`. Page-level container sizing and overflow are handled by `admin-layout-content` and related global styles.

Because this architecture is shared with customers tables, any fix should be assessed for reusable behavior and side effects.

## Requirements

### Functional Requirements
- Ensure invoices page top controls remain fixed while scrolling through invoice rows.
- Ensure invoices page pagination/footer remains fixed while scrolling through invoice rows.
- Limit vertical scrolling to the invoices row list container.
- Preserve current invoice list interactions (row click, action buttons, filters, search, page size changes).

### Non-Functional Requirements
- No regression in loading/empty states.
- Maintain current visual style and spacing of invoice list.
- Keep responsive behavior stable for desktop and laptop admin usage.
- Prefer shared table container solution over invoice-specific brittle styling when feasible.

## Current State

- Invoices page uses `AdminTable` with an internal `.customers-list` scroll region and a pagination section below.
- User-reported behavior indicates toolbar and/or footer movement during vertical interaction, implying overflow boundaries are not consistently enforced across all viewport conditions.

## Desired State

- Invoices page controls at top and bottom are always visible and static during list navigation.
- Invoice rows scroll in a dedicated middle pane only.

## Research Context

### Keywords to Search
- `admin-layout-content` - verify page-level overflow and height constraints.
- `invoice-list-card` - inspect table card grid rows and min-height behavior.
- `customers-list` - confirm invoices rows are the only scrollable region.
- `pagination-container` - validate fixed placement and non-shrinking behavior.
- `admin-actions-bar` - ensure toolbar is outside scroll pane and non-shrinking.

### Patterns to Investigate
- `src/components/admin/invoices/invoices-client.tsx` around toolbar + `AdminTable` composition.
- `src/components/admin/ui/admin-table.tsx` structure of header/list/pagination regions.
- `src/components/pagination.tsx` layout behavior inside table container.
- `src/styles/globals.css` rules for `.admin-layout-content`, `.invoice-list-card`, `.customers-list`, `.pagination`.

### Key Decisions Made
- This ticket is scoped to invoices page scroll/persistence behavior only.
- Customer page scroll/persistence is tracked in a separate customer-domain ticket even if implementation shares common components.
- Preferred layout direction is to remove per-page viewport-height coupling and use a stricter shell/content row structure so only table rows scroll while top toolbars and bottom pagination remain fixed.

## Success Criteria

### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update UI tests for invoice table container structure/scroll regions where feasible.

### Manual Verification
- [ ] On `/admin/invoices`, scroll through long list and verify top controls stay fixed.
- [ ] Verify bottom pagination/footer stays fixed while rows scroll.
- [ ] Verify filters/search/page-size controls still function correctly.
- [ ] Verify row click and row action buttons still work during/after scroll operations.

## Related Information

- `src/components/admin/invoices/invoices-client.tsx`
- `src/components/admin/ui/admin-table.tsx`
- `src/components/pagination.tsx`
- `src/styles/globals.css`
- Parent epic: `/home/grahf/jon/melbourne-guitar-school/thoughts/tickets/bug_admin_ui_dialogs_and_list_scrolling_epic.md`

## Notes

- If the same root cause affects both customers and invoices tables, coordinate implementation to avoid divergent behavior.
- Targeted DB-backed suite passed: `admin-invoices`.
- Manual verification remains pending.
- `npm run lint` still fails due existing repo-wide lint debt.
