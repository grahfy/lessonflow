# LessonFlow Operations Manual

<div class="manual-callout info">
<strong>Source of truth:</strong> These markdown files are the authored manual for LessonFlow. The in-app manual at <code>/admin/manual</code> renders the same content for live use inside the admin console.
</div>

This manual is written for school owners, administrators, and technical owners who need to operate LessonFlow safely and confidently. It explains what the platform can do, how the workflows fit together, and how to maintain the system without exposing sensitive implementation details.

## Read This First

Start with:

1. [Start Here and Features](01-Start-Here-and-Features.md)
2. [First-Time Setup and Admin Access](02-First-Time-Setup-and-Admin-Access.md)
3. [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)

## Core Operations

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

## Technical Owner

- [DigitalOcean Admin Operations Runbook](digitalocean-admin-operations.md)

## Release Notes

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

If a workflow changes, the relevant manual chapter must change in the same delivery cycle. If the UI changes significantly, refresh the screenshots too. The goal is to keep the manual operationally trustworthy, not merely close to the truth.
