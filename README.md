# Melbourne Guitar School Platform

Turn enquiries into confirmed lessons and paid invoices in one system.

This software combines:
- public marketing pages,
- contact and booking intake,
- admin scheduling and customer management,
- invoice generation, reminders, and payment tracking.

It is built for a real-world teaching business that needs fast admin operations, clean customer communication, and a reliable billing workflow.

## What This Software Does
Melbourne Guitar School Platform is a full-stack web application for running day-to-day operations:
- Capture leads and lesson requests from the public website.
- Manage bookings in an owner/admin calendar workflow.
- Maintain a customer directory linked to bookings.
- Generate and send professional invoices with PDF attachments.
- Track outstanding balances, payment status, reminders, and credit notes.

## Why It’s Valuable
- One workflow from enquiry to payment.
- Fewer manual handoffs between calendar, email, and invoicing tools.
- Better data integrity with audit trails and invoice history.
- Built-in communication flows for reminders and updates.
- Supports AU-friendly invoice fields and GST-aware defaults.

## Feature Summary

### Public Website
- Marketing pages: `/`, `/lessons`, `/teacher`, `/vouchers`, `/terms`.
- Contact form at `/contact`.
- Booking request form at `/book`.
- Student portal entry at `/student/login`.
- Smooth page transitions and reduced-motion support.

### Booking & Admin Operations
- Admin login at `/admin/login`.
- Booking console at `/admin/bookings`.
- Day/week/month visual calendar.
- Click-to-open booking dialogs with full details.
- Approve/reject pending requests.
- Edit/move/cancel confirmed bookings.
- Recurring booking support and series cancellation.
- Manual reminder/custom email actions from admin.
- Automatic booking move email to customer.

### Customer Management
- Customer directory with search/filter workflows.
- Create/edit/archive customer records.
- Duplicate protection during manual booking flows.
- Customer-to-booking linkage preserved for history.
- Portal credential reveal/regenerate controls with audit logging.
- Customer learning-material management tied to selected appointments.

### Student Portal
- Student login via full name + postcode + generated password.
- Automatic credential generation when first appointment is approved.
- Approval email includes student portal login instructions and initial password.
- Student dashboard at `/student/portal`:
  - upcoming and previous appointments,
  - assigned lesson materials (audio/PDF) with authenticated downloads.

### Invoicing & Billing
- Invoice console at `/admin/invoices`.
- Create invoice from confirmed appointment.
- Create invoice from customer context.
- Temporary line-item options:
  - lesson fee,
  - educational books,
  - digital guitar lessons,
  - custom product/charge.
- Line-item editing in invoice detail.
- GST-aware calculations with configurable defaults.
- Download invoice as PDF.
- Send invoice via email with PDF attached.
- Mark paid / mark unpaid.
- Outstanding invoice view and aging filters.
- 7/14/30-day overdue reminder workflow:
  - single invoice reminder,
  - bulk reminder run.
- Credit note creation for sent/paid invoices.
- Invoice audit/history data retained for traceability.

## Tech Stack
- Next.js App Router + TypeScript
- Prisma ORM
- MySQL (Prisma datasource provider for app, tests, and production)
- Nodemailer for SMTP delivery
- Gmail API (OAuth2 via `googleapis`) for HTTPS email delivery fallback
- pdf-lib for invoice PDF generation

## Project Structure
- `src/app`: routes and API handlers
- `src/components`: reusable UI and admin clients
- `src/lib`: business logic, services, utilities
- `prisma`: schema and migrations
- `tests`: automated test suite
- `thoughts`: tickets, research, implementation plans

## Installation

### Prerequisites
- Node.js 20+ recommended
- npm

### Quick Start
1. Install dependencies:
```bash
npm install
```
2. Create environment file:
```bash
cp .env.example .env
```
3. Start a local MySQL database (Docker example, no host MySQL install required):
```bash
docker run --name mgs-dev-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=mgs_dev \
  -p 3306:3306 -d mysql:8
```
4. Apply local migrations (MySQL):
```bash
DATABASE_URL="mysql://root:root@127.0.0.1:3306/mgs_dev" npx prisma migrate deploy
```
5. Start dev server:
```bash
npm run dev
```
6. Open setup wizard and create first admin account:
```bash
http://127.0.0.1:3000/setup
```

### MySQL Setup (Production)
Use MySQL in production:
```bash
# Create MySQL database first
DATABASE_URL="mysql://user:password@host:3306/database_name" npx prisma migrate deploy
```

Alternatively, configure the database connection through the setup wizard at `/setup` after starting the server.

Default local app URL:
- `http://127.0.0.1:3000`

## Full Local Verification Flow
Run dependency install, local DB prep, tests, and then launch the site:

```bash
npm run local:full-site
```

Note: `scripts/test-full-site-local.sh` is still SQLite-oriented and should be updated before relying on it with the current MySQL Prisma schema. Prefer the Docker MySQL flow in the Testing section below for now.

By default this script binds to `0.0.0.0` so it can be reached:
- locally via `http://127.0.0.1:3000`,
- from another device via your machine’s LAN IP.

Optional flags:
- `npm run local:full-site -- --no-start`
- `npm run local:full-site -- --skip-install`
- `npm run local:full-site -- --skip-tests`

Host/port override:
```bash
HOST=0.0.0.0 PORT=3000 npm run local:full-site
```

## Testing
Tests require a MySQL-compatible database because the Prisma schema provider is `mysql`.

Env loading order for tests:
- `.env.test.local` -> `.env.test` -> `.env.local` -> `.env`

Recommended local setup without installing MySQL on the host (Docker):
```bash
docker run --name mgs-test-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=mgs_test \
  -p 3307:3306 -d mysql:8

export TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3307/mgs_test"
```

