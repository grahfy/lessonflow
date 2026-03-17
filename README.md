# LessonFlow

<p align="center">
  <img src="lessonflow_logo.jpg" alt="LessonFlow logo" width="384"/>
</p>

LessonFlow is a self-hosted operations platform for music teachers and studios. It brings public lesson enquiries, booking administration, customer records, invoicing, reporting, student learning materials, and operational tooling into one system that can run on your own VPS.

It is designed for small teams that want one admin console for day-to-day school operations without stitching together a calendar app, invoicing tool, portal, CMS, and deployment runbook.

## What LessonFlow Includes

- **Public website and lead capture**: Home, lessons, teacher, vouchers, videos, terms, contact, and booking pages, with editable public content and SEO-aware page management.
- **Protected intake forms**: Booking and contact flows protected by CAPTCHA and honeypot checks, designed to feed directly into admin follow-up workflows.
- **Admin scheduling console**: Day, week, month, and year calendar views with approval workflows, manual bookings, reschedules, cancellations, reminders, and invoice creation from booking context.
- **Staff management and assignment control**: Owner-managed staff workspace with teacher accounts, teaching profiles, assignment defaults, and single-user owner fallback when no separate teacher account exists.
- **Customer operations**: Searchable customer directory, contact-detail editing, booking and invoice history, portal credential management, and safe archive/delete workflows.
- **Timezone-safe lesson handling**: Booking, invoice, and portal datetime flows interpret `datetime-local` values in the configured business timezone instead of implicit browser or Linux local time.
- **Billing and follow-up**: Draft or send-now invoices, invoice presets, PDF generation, resend and reminder actions, overdue filtering, payment state changes, voiding, and credit-note support.
- **Student portal and materials**: Secure student login, appointment visibility, request and cancellation actions, and access to assigned PDFs and audio learning materials.
- **Reports and owner visibility**: Daily, weekly, monthly, yearly, and custom-range reporting, invoice aging visibility, and summary workflows for operational follow-up.
- **Admin settings and whitelabel controls**: Branding, invoice, content, email, product, and system configuration from the admin console.
- **System operations and diagnostics**: Admin system logs, bug-report workflows, in-app update visibility, and synchronized operator documentation in `/admin/manual`.
- **Deployment and maintenance tooling**: VPS install, release, rollback, timer, and maintenance scripts built for `systemd + nginx + MariaDB` environments.
- **Supporting integrations and utilities**: Gmail and IMAP-backed email workflows, owner login alerts for unread customer emails, geo detection, public voucher support, in-app manual screenshots, and white-label content management.

## Feature Inventory

### Public-facing functions
- Marketing and trust pages: `/`, `/lessons`, `/teacher`, `/videos`, `/terms`
- Enquiry and conversion flows: `/book`, `/contact`, `/vouchers`
- CAPTCHA and honeypot validation for public form submissions
- Editable public copy, branding, and metadata through admin-managed content settings

### Admin console functions
- Admin login, first-run setup, and protected admin routing
- Bookings console with lesson approval, manual creation, edit, move, cancel, and reminder actions
- Teachers workspace with owner and teacher account management, assignment-aware profile editing, and staff-scoped admin access
- Customer directory with profile editing, communication context, billing history, and portal support
- Invoices console with create, send, resend, remind, mark paid/unpaid, void, delete, and PDF actions
- Reports console with operational and revenue visibility plus overdue follow-up support
- Settings console for branding, invoice settings, products, content, email, and system configuration
- Manual console for screenshot-backed operator documentation
- System logs page for event review and bug-report submission
- Update progress and deployment visibility inside the admin experience

### Student and owner support functions
- Student login with generated credentials and verification checks
- Student portal for lesson visibility, request handling, cancellation flow, and materials access
- Learning-material upload, preview, assignment, and deletion workflows
- Owner-facing reporting, billing follow-up, and release/update awareness

### Platform and operational functions
- MariaDB + Prisma data layer for bookings, customers, invoices, materials, and operational history
- Scheduled background jobs via `systemd` timers for reminders, sync, and reporting
- Self-hosted deployment scripts for install, update, rollback, SSL, backup, and maintenance
- Repository handbook plus in-app manual kept aligned with screenshot automation

## Why Teams Evaluate It

- Built for **self-hosting**, with deployment scripts for low-power VPS environments using `systemd + nginx + MariaDB`.
- Covers the full school workflow from **lead capture to invoicing to student follow-up**.
- Keeps operator-facing knowledge close to the product with a synchronized **repository handbook and in-app manual**.
- Includes tooling for ongoing operations, not just the app UI: **updates, reports, screenshot-backed docs, and service runbooks**.

## Product Screenshots

### Bookings Console
![LessonFlow bookings console](public/documentation/screenshots/booking-calendar-week-view.png)
The bookings console is the operational hub for approvals, lesson management, and calendar visibility.

