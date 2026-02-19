# Invoice Management and Customer Billing

## Status
`implemented`

## Request Summary
Add a full invoice workflow for the admin system so invoices can be created from completed lesson appointments and managed centrally across bookings and customer history.

Requested UX and behavior:
- From a completed appointment dialog, add `Create Invoice`.
- Open an invoice creation popup that asks for base lesson price.
- Include temporary optional extras in the popup:
  - educational books,
  - digital guitar lessons,
  - custom product/charge.
- Generate invoice from a reusable template (placeholder logo for now).
- Include bank details on invoice:
  - bank name,
  - BSB,
  - account name,
  - account number.
- Keep invoice history/records.
- Add admin-level invoice management entry point with search.
- In customer context, support viewing invoice history and creating/editing/deleting invoices.
- Support sending invoice by email with PDF attachment.
- Support downloading invoice PDFs directly from admin invoice actions.
- Support print-friendly invoice output.
- Support invoice payment status updates (`paid`) and an outstanding invoices view.

## Scope
- Prisma schema additions for invoices, line items, and invoice audit/history.
- Admin invoice APIs for create/read/update/delete/search/filter/status.
- Admin UI additions in booking dialog, admin invoices views, and customer invoice history views.
- PDF generation + direct download + print rendering + email send with PDF attachment.
- GST-aware calculation model and tax display rules aligned to AU invoice requirements.
- Documentation/test environment updates for new configuration and verification steps.

## Non-Goals
- Online payment gateway integration.
- Automatic bank reconciliation.
- Accounting platform integrations (Xero/MYOB/QuickBooks).
- Branded design finalization beyond placeholder logo and stable invoice layout.

## Constraints
- Preserve existing admin auth/session model and route protection.
- Preserve existing booking/customer workflows while layering invoice features.
- Keep invoice/customer snapshots historically stable even if customer profile changes later.
- Keep destructive actions safe and auditable.
- Keep the implementation extensible for future invoice catalog and branding updates.

## Implementation Notes
- Completed on 2026-02-19 with additive invoice schema, API routes, admin UI, PDF rendering/download, and invoice email attachment support.
- Verification completed: `npx prisma validate`, `npm run lint`, `npm run typecheck`, `npm test`.
- Remaining manual QA is tracked in the implementation plan checklist for end-to-end UI and print verification.