`npm run test:prepare` uses `TEST_DATABASE_URL` (preferred) or `DATABASE_URL` and runs Prisma migrations against that database.

Commands:
```bash
npm run test:prepare
npm test
npm run lint
npm run typecheck
```

## Environment Variables

### Core
- `DATABASE_URL`: Prisma MySQL URL (`mysql://user:password@host:3306/database_name`).
- `ADMIN_EMAIL`: admin login and owner notification email.
- `ADMIN_PASSWORD`: legacy bootstrap password (kept for tests/local scripts).
- `ADMIN_SESSION_SECRET`: admin session signing secret.
- `STUDENT_SESSION_SECRET`: student portal session signing secret.
- `STUDENT_SESSION_MAX_AGE_SECONDS`: student session TTL in seconds.
- `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY`: at-rest encryption key for revealable portal passwords.
- `STUDENT_PORTAL_PASSWORD_LENGTH`: generated portal password length (bounded).
- `CRON_SECRET`: shared secret for scheduled job endpoints.

### SMTP / Email
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_USER_EMAIL`

Email provider behavior:
- If SMTP is configured and working, mail is sent via SMTP.
- If SMTP is not configured and Gmail OAuth vars are configured, mail is sent via Gmail API over HTTPS.
- If SMTP is configured but blocked/failing and Gmail OAuth vars are configured, the app falls back to Gmail API.
- If neither provider is available, outbound emails are recorded as `queued_no_smtp`.
- The setup wizard (`/setup`) exposes both SMTP and Gmail fields and shows a combined `Email delivery` readiness check.

### Learning Materials Storage
- `LEARNING_MATERIALS_STORAGE_DRIVER`: `local` or `s3` (`local` default).
- `LEARNING_MATERIALS_LOCAL_ROOT`: local filesystem root when using `local`.
- `LEARNING_MATERIALS_S3_BUCKET`
- `LEARNING_MATERIALS_S3_REGION`
- `LEARNING_MATERIALS_S3_ACCESS_KEY_ID`
- `LEARNING_MATERIALS_S3_SECRET_ACCESS_KEY`
- `LEARNING_MATERIALS_S3_PUBLIC_BASE_URL` (optional).

### Invoice Configuration
- `INVOICE_BUSINESS_NAME`
- `INVOICE_BUSINESS_ABN`
- `INVOICE_BANK_NAME`
- `INVOICE_BANK_BSB`
- `INVOICE_BANK_ACCOUNT_NAME`
- `INVOICE_BANK_ACCOUNT_NUMBER`
- `INVOICE_PAYMENT_TERMS_DAYS`
- `INVOICE_GST_REGISTERED`
- `INVOICE_DEFAULT_TAX_MODE`
- `INVOICE_CREDIT_NOTE_PREFIX`

## Scheduled Jobs

### Daily Bookings Digest
- Endpoint: `POST /api/jobs/daily-bookings-digest`
- Header: `x-cron-secret: <CRON_SECRET>`

### Invoice Reminders
- Endpoint: `POST /api/jobs/invoice-reminders`
- Header: `x-cron-secret: <CRON_SECRET>`
- Optional JSON payload:
  - `dryRun` (`boolean`)
  - `maxInvoices` (`number`, default `100`)
  - `customerId` (`string`)
  - `stage` (`7 | 14 | 30`)

If deploying on Vercel, schedules can be configured in `vercel.json`.
For DigitalOcean Droplet deployments, configure cron jobs or `systemd` timers that `POST` these endpoints with `x-cron-secret`.
See `Documentation/digitalocean-admin-operations.md` for examples.

## Available Routes
- Public:
  - `/`
  - `/lessons`
  - `/teacher`
  - `/vouchers`
  - `/contact`
  - `/book`
  - `/terms`
  - `/student/login`
  - `/student/portal`
- Setup:
  - `/setup` (first-run initialization)
- Admin:
  - `/admin/login`
  - `/admin/bookings`
  - `/admin/invoices`

## First-Run Production Setup
Run this once after deploying to hosting:

### Option 1: Configure via Setup Wizard (Recommended)
1. Set initial production env vars (at minimum, `DATABASE_URL` pointing to MySQL)
2. Deploy and run database migrations:
```bash
npx prisma migrate deploy
```
3. Visit `/setup`.
4. Click "Configure Environment" to add or update env vars directly in the browser:
   - Database connection (MySQL)
   - Gmail API sender + OAuth credentials (recommended on hosts that block SMTP ports), or SMTP settings
   - Session secrets
   - Invoice business details
5. Save configuration and restart the server.
6. Resolve any remaining failing checks in the wizard.
7. Create the first admin account.
8. Sign in at `/admin/login`.

### Option 2: Manual Environment Setup
1. Set all required production env vars in `.env` before deploying.
2. Deploy and run database migrations:
```bash
npx prisma migrate deploy
```
3. Visit `/setup`.
4. Resolve all failing checks in the wizard (including `Email delivery`, using Gmail API or SMTP).
5. Create the first admin account.
6. Sign in at `/admin/login`.

For DigitalOcean Droplet operations (systemd, Nginx headers, cron/systemd timers, restart workflow), see:
- `Documentation/digitalocean-admin-operations.md`

### Required Environment Variables
At minimum, production requires:
- `DATABASE_URL` - MySQL connection string
- `ADMIN_SESSION_SECRET` - Secure random string for admin sessions
- `STUDENT_SESSION_SECRET` - Secure random string for student portal sessions

## Operational Notes
- Booking constraints and validation are server-side enforced.
- Invoice records are designed to preserve historical context.
- Sent/paid invoices use credit notes for correction workflows.
- Additional user-facing docs planning lives in `Documentation/`.
