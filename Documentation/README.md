# End-User Documentation

This documentation is for people who operate Melbourne Guitar School day-to-day.

If you are an admin user, this set teaches you how to:
- manage bookings,
- manage customers,
- create and send invoices,
- follow up overdue invoices,
- handle common issues safely.

## Who This Is For
- Owner/admin operators.
- Front-desk/operations support.
- Backup team members covering bookings and billing.

## Start Here
1. `01-Getting-Started.md`
2. `02-Admin-Login-and-Access.md`
3. `03-Booking-Management.md`
4. `04-Customer-Directory.md`
5. `05-Invoice-Management.md`

## Full Guide Index
- [01-Getting-Started.md](01-Getting-Started.md): Platform orientation and first-use path.
- [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md): Admin sign-in, sign-out, and access issue recovery.
- [03-Booking-Management.md](03-Booking-Management.md): Calendar workflows, booking updates, and booking-side invoice start.
- [04-Customer-Directory.md](04-Customer-Directory.md): Customer create/edit/search and invoice-history navigation.
- [05-Invoice-Management.md](05-Invoice-Management.md): Full invoice lifecycle from create to paid/credit note.
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md): Manual and scheduled communications, plus SMTP fallback behavior.
- [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md): Outstanding invoice routines and reminder cadence.
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md): Fast issue resolution paths for common operations problems.
- [09-Glossary.md](09-Glossary.md): Plain-language definitions for operational and billing terminology.

## Recommended Learning Path

### New Admin (First Day)
1. Read `01-Getting-Started.md`.
2. Log in using `02-Admin-Login-and-Access.md`.
3. Practice booking actions in `03-Booking-Management.md`.
4. Practice invoice actions in `05-Invoice-Management.md`.

### Daily Operator
1. Use `03-Booking-Management.md` for calendar and booking tasks.
2. Use `05-Invoice-Management.md` for billing tasks.
3. Use `07-Reports-Outstanding-and-Follow-Up.md` for reminder cadence.

### Troubleshooting Path
1. Check `08-Troubleshooting-and-FAQs.md` first.
2. If issue is billing-related, cross-check `05-Invoice-Management.md`.
3. If issue is communication-related, cross-check `06-Email-and-Notifications.md`.

## Technical User Section (Owner/Technical Ops)
For technical operators who manage automation and support checks:
- Scheduled jobs and override payloads are documented in:
  - `07-Reports-Outstanding-and-Follow-Up.md` (Technical Operations section).
- Email delivery fallback behavior (`queued_no_smtp`) is documented in:
  - `06-Email-and-Notifications.md`.

## Screenshot Assets
- Folder: `Documentation/assets/`
- Capture plan and naming conventions: `Documentation/assets/README.md`
- In-app admin manual thumbnails (served by the app): `public/documentation/screenshots/`

## In-App Admin Manual
- Logged-in admins can open `/admin/manual` from the new `Manual` button in the admin header.
- The in-app manual provides:
  - quick links to Bookings / Invoices / Reports / Settings
  - a condensed deploy/update runbook
  - operator screenshot thumbnails for common workflows
- The repo markdown guides remain the source of truth for full written procedures.

## Screenshot Gallery (Key Screens)

### Admin Login
![Admin Login](assets/admin-login-page.png)

### Bookings Calendar
![Bookings Calendar Week View](assets/booking-calendar-week-view.png)

### Booking Detail Actions
![Booking Detail Dialog Notes and Actions](assets/booking-detail-dialog-notes-and-actions.png)

### Invoice Console
![Invoice Console List and Filters](assets/invoice-console-list-and-filters.png)

### Invoice Create Dialog
![Invoice Create Dialog](assets/invoice-create-dialog.png)

### Invoice Send / PDF Actions
![Invoice Detail Send and Download PDF](assets/invoice-detail-send-and-download-pdf.png)

## Deploy Runbook
- Droplet production operations runbook:
  - `Documentation/digitalocean-admin-operations.md`
- Deploy/update script reference (TUI options, managed cron, self-update behavior):
  - `deploy/README.md`

## Update and Versioning
- Documentation change history: `Documentation/CHANGELOG.md`
- When product behavior changes, update the affected guide in the same release.

## Documentation Governance
- Owner: Product/Operations lead (or delegated admin owner).
- Review cadence:
  - Monthly quick operational accuracy pass.
  - Release-based review whenever booking, customer, invoice, or email behavior changes.
- Update triggers:
  - UI labels/buttons changed.
  - Workflow steps changed.
  - Environment or policy changed (for example GST process guidance).

## New Admin Onboarding Checklist
1. Read `01-Getting-Started.md` and `02-Admin-Login-and-Access.md`.
2. Complete one booking workflow using `03-Booking-Management.md`.
3. Complete one invoice workflow using `05-Invoice-Management.md`.
4. Review follow-up cadence in `07-Reports-Outstanding-and-Follow-Up.md`.
5. Review issue recovery in `08-Troubleshooting-and-FAQs.md`.

## Operations Checklist

### Daily
1. Review bookings calendar for pending requests and time changes.
2. Review outstanding invoices and send overdue reminders as needed.
3. Confirm key communication actions were sent (or queued when SMTP is disabled).

### Weekly
1. Run `Send Due Reminders` batch for eligible overdue invoices.
2. Review unresolved invoice notes and confirm next follow-up actions.
3. Check for duplicate/incomplete customer profiles and clean up safely.

### Monthly
1. Verify documentation accuracy against current UI labels and workflows.
2. Review automation behavior and technical override documentation.
3. Add documentation updates to `Documentation/CHANGELOG.md`.