### Invoices and Follow-Up
![LessonFlow invoices console](public/documentation/screenshots/invoice-console-list-and-filters.png)
The invoices view surfaces billing status, overdue balances, and reminder workflows in one place.

### Reports Dashboard
![LessonFlow reports dashboard](public/documentation/screenshots/admin-reports-dashboard.png)
Owners can review activity, earnings, and overdue trends without leaving the admin console.

### Settings and Configuration
![LessonFlow settings page](public/documentation/screenshots/admin-settings-page.png)
Branding, content, invoicing, products, and system configuration are all managed from admin settings.

### Student Portal
![LessonFlow student portal](public/documentation/screenshots/student-portal-page.png)
Students can review appointments and access assigned learning materials from their portal.

### Public Booking Flow
![LessonFlow public booking page](public/documentation/screenshots/public-book-page.png)
Public intake starts on the booking page and feeds directly into the admin workflow.

## Quick Start

Requirements:
- Node.js 20+
- Docker with Compose support

```bash
npm ci
cp .env.example .env
docker compose up -d
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

Then open:
- App: `http://localhost:3000`
- Setup wizard: `http://localhost:3000/setup`

For a fuller local workflow, seeded demo data, and troubleshooting, use [`LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md).

### Ephemeral Demo Preview

To run a reset-on-exit local preview suitable for sales demos:

```bash
./scripts/test-full-site-demo.sh
```

The demo:
- seeds a richer demo dataset,
- allows add/edit/delete changes during the session,
- prints frontend/admin preview links plus demo credentials,
- destroys the demo database when the session ends.

## Self-Hosting on a VPS

LessonFlow ships with deployment scripts for Linux VPS environments.

```bash
git clone https://gitlab.com/grahfmusic/lessonflow.git
cd lessonflow
sudo ./deploy/setup-packages.sh
sudo ./deploy/deploy.sh --branch main --ssl --domain yourdomain.com
```

After deployment, finish setup in the browser at `https://yourdomain.com/setup`.

Deploy model:
- `deploy/update.sh` advances the persistent source checkout with `git fetch/pull`.
- `deploy/deploy.sh` builds a fresh timestamped release under `/var/www/lessonflow/releases/` and repoints `/var/www/lessonflow/current`.
- `sudo ./deploy/deploy.sh --print-deploy-mode` reports the current host layout.

For full install, update, rollback, SSL, timer, and troubleshooting guidance, see [`deploy/README.md`](deploy/README.md).

## Documentation Map

- Local setup and daily developer workflow: [`LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md)
- VPS deployment and maintenance: [`deploy/README.md`](deploy/README.md)
- Operator handbook index: [`Documentation/README.md`](Documentation/README.md)
- Technical owner runbook: [`Documentation/digitalocean-admin-operations.md`](Documentation/digitalocean-admin-operations.md)
- Detailed release notes: [`Documentation/release-notes-v1.2.0.md`](Documentation/release-notes-v1.2.0.md)
- Release maintainer checklist: [`Documentation/release-maintainer-checklist.md`](Documentation/release-maintainer-checklist.md)

## Core Commands

```bash
# Development
npm run dev
npm run build
npm run start

# Quality
npm run lint
npm run typecheck

# Tests
npm run test
npm run test:e2e

# Manual screenshots
npm run docs:screenshots:seed
npm run docs:screenshots
npm run docs:screenshots:sync

# Prisma
npm run prisma:generate
npm run prisma:migrate
```

## Stack

- Next.js 15 App Router
- TypeScript 5
- MariaDB with Prisma
- Radix UI and GSAP
- Zod validation
- Vitest and Playwright

## Key Routes

- Public: `/`, `/lessons`, `/teacher`, `/vouchers`, `/videos`, `/contact`, `/book`, `/terms`
- Admin: `/admin/login`, `/admin/bookings`, `/admin/customers`, `/admin/teachers`, `/admin/invoices`, `/admin/reports`, `/admin/settings`, `/admin/manual`, `/admin/system-logs`, `/admin/about`
- Student: `/student/login`, `/student/portal`, `/student/materials`

## Developer Credits

LessonFlow was developed in `2026` and created by `Dean Thomson`.

- Contact: [contact@grahfmusic.com](mailto:contact@grahfmusic.com)
- GitLab repository: [https://gitlab.com/grahfmusic/lessonflow.git](https://gitlab.com/grahfmusic/lessonflow.git)
- GitLab wiki: [https://gitlab.com/grahfmusic/lessonflow/-/wikis/home](https://gitlab.com/grahfmusic/lessonflow/-/wikis/home)

## License

LessonFlow is released under the **MIT License**. See [`LICENSE`](LICENSE).
