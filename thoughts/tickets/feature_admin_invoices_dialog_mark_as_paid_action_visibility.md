---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [admin, invoices, dialog, payments, ux]
keywords: [invoice dialog mark as paid option, invoice page payment action visibility, invoice lifecycle actions]
patterns: [src/components/admin/invoices/invoices-client.tsx, src/lib/admin/use-invoices.ts, src/app/api/admin/invoices/[id]/route.ts]
---

# FEAT: Ensure `Mark as Paid` Is Available from Invoice Dialog Workflow

## Description

When opening an invoice dialog on the invoice page, operators must have a clear and reliable `Mark as Paid` action where eligible.

## Context

`Mark as Paid` currently appears conditionally in invoice detail dialog footer for `sent` invoices. The request indicates the option is missing or not discoverable in the dialog flow, so action visibility and placement need to be made explicit and consistent.

## Requirements

### Functional Requirements
- Surface `Mark as Paid` in invoice dialog for all valid statuses according to business rules.
- Ensure action is visible without relying on hidden/overflow footer states.
- Keep `mark_unpaid` and `void` flows coherent with status transitions.
- Show success/error feedback after action completion and refresh row state.

### Non-Functional Requirements
- Preserve existing permissions/auth boundaries.
- Avoid duplicate conflicting action buttons in the same dialog.
- Maintain keyboard/focus accessibility for payment actions.

## Current State

Invoice detail dialog uses conditional footer actions, including `MARK AS PAID` when `selectedInvoice.status === 'sent'`. Reported UX suggests discoverability/availability gaps in the current dialog presentation.

## Desired State

Invoice dialog provides an obvious payment-state action path (`Mark as Paid`/`Mark as Unpaid`) consistent with invoice status and business constraints.

## Research Context

### Keywords to Search
- `mark_paid` - trace action trigger and status guards.
- `selectedInvoice.status` - inspect conditional action rendering.
- `performAction` - validate route/method handling and payload contract.

### Patterns to Investigate
- `src/components/admin/invoices/invoices-client.tsx`
- `src/lib/admin/use-invoices.ts`
- `src/app/api/admin/invoices/[id]/route.ts`

### Key Decisions Made
- Treat this as a visibility/interaction feature, not backend rule redesign.
- Scope includes UX placement refinements if needed to keep actions discoverable.
- Scope excludes broader invoice list/table redesign.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update tests for `mark_paid`/`mark_unpaid` action visibility by status.

### Manual Verification
- [ ] Open invoice detail dialog from `/admin/invoices`.
- [ ] Confirm eligible invoices show `Mark as Paid` clearly.
- [ ] Execute action and confirm status + UI update to paid.
- [ ] Confirm paid invoices can show `Mark as Unpaid` (if supported).

## Related Information

- `src/components/admin/invoices/invoices-client.tsx`
- `src/lib/admin/use-invoices.ts`
- `src/app/api/admin/invoices/[id]/route.ts`

## Notes

- If business rules require `draft -> paid` direct transition prohibition, keep current restriction and expose helper copy explaining why.
