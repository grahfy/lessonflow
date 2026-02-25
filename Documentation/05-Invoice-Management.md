# 05 Invoice Management

## Overview
Use the invoice console to create, edit, send, follow up, and close invoices.

This guide also explains when to use a credit note instead of delete.

## Before You Start
- Open `/admin/invoices`.
- Make sure customer details are accurate.
- Confirm business invoice defaults are configured (ABN, bank details, GST settings).

## Step-by-Step Instructions

### A) Create an Invoice from Invoice Console
1. Click `Create Invoice`.
2. Enter customer details (if not already customer-filtered).
3. Enter `Lesson fee`.
4. Add optional items:
   - `Educational books`
   - `Digital guitar lessons`
   - `Custom charge`
5. Set `Due at` and `Tax mode`.
6. Click `Create invoice`.

### B) Create Invoice from Booking
1. Go to `/admin/bookings`.
2. Open a confirmed booking.
3. Click `Create invoice`.
4. Fill in lesson pricing and optional extras.
5. Click `Create invoice`.

### C) Search and Filter Invoices
1. Use `Search` for invoice number, customer, or email.
2. Use `Status` filter (`Draft`, `Sent`, `Paid`, `Void`).
3. Use `Aging` filter (`Current`, `Overdue 1-30`, `Overdue 31+`).
4. Use `Outstanding only` for unpaid open invoices.

### D) Edit Invoice Details and Line Items
1. Click `View` on an invoice row.
2. Update `Due At`, `Notes`, and line items.
3. For line items:
   - edit description/qty/price/tax mode,
   - `Add line item` for additional charges,
   - `Remove` for incorrect entries.
4. Click `Save`.

### E) Send Invoice and PDF
1. Open invoice details.
2. Click `Send` to email customer with PDF attachment.
3. Click `Download PDF` to save/print local copy.

### F) Payment and Lifecycle Actions
1. `Mark paid` when payment is confirmed.
2. `Mark unpaid` if a payment was recorded incorrectly.
3. `Void` for invoice cancellation where applicable.

### G) Send Overdue Reminders
1. For one invoice, open it and click `Send reminder`.
2. For batch run, use `Send Due Reminders` from invoice toolbar.

### H) Create Credit Note (for Sent/Paid Invoices)
1. Open a sent or paid invoice.
2. Click `Create credit note`.
3. Enter reason (optional but recommended).
4. Confirm creation.

Use credit note when:
- issued invoice amount was wrong,
- charge should be reversed,
- you need an audit-safe correction.

Do not delete sent/paid invoices. Use credit note instead.

## Visual Reference
![Invoice console list and filters](assets/invoice-console-list-and-filters.png)
![Invoice create dialog](assets/invoice-create-dialog.png)
![Invoice detail actions including send and download PDF](assets/invoice-detail-send-and-download-pdf.png)
![Invoice filters with outstanding-only and aging applied](assets/invoice-filters-outstanding-aging.png)

## GST Guidance (Operational)
- Use configured tax mode according to your business setup.
- If unsure about GST treatment, use your accountant-approved policy.
- This guide is operational only and not tax advice.

## Expected Result
- Invoices are accurate, traceable, and customer-ready.
- Payment status and outstanding balances stay reliable.
- Corrections are handled safely with credit notes.

## Common Mistakes
- Sending invoice before checking due date and line items.
- Deleting draft by mistake instead of voiding/editing.
- Using delete when credit note is required for sent/paid invoices.

## Troubleshooting
- Invoice not visible:
  - clear filters and click `Refresh`.
- Reminder button disabled:
  - invoice may not be overdue or not in `Sent` status.
- Create credit note unavailable:
  - invoice must be `Sent` or `Paid`.

## Related Guides
- [03-Booking-Management.md](03-Booking-Management.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
- [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
