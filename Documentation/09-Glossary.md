# 09 Glossary

## Overview
This glossary defines key terms used in the admin system and in this documentation set.

## Before You Start
- Use this guide when a term in another guide is unclear.
- Check UI labels in the product when in doubt.

## Step-by-Step Instructions
1. Use `Ctrl/Cmd + F` to search this page for a term.
2. If a term is not listed, check related guides first:
   - `03-Booking-Management.md`
   - `05-Invoice-Management.md`
   - `07-Reports-Outstanding-and-Follow-Up.md`
3. If still unclear, record the term for documentation update in `Documentation/CHANGELOG.md`.

## Terms
- Admin: A signed-in operator with access to booking and invoice tools.
- Aging: Overdue grouping for invoices (`Current`, `Overdue 1-30`, `Overdue 31+`).
- BSB: Australian bank/branch code used with account number for transfers.
- Booking: A scheduled lesson record.
- Booking Request: A pending lesson submission awaiting admin approval or rejection.
- Confirmed Booking: A booking approved and active in the calendar.
- Cancelled (48h): Booking cancelled within 48 hours flag window.
- Rejected (48h): Booking request rejected within 48 hours flag window.
- Credit Note: Audit-safe reversal/correction record for sent or paid invoices.
- Cron Job: Scheduled server task that runs automatically.
- CRON_SECRET: Shared secret header value used to authorize scheduled job endpoints.
- Customer: A stored learner profile used in bookings and invoices.
- Customer Directory: Admin list to search, create, edit, and maintain customer profiles.
- Digest Email: Daily summary email for bookings operations.
- Draft Invoice: Invoice that is created but not yet sent.
- Due At: Invoice due date field.
- GST: Goods and Services Tax; operational handling follows accountant-approved business policy.
- Invoice: Billing document for lessons/products/services.
- Invoice Number: Unique identifier for an invoice record.
- Line Item: Charge entry on invoice (description, quantity, price, tax mode).
- Mark Paid: Action that sets invoice payment status to paid.
- Mark Unpaid: Action to revert an invoice from paid to unpaid when correction is needed.
- Outstanding Only: Invoice filter that shows unpaid open invoices.
- PDF Invoice: Downloadable/printable invoice file.
- Queued No SMTP (`queued_no_smtp`): Logged email action when SMTP is not configured.
- Reminder Stage: Overdue threshold flow used for reminders (`7`, `14`, `30` days).
- Send Due Reminders: Bulk action to send reminders for eligible overdue invoices.
- Sent Invoice: Invoice status after customer send action.
- SMTP: Mail delivery configuration used to send real emails externally.
- Tax Mode: Per-line or invoice-level tax setting used by billing workflow.
- Void Invoice: Cancellation status for an invoice where applicable.

## Expected Result
- Operators can quickly resolve unfamiliar terms without interrupting daily work.

## Common Mistakes
- Assuming glossary definitions replace accountant or legal advice.
- Treating `queued_no_smtp` as confirmed external delivery.

## Troubleshooting
- Term does not match UI wording:
  - Capture the exact UI label.
  - Update this glossary and related guides in same change set.
- New workflow introduces new terms:
  - Add definitions here before releasing updated workflow docs.

## Related Guides
- [01-Getting-Started.md](01-Getting-Started.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
