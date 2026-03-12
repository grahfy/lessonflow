# LessonFlow Reference Manual

<div class="manual-callout info">
<strong>Source of truth:</strong> These Markdown files are the canonical manual text for LessonFlow. The in-app manual at <code>/admin/manual</code> renders the same corpus for use inside the admin console.
</div>

The manual is written as a reference work for owners, administrators, and technical owners who need to understand how LessonFlow behaves, which workflow area is responsible for which task, and where operational boundaries change. It is intended to be neutral in tone, cross-referenced by topic, and safe to consult during live administration.

## Recommended Reading Sequence

1. [Start Here and Features](01-Start-Here-and-Features.md)
2. [First-Time Setup and Admin Access](02-First-Time-Setup-and-Admin-Access.md)
3. [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
4. [Staff Management and Teacher Assignment](03a-Staff-Management-and-Teacher-Assignment.md)

## Core Reference Sections

- [Staff Management and Teacher Assignment](03a-Staff-Management-and-Teacher-Assignment.md)
- [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
- [Invoicing and Payments](05-Invoicing-and-Payments.md)
- [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md)
- [Reports and Follow-Up](07-Reports-and-Follow-Up.md)
- [Settings and Configuration](08-Settings-and-Configuration.md)
- [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)
- [Public Intake and Student Portal](10-Public-Intake-and-Student-Portal.md)
- [Updates and Release Visibility](11-Updates-and-Release-Visibility.md)
- [How LessonFlow Works](12-How-LessonFlow-Works.md)
- [Troubleshooting and Quick Reference](13-Troubleshooting-and-Quick-Reference.md)

## Technical Owner Reference

- [Technical Owner Runbook: Installation, Updates, and Deploy Scripts](digitalocean-admin-operations.md)

## Release Material

- [Version 1.2.0](release-notes-v1.2.0.md)
- [Version 1.1.0](release-notes-v1.1.0.md)
- [Version 1.0](release-notes-v1.0.md)
- [Release Maintainer Checklist](release-maintainer-checklist.md)

## Screenshot Pipeline

The screenshot pipeline keeps the manual visually aligned with the current UI.

1. Seed deterministic demo data:
   ```bash
   npm run docs:screenshots:seed
   ```
2. Capture UI screenshots with Playwright:
   ```bash
   npm run docs:screenshots
   ```
3. Sync captured assets into the public manual path:
   ```bash
   npm run docs:screenshots:sync
   ```

## Update Discipline

If a workflow changes, the relevant manual chapter should change in the same delivery cycle. If the UI changes materially, the corresponding screenshots should be refreshed so the reference remains trustworthy in both repository and in-app form.
