# 11 Admin Reports Dashboard

## Overview
Use `/admin/reports` for operational reporting across bookings and invoices.

The reports dashboard includes:
- daily, weekly, monthly, and yearly periods,
- appointments and booking-request activity summaries,
- outstanding invoice and overdue totals,
- earnings summaries,
- comparisons to previous periods,
- simple charts for quick trend review.

## Before You Start
- Sign in as an admin user.
- Open `/admin/reports`.
- Confirm invoice statuses are reasonably up to date (`Sent`, `Paid`, etc.).

## Step-by-Step Instructions

### A) Open and Refresh Reports
1. Go to `/admin/reports`.
2. Wait for the dashboard to load.
3. Click `Refresh reports` if you recently changed invoices/bookings and want the latest numbers.

### B) Use Date Format Option
1. In the controls card, open `Date format`.
2. Choose either:
   - `Readable` (for example `25 Feb 2026`), or
   - `DD/MM/YY` (for example `25/02/26`).
3. Review chart labels and period summaries in the format you prefer.

### C) Compare Period Views
1. In `Compare views (admin)`, enable/disable period toggles:
   - Daily
   - Weekly
   - Monthly
   - Yearly
2. Leave only the period(s) you are focusing on to reduce noise.
3. Re-enable others for side-by-side trend comparison.

### D) Read the Metric Cards
For each period card, review:
- appointment totals,
- pending/rejected/cancelled request activity,
- outstanding invoice count and balance,
- overdue counts/totals,
- paid earnings,
- previous-period comparison values (increase/decrease).

### E) Use Reports for Operations Follow-Up
1. If outstanding/overdue values rise:
   - go to `/admin/invoices`,
   - enable `Outstanding only`,
   - run reminder actions as needed.
2. If booking requests spike:
   - go to `/admin/bookings`,
   - review pending requests and confirm response times.
3. Use yearly report trends for planning and forecasting (owner/admin review).

## Visual Reference
![Admin reports dashboard](assets/admin-reports-dashboard.png)

## Scheduled Report Emails (Owner)
Daily/weekly/monthly/yearly report emails can be sent automatically to the owner/admin via cron jobs.

These are technical-owner features and are configured on the server (deploy/runbook documentation).

## Expected Result
- Admin can quickly review operational health and billing position.
- Trend comparisons help identify increases/decreases across days, weeks, months and years.

## Common Mistakes
- Reading reports before refreshing after major invoice changes.
- Comparing periods with too many toggles enabled and missing the main trend.
- Treating reports as a replacement for invoice follow-up actions (reports indicate what to investigate).

## Troubleshooting
- Reports page shows no data:
  - refresh,
  - confirm bookings/invoices exist in the selected periods,
  - check admin login/session status.
- Chart labels look unfamiliar:
  - switch `Date format` to your preferred format.
- Scheduled emails not arriving:
  - confirm cron jobs and `CRON_SECRET`,
  - check deploy/runbook logs and email settings.

## Related Guides
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md)
- [10-Admin-Settings-and-System-Configuration.md](10-Admin-Settings-and-System-Configuration.md)
- [Documentation/digitalocean-admin-operations.md](digitalocean-admin-operations.md)
