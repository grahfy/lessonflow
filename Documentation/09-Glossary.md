# 09 Glossary

## How To Use This Page
If you see a word in the app or guides that you do not understand:
1. Press `Ctrl/Cmd + F` and search for the term here.
2. If it is not listed, check the related guide (Bookings or Invoices).
3. If it is still unclear, tell the owner so the docs can be improved.

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

## Common Confusions
- This glossary is for app workflow words, not tax/legal advice.
- `queued_no_smtp` means the app recorded the email action, but delivery is not configured.

## Next Guides
- [01-Getting-Started.md](01-Getting-Started.md)
- [03-Booking-Management.md](03-Booking-Management.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
