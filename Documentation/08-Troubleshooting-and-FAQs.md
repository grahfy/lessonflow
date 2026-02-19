# 08 Troubleshooting and FAQs

## Overview
Use this guide to quickly resolve common booking, customer, and invoice issues.

## Before You Start
- Confirm you are in the correct admin area:
  - `/admin/bookings`
  - `/admin/invoices`
- Reproduce the issue once to confirm current behavior.

## Common Issues and Fixes

### 1) Cannot Log In
- Check email/password spelling.
- Retry in a fresh browser tab.
- Confirm credentials with owner.

### 2) Booking Changes Not Reflected
- After edits, ensure `Save details` was clicked.
- If time changed, use `Move booking`.
- Refresh view and confirm correct date range.

### 3) Customer Not Found
- Search by email or phone fragment.
- Check if duplicate/alternate spelling exists.
- Recreate customer profile only if no existing profile is present.

### 4) Invoice Not Appearing in List
- Clear search filter.
- Clear status/aging filters.
- Toggle `Outstanding only` off and refresh.

### 5) Reminder Button Disabled
- Invoice must be `Sent`.
- Invoice must be overdue.

### 6) Cannot Delete Invoice
- Sent/paid invoices are protected.
- Use `Create credit note` for correction.

### 7) Customer Says They Did Not Receive Email
- Confirm action was triggered.
- If SMTP is disabled, action may be queued (`queued_no_smtp`) but not externally delivered.

### 8) PDF Download Issues
- Retry from invoice detail and from list action.
- Check browser pop-up/download blocking settings.

## FAQ

### Should I delete an incorrect sent invoice?
No. Use `Create credit note` so history remains correct and auditable.

### What if payment was marked by mistake?
Use `Mark unpaid` and add notes.

### Can I send reminders in bulk?
Yes, use `Send Due Reminders` in invoice console.

### Can I customize reminder cadence?
Operationally use 7/14/30-day flow. Technical overrides are available for owner/technical users.

## Escalation Checklist
Escalate to owner/technical support when:
- repeated login failures continue,
- invoice lifecycle actions are unavailable unexpectedly,
- scheduled reminder jobs fail repeatedly,
- communication delivery is business-critical and SMTP is unavailable.

## Related Guides
- [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md)
- [03-Booking-Management.md](03-Booking-Management.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
- [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md)

