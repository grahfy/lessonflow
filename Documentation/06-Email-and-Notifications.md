# 06 Email and Notifications

## What This Covers
This guide explains:
- what emails the app sends
- which emails are manual vs automatic
- what “queued” means when email delivery is not configured

## Two Important Things To Know
1. Some emails are sent to customers.
2. Customer emails are BCC’d to the admin/owner email so you have a record.

## Manual Emails (Buttons You Click)

### A) Booking Emails (From `/admin/bookings`)
1. Open a booking.
2. Use:
   - `Send reminder` for a standard reminder message
   - `Email customer` for a custom message

### B) Invoice Emails (From `/admin/invoices`)
1. Open an invoice (`View`).
2. Use:
   - `Send` to email the invoice PDF to the customer
   - `Send reminder` to email an overdue reminder

## Automatic Emails (Scheduled Jobs)
These are triggered by the server scheduler (cron/systemd timer):
- daily bookings digest
- invoice reminder runs
- daily/weekly/monthly/yearly owner reports

If the scheduler is not configured on the droplet, automatic emails will not run.

## What “Queued” Means
If email delivery is not configured (no SMTP/Gmail send available), the app can still:
- record that you attempted to send an email
- show status like `queued_no_smtp` for audit/history

But the customer will not receive the email until delivery is configured.

## Quick Checks (When a Customer Says “I Didn’t Get It”)
1. Confirm you clicked the action (`Send`, `Send reminder`, `Email customer`).
2. If SMTP is not configured, assume the customer did not receive it.
3. Re-send once email delivery is confirmed working.

## Troubleshooting
- Reminder button disabled:
  - invoice must be `Sent` and overdue
- Nothing is sending automatically:
  - scheduler may not be installed on the droplet
  - check the deploy runbook (technical owner)

## Technical Owner Appendix (If You Manage Hosting)

### Job Endpoints (Secured)
- `POST /api/jobs/daily-bookings-digest`
- `POST /api/jobs/invoice-reminders`
- `POST /api/jobs/admin-reports/daily`
- `POST /api/jobs/admin-reports/weekly`
- `POST /api/jobs/admin-reports/monthly`
- `POST /api/jobs/admin-reports/yearly`

All require:
- `x-cron-secret: <CRON_SECRET>`

### Invoice Reminder Job Optional Payload
```json
{
  "dryRun": true,
  "maxInvoices": 100,
  "stage": 14,
  "customerId": "<optional-customer-id>"
}
```

Use overrides for diagnostics, not daily operation.

## Next Guides
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
