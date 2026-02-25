# 11 Admin Reports Dashboard

## What This Screen Is
`/admin/reports` is your “health check” dashboard.

Use it to quickly see:
- how many appointments happened (or are scheduled)
- outstanding invoices and overdue totals
- earnings (paid invoices)
- comparisons to the previous week/month/year

## Before You Start
1. Sign in as admin.
2. Open `/admin/reports`.
3. If you just edited invoices/bookings, click `Refresh reports`.

## How To Read The Dashboard (Beginner-Friendly)

### A) Pick a Date Format You Like
1. Find `Date format`.
2. Choose:
   - `Readable` (example: `25 Feb 2026`)
   - `DD/MM/YY` (example: `25/02/26`)

### B) Reduce Noise (Compare Views)
If the screen feels busy:
1. Use the `Compare views` toggles.
2. Turn off the periods you do not need right now.

Example:
- Daily for today’s workload
- Weekly for end-of-week check
- Monthly/Yearly for owner planning

### C) Use Reports to Decide What To Do Next
- If outstanding/overdue is high:
  - go to `/admin/invoices`
  - turn on `Outstanding only`
  - send reminders
- If pending requests are high:
  - go to `/admin/bookings`
  - process pending requests (approve/reject)

## Visual Reference
![Admin reports dashboard](assets/admin-reports-dashboard.png)

## Scheduled Report Emails (Owner)
Daily/weekly/monthly/yearly report emails can be sent automatically to the owner/admin via cron jobs.

These are technical-owner features and are configured on the server (deploy/runbook documentation).

## Common Mistakes
- Forgetting to click `Refresh reports` after changing invoices
- Leaving too many compare toggles on and missing the main number you care about

## Troubleshooting
- Reports are empty:
  - refresh and confirm you are signed in
  - confirm there are bookings/invoices in the database
- Scheduled emails not arriving:
  - scheduler (cron) may not be running
  - check `digitalocean-admin-operations.md`

## Next Guides
- [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [Documentation/digitalocean-admin-operations.md](digitalocean-admin-operations.md)
