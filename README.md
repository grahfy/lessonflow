# Melbourne Guitar School Platform

A Next.js application for running Melbourne Guitar School operations end to end:
public website, booking intake, admin scheduling, customer records, invoicing, reminders, and student portal access.

## What It Includes

- Public marketing pages and enquiry/booking forms
- Admin booking console (`/admin/bookings`)
- Admin invoice console (`/admin/invoices`)
- Admin reports (`/admin/reports`) and settings (`/admin/settings`)
- Admin manual/docs hub (`/admin/manual`)
- Student login + portal (`/student/login`, `/student/portal`)
- Invoice PDFs, reminders, credit notes, and payment status tracking
- Learning materials upload/preview/download for students

## Tech Stack

- Next.js (App Router) + React + TypeScript
- Prisma ORM
- MySQL (current Prisma datasource provider)
- Vitest
- Nodemailer + Gmail API fallback (`googleapis`)
- `pdf-lib` for invoice PDFs

## Requirements

- Node.js 20+ (recommended)
- npm
- MySQL 8+ (local install or Docker)

## Quick Start (Local Development)

This project currently uses a **MySQL Prisma schema** (`prisma/schema.prisma`).

### 1. Install dependencies

```bash
npm install
```

### 2. Create a local env file

```bash
cp .env.example .env
```

Important:
- `.env.example` ships with a MySQL placeholder URL for local Docker usage.
- Update it for your actual local/prod database before running Prisma/app commands.

Example local MySQL URL:

```bash
DATABASE_URL="mysql://root:root@127.0.0.1:3306/mgs_dev"
```

At minimum for local startup, set/update:
- `DATABASE_URL`
- `ADMIN_SESSION_SECRET`
- `STUDENT_SESSION_SECRET`
- `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY`
- `CRON_SECRET`

You can keep email settings empty for local development.

### 3. Start MySQL (Docker example)

```bash
docker run --name mgs-dev-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=mgs_dev \
  -p 3306:3306 \
  -d mysql:8
```

### 4. Run Prisma migrations

```bash
npx prisma migrate deploy
```

If you changed dependencies/schema and Prisma client generation is needed:

```bash
npm run prisma:generate
```

### 5. Start the app

```bash
npm run dev
```

Open:
- `http://127.0.0.1:3000`

### 6. Complete first-run setup

Open the setup wizard:
- `http://127.0.0.1:3000/setup`

Use it to:
- verify environment readiness
- configure email/invoice settings (optional for local dev)
- create the first admin account

Then sign in at:
- `http://127.0.0.1:3000/admin/login`

## Local Testing (Vitest)

Tests also require a **MySQL** database because the Prisma provider is MySQL.

Recommended Docker test DB:

```bash
docker run --name mgs-test-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=mgs_test \
  -p 3307:3306 \
  -d mysql:8
```

Set a dedicated test DB URL:

```bash
export TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3307/mgs_test"
```

Run checks:

```bash
npm run test:prepare
npm test
npm run lint
npm run typecheck
```

Notes:
- `npm test` already runs `test:prepare` internally.
- Prefer `TEST_DATABASE_URL` so tests do not target your dev database.
- `.env.test.example` includes both `DATABASE_URL` and `TEST_DATABASE_URL` MySQL placeholders for a local Docker test DB.

## Common Commands

```bash
npm run dev           # start local dev server
npm run dev:clean     # clear .next and start dev server
npm run build         # production build
npm run start         # run production build locally
npm run lint          # ESLint
npm run typecheck     # TypeScript checks
npm test              # tests (prepares DB first)
npm run test:watch    # vitest watch (prepares DB first)
npm run prisma:studio # Prisma Studio
```

## Project Structure

- `src/app` - routes and API handlers (App Router)
- `src/components` - shared UI and admin client components
- `src/lib` - domain logic, services, helpers
- `src/styles/globals.css` - global styles
- `prisma` - Prisma schema and migrations
- `tests` - Vitest suite
- `scripts` - local/test utility scripts
- `Documentation` - operational/deployment docs
- `thoughts` - tickets, research, plans

## Key Routes

### Public

- `/`
- `/lessons`
- `/teacher`
- `/vouchers`
- `/contact`
- `/book`
- `/terms`

### Setup / Admin

- `/setup`
- `/admin/login`
- `/admin/bookings`
- `/admin/invoices`
- `/admin/reports`
- `/admin/settings`
- `/admin/manual`

### Student

- `/student/login`
- `/student/portal`
- `/student/materials`

## Environment Variables

Use `.env.example` as the starting template, then configure values for your environment.

Important groups:
- Database: `DATABASE_URL`
- Sessions/security: `ADMIN_SESSION_SECRET`, `STUDENT_SESSION_SECRET`, `CRON_SECRET`
- Student portal: `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY`, password length/max-age settings
- Email: SMTP vars and/or Gmail OAuth vars
- Invoice defaults: business/bank/GST settings
- Learning materials storage: local or S3 settings

## Scheduled Jobs

Protected cron endpoints require:
- header `x-cron-secret: <CRON_SECRET>`

Implemented jobs include:
- daily bookings digest
- invoice reminders (`/api/jobs/invoice-reminders`)
- admin operations reports (daily/weekly/monthly/yearly)

For deployment-specific scheduling examples, see:
- `vercel.json`
- `Documentation/digitalocean-admin-operations.md`

## Deployment Notes

- Run Prisma migrations on deploy:

```bash
npx prisma migrate deploy
```

- Complete or verify configuration in `/setup` after first deploy.
- For DigitalOcean Droplet operations (systemd, nginx, cron/timers), use:
  - `deploy/deploy.sh`
  - `deploy/update.sh`
  - `Documentation/digitalocean-admin-operations.md`

## Troubleshooting

### Prisma says the DB URL is invalid for the provider

The Prisma schema provider is `mysql`, so `DATABASE_URL` / `TEST_DATABASE_URL` must start with:

```text
mysql://
```

If you copied an env template, confirm the MySQL URL points to the correct database for that environment.

### `npm test` fails before running tests

Usually means test DB setup is missing.
Set `TEST_DATABASE_URL` to a reachable MySQL database and run:

```bash
npm run test:prepare
```

### Emails are not sending locally

This is expected if SMTP/Gmail OAuth env vars are unset.
Core app/admin workflows can still be exercised locally without email delivery.
