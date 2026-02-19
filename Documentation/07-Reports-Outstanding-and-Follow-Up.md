# 07 Reports, Outstanding, and Follow-Up

## Overview
This guide explains how to manage outstanding invoices and run a consistent follow-up routine.

## Before You Start
- Open `/admin/invoices`.
- Ensure invoice statuses are up to date.

## Step-by-Step Instructions

### A) Review Outstanding Invoices
1. Enable `Outstanding only`.
2. Set `Aging` filter as needed:
   - `Current`
   - `Overdue 1-30`
   - `Overdue 31+`
3. Sort your work list by due date urgency.

### B) Follow-Up Routine (Recommended)
1. Daily:
   - check overdue invoices,
   - send single reminders where needed.
2. Weekly:
   - run `Send Due Reminders` batch,
   - review invoices still unpaid after reminders,
   - escalate manually for high-priority accounts.
3. End of week:
   - check paid/unpaid status accuracy,
   - issue credit notes where correction is needed,
   - update notes for unresolved cases.

### C) Use Reminder Stages
Reminder stages are designed around overdue thresholds:
- 7 days
- 14 days
- 30 days

Use these as your standard communication cadence.

### D) Track Outcomes
For each reminder cycle:
- verify reminder actions completed,
- verify paid updates are reflected,
- verify unresolved invoices carry clear notes.

## Visual Reference
![Invoice filters with outstanding toggle](assets/invoice-filters-outstanding-aging.png)

## Expected Result
- Outstanding balances are actively managed.
- Follow-up is consistent, auditable, and easy to hand over.

## Common Mistakes
- Sending repeated reminders without checking stage progression.
- Forgetting to update status after payment confirmation.
- Mixing billing corrections into delete actions instead of credit note flow.

## Troubleshooting
- Outstanding list looks wrong:
  - check whether invoice was marked `Paid` or `Void`.
  - clear filters and reload.
- Batch reminders sent fewer than expected:
  - only eligible overdue `Sent` invoices are included.

## Technical Operations (Owner/Technical User)

### Cron Schedule Reference
Configured in `vercel.json`:
- Daily bookings digest.
- Daily invoice reminders.

### Controlled Reminder Runs
Technical users can run reminder job with payload overrides using:
- `dryRun` for preview,
- `stage` for specific threshold runs,
- `maxInvoices` for throttling,
- `customerId` for targeted troubleshooting.

Always record why overrides were used and the results.

## Related Guides
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
