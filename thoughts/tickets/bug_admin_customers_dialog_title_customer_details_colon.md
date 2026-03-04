---
type: bug
priority: medium
created: 2026-03-04
status: implemented
tags: [admin, customers, dialog, ux, copy]
keywords: [customer page dialog title, customer details colon, exact heading text]
patterns: [src/components/admin/customers/customer-dialog-wrapper.tsx, src/components/admin/ui/admin-dialog.tsx]
---

# BUG: Customer Dialog Title Must Be `Customer Details:`

## Description

On the admin customers page, the customer dialog title must render exactly as `Customer Details:` (with trailing colon).

## Context

The current dialog title string in `CustomerDialogWrapper` is `Customer Details` (no colon). The request requires exact copy for consistency with internal documentation and operator expectations.

## Requirements

### Functional Requirements
- Update the customer dialog title text to exact value `Customer Details:`.
- Ensure the title applies in both existing-customer and new-customer dialog states.

### Non-Functional Requirements
- No layout regressions in the dialog header.
- No behavior changes to tab switching or dialog close actions.

## Current State

`CustomerDialogWrapper` passes `title="Customer Details"` into `AdminDialog`.

## Desired State

Customer dialog header always shows `Customer Details:`.

## Research Context

### Keywords to Search
- `CustomerDialogWrapper title` - locate current hardcoded heading.
- `Customer Details` - find any duplicated strings requiring sync.

### Patterns to Investigate
- `src/components/admin/customers/customer-dialog-wrapper.tsx`
- `src/components/admin/ui/admin-dialog.tsx`

### Key Decisions Made
- This is a copy-level bug fix only.
- Scope excludes other customer dialog text/content changes.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] Open `/admin/customers` and launch customer dialog from row action.
- [ ] Confirm dialog heading is exactly `Customer Details:`.
- [ ] Confirm heading is unchanged when switching tabs.

## Related Information

- `src/components/admin/customers/customer-dialog-wrapper.tsx`

## Notes

- Keep this ticket atomic; do not bundle broader customer dialog redesign work.
