# LessonFlow

<p align="center">
  <img src="lessonflow_logo.jpg" alt="LessonFlow logo" width="384"/>
</p>

LessonFlow is an MIT-licensed platform for music teachers and studios that unifies scheduling, customer records, invoicing, reporting, and student learning materials.

It is designed for self-hosted operations where a small team needs one system for day-to-day lesson administration.

## Feature Highlights

- Public lesson enquiry and booking request flows.
- Admin booking console with day/week/month views and request approval workflows.
- Customer directory with profile management and booking/invoice linkage.
- Invoice lifecycle support (`draft`, `sent`, `paid`, `void`), PDF generation, reminders, and credit notes.
- Admin reports dashboard for operational and billing visibility.
- Student portal login with secure access to assigned learning materials.
- In-app admin manual (`/admin/manual`) backed by repository documentation.

## Documentation Map

Use these docs based on what you are doing:

- Local setup and day-to-day dev workflows: [`LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md)
- VPS deployment runbook: [`deploy/README.md`](deploy/README.md)
- Admin operations handbook index: [`Documentation/README.md`](Documentation/README.md)
- Technical operations for hosted environments: [`Documentation/digitalocean-admin-operations.md`](Documentation/digitalocean-admin-operations.md)

## Quick Start (Local Development)

Requirements:

- Node.js 20+
- Docker + Docker Compose

Setup:

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
- First-run setup wizard: `http://localhost:3000/setup`

For full local setup, seeding, Docker troubleshooting, and test DB workflows, use [`LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md).

## Common Commands

```bash
# App lifecycle
npm run dev
npm run build
npm run start

# Quality checks
npm run lint
npm run typecheck

# Tests
npm run test:prepare
npm run test
npm run test:e2e

# Docs screenshots
npm run docs:screenshots:seed
npm run docs:screenshots
npm run docs:screenshots:sync
npm run docs:screenshots:update

# Prisma
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Important Routes

Public:

- `/`
- `/lessons`
- `/teacher`
- `/videos`
- `/vouchers`
- `/contact`
- `/book`
- `/terms`

Admin:

- `/setup`
- `/admin/login`
- `/admin/bookings`
- `/admin/customers`
- `/admin/invoices`
- `/admin/reports`
- `/admin/settings`
- `/admin/manual`

Student:

- `/student/login`
- `/student/portal`
- `/student/materials`

## Deployment Overview

LessonFlow is built for self-hosted VPS/VM deployment with release automation under `deploy/`.

Recommended routine release path:

```bash
./deploy/update.sh --interactive
```

For complete deployment details, OS prerequisites, SSL, cron, and troubleshooting, use [`deploy/README.md`](deploy/README.md).

## Deploy Scripts (Install, Update, Maintenance)

These scripts in [`deploy/`](deploy/) are the main operational entry points:

- `deploy/setup-packages.sh`: Installs core server packages and bootstrap dependencies for first-time host preparation.
- `deploy/deploy.sh`: Release engine for direct deploys and initial release setup.
- `deploy/update.sh`: Update wrapper for routine releases (`fetch`/`pull` + deploy flow).
- `deploy/maintenance.sh`: Maintenance helper for operational upkeep and service-level routines.
- `deploy/backup.sh`: Backup execution helper for application data/database workflows.
- `deploy/cron.sh`: Cron job runner entrypoint used by scheduled automation.
- `deploy/setup-ssl.sh`: SSL helper script for certificate setup flows.

When to use which:

- First install/bootstrap: `setup-packages.sh`, then `deploy.sh`
- Routine application updates: `update.sh`
- Operational maintenance: `maintenance.sh`
- Backup workflows: `backup.sh`
- SSL setup: `setup-ssl.sh`

## Testing

Tests require a dedicated MySQL/MariaDB test database URL via `TEST_DATABASE_URL`.

Example:

```bash
export TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3307/mgs_test"
npm run test:prepare
npm run test
npm run test:e2e
```

See [`LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md) for test DB Docker setup and focused QA flows.

## Whitelabel and Branding

LessonFlow supports rebranding for different studios and subjects.

Primary configuration surfaces:

- Environment variables in `.env` / `.env.example` (brand, contact, invoice defaults, secrets).
- Admin settings pages (`/admin/settings`) for branding, page content, email templates, and invoice presentation.

## Screenshots

### Admin Dashboard (Bookings Console)

![LessonFlow admin dashboard bookings console](public/documentation/screenshots/booking-calendar-week-view.png)

### Admin Reports Dashboard

![LessonFlow admin reports dashboard](public/documentation/screenshots/admin-reports-dashboard.png)

### Admin Settings

![LessonFlow admin settings page](public/documentation/screenshots/admin-settings-page.png)

## License

LessonFlow is released under the **MIT License**.
See [`LICENSE`](LICENSE).
