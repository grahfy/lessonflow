---
date: 2026-02-19T18:43:49Z
git_commit: d09afed
branch: main
repository: melbourne_guitar_school_website
topic: "Research: invoice management and customer billing"
tags: [research, invoicing, gst, admin, email, pdf]
last_updated: 2026-02-19T18:43:49Z
---

## Ticket Synopsis
The request is to add end-to-end invoicing: create from completed bookings, include configurable line items and GST handling, render printable/PDF invoices, email customers with PDF attachment, track invoice history per customer and globally, support edit/delete/recreate, and manage payment/outstanding status.

## Summary
The current system already has strong building blocks: authenticated admin APIs, event-dialog actions for bookings, customer directory/search dialogs, and email delivery with outbound logging. No invoice model or invoice UI currently exists, so this is a net-new domain addition that should be introduced as additive schema + API + admin UI slices.

External AU rules indicate tax invoice fields and GST behavior must be explicit in the design. For this domain, the safest approach is a configurable GST mode with clear invoice-level tax breakdown and accountant validation before production go-live.

## Detailed Findings

### Codebase Findings (Locate / Pattern / Analyze)
- Admin appointment click opens a dialog with action buttons and is the natural insertion point for `Create Invoice` (`src/components/admin-bookings-client.tsx:1712`, `src/components/admin-bookings-client.tsx:1949`).
- Manual booking and customer directory are already modal-driven and searchable; these patterns can be reused for invoice creation/history popups (`src/components/admin-bookings-client.tsx:1093`, `src/components/admin-bookings-client.tsx:1455`, `src/components/admin-bookings-client.tsx:1480`).
- Customer list API already supports server-side query + limit and can anchor customer-invoice history entry points (`src/app/api/admin/customers/route.ts:24`, `src/app/api/admin/customers/route.ts:30`).
- Existing Prisma schema has booking/customer entities and outbound email log model, but no invoice persistence yet (`prisma/schema.prisma:126`, `prisma/schema.prisma:192`, `prisma/schema.prisma:220`).
- Email transport already supports DB logging fallback and can be extended with attachments for invoice PDFs (`src/lib/email/service.ts:39`, `src/lib/email/service.ts:44`, `src/lib/email/service.ts:64`).
- Existing template utilities already centralize customer-facing email composition, so invoice emails should follow the same pattern (`src/lib/email/templates.ts:137`).

### Australian Invoice & GST Requirements (External)
- ATO tax invoice guidance requires core invoice fields and supports digital invoices, including PDFs sent via email.
  - Source: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/in-detail/rules-for-specific-transactions/tax-invoices
- Businesses must register for GST at or above AUD $75,000 GST turnover; if not registered, GST cannot be charged.
  - Source: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
- ATO education-course guidance states GST-free treatment is only for qualifying education course categories; private/individual tuition generally does not qualify under ACE criteria.
  - Source: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/gst-and-education
  - Supporting private ruling context: https://www.ato.gov.au/law/view/document?DocID=EV%2F1051793060422
- Business records (including invoicing records) must be retained for at least 5 years.
  - Source: https://www.ato.gov.au/businesses-and-organisations/records-and-information-management/record-keeping-for-business
- Australian small-business invoice record-keeping expectations and template guidance:
  - Source: https://business.gov.au/finance/invoicing/invoice-and-quote-record-keeping

### Template/UX Pattern Research
- AU-style invoice content structure should prioritize mandatory compliance fields first, then payment details and notes.
- Music-teacher template examples consistently include lesson descriptor + hourly/per-lesson pricing + optional resources/materials line items.
  - Sources used for pattern ideas:
    - https://www.freshbooks.com/en-au/hub/invoicing/how-to-write-an-invoice
    - https://www.waveapps.com/invoice-templates/music-teacher

## Inference (Explicit)
Based on ATO guidance and the private-ruling example, one-on-one/private music lessons are likely taxable supplies when the business is GST-registered, rather than automatically GST-free education supplies. This should be treated as an implementation assumption and verified with the business accountant before production invoicing.

## Architecture Implications
- Invoice data must be immutable enough for audit/record retention:
  - snapshot customer name/email/address,
  - snapshot seller bank details shown at send time,
  - preserve historical tax calculations.
- Keep invoice state transitions explicit (`draft` -> `sent` -> `paid`, with `void`/`deleted` controls) and auditable.
- PDF generation should run server-side and return downloadable binary for print/email attachment consistency.
- Outstanding invoices should be query-driven (`status != paid` and not deleted/void) to support admin dashboard filters.

## Related Research
- `thoughts/research/2026-02-19_booking-contact-admin-system-research.md`
- `thoughts/research/2026-02-19_admin-visual-calendar-booking-dialog-research.md`

## References
- Ticket: `thoughts/tickets/2026-02-19-invoice-management-and-customer-billing.md`
- Admin dialog action surface: `src/components/admin-bookings-client.tsx:1949`
- Customer popup/search surface: `src/components/admin-bookings-client.tsx:1455`
- Customer API search/list: `src/app/api/admin/customers/route.ts:24`
- Email delivery/logging: `src/lib/email/service.ts:39`
- Existing email template pattern: `src/lib/email/templates.ts:137`
