# 06 Email and Notifications

## Overview
This guide explains customer and owner emails, what is automatic vs manual, and how to verify delivery state.

## Before You Start
- Ensure you are signed in as admin.
- Understand whether SMTP is configured in your environment.

## Step-by-Step Instructions

### A) Manual Booking Communication
From booking dialog in `/admin/bookings`:
1. Click `Send reminder` for standard reminder email.
2. Click `Email customer` for custom message email.

### B) Invoice Communication
From invoice detail in `/admin/invoices`:
1. Click `Send` to dispatch invoice email with PDF attachment.
2. Click `Send reminder` for overdue reminder email.

### C) Automated Email Workflows
Current automation includes:
- Daily bookings digest job.
- Scheduled invoice reminder job.

These run through secured job endpoints and cron schedule.

### D) Verify Email Outcomes
If SMTP is configured:
- Emails should be sent immediately.

If SMTP is not configured:
- Emails are recorded as `queued_no_smtp` for audit tracking.

Operationally, this means communication actions still log intent even when external delivery is unavailable.

## Expected Result
- Admin can send and track key customer communications.
- Team knows difference between sent vs queued fallback behavior.

## Common Mistakes
- Assuming queued fallback means customer received email.
- Sending reminder before checking invoice state and due status.

## Troubleshooting
- No email delivered to customer:
  - Check whether SMTP is configured.
  - Confirm action was triggered from correct screen.
- Reminder email unavailable:
  - confirm invoice is overdue and in `Sent` status.

## Technical User Appendix (Owner/Technical Ops)

### Scheduled Job Endpoints
- `POST /api/jobs/daily-bookings-digest`
- `POST /api/jobs/invoice-reminders`

Required header for both:
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

Fields:
- `dryRun`: preview only, no sends.
- `maxInvoices`: cap batch size.
- `stage`: force stage filter (`7`, `14`, `30`).
- `customerId`: target one customer.

Use technical overrides for diagnostics or controlled runs, not routine daily operation.

## Related Guides
- [03-Booking-Management.md](03-Booking-Management.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md)

