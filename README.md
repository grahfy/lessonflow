# LessonFlow

<p align="center">
  <img src="public/images/lessonflow-logo.svg" alt="LessonFlow logo" width="640" />
</p>

LessonFlow is an MIT-licensed platform for individual music teachers and music schools who want to automate the admin work around lessons.

It combines appointment workflows, invoicing, reporting, and a student portal with learning materials that can be:
- assigned to a specific student,
- linked to a specific appointment, or
- stored as general (not appointment-linked) resources.

## What LessonFlow Solves

Music teaching businesses often juggle multiple tools for:
- booking requests,
- calendars,
- customer records,
- invoices,
- reminders,
- lesson resources,
- and follow-up communication.

LessonFlow brings those workflows into one system so teachers and admins can spend less time on operations and more time teaching.

## Core Features

### Scheduling and Appointments

- Public booking request form for new enquiries
- Admin booking console for reviewing and managing requests
- Day/week/month calendar views for appointments
- Approve/reject/cancel/move appointment workflows
- Recurring booking support and recurring series management
- Customer-linked booking history

### Invoices and Billing

- Admin invoice console with search, filters, and aging views
- Draft, sent, paid, and void invoice lifecycle states
- PDF invoice generation and download
- Email sending and reminder workflows
- Credit note support for corrections on sent/paid invoices
- Invoice audit history for traceability
- GST-aware invoice defaults and calculations (AU-friendly setup)

### Admin Reports

- Admin reports dashboard for operational and revenue visibility
- Period-based reports (daily/weekly/monthly/yearly)
- Invoice status and outstanding tracking
- Email report job endpoints for scheduled summaries

### Student Portal and Learning Materials

- Student login + portal
- Student-specific learning materials management
- Materials can be assigned to a specific appointment or left unassigned (general resources)
- Authenticated access to audio/PDF learning materials
- Admin upload and management workflows for lesson resources

### Admin Operations and Setup

- First-run setup wizard (`/setup`)
- Admin settings/config management
- Deploy/update helper scripts for VPS/Droplet self-hosting
- Cron/job endpoint support for scheduled automations

## Admin Screenshots

Tracked admin screenshots already exist in the repository (including a Playwright-generated admin dashboard/bookings console capture).

### Admin Dashboard (Bookings Console)

![LessonFlow admin dashboard bookings console](public/documentation/screenshots/booking-calendar-week-view.png)

### Admin Reports Dashboard

![LessonFlow admin reports dashboard](public/documentation/screenshots/admin-reports-dashboard.png)

### Admin Settings

![LessonFlow admin settings page](public/documentation/screenshots/admin-settings-page.png)

## Who It Is For

- Solo music teachers
- Teaching studios / small music schools
- Admin staff supporting appointment + billing workflows
- Teams self-hosting a lesson operations platform on a VPS/VM

## Technical Overview

### Stack

- Next.js (App Router)
- React + TypeScript
- Prisma ORM
- MySQL (current Prisma datasource provider)
- Vitest (tests)
- Nodemailer + Gmail API fallback (`googleapis`)
- `pdf-lib` for invoice PDFs

### Project Structure (high level)

- `src/app` - routes and API handlers
- `src/components` - shared UI and admin client components
- `src/lib` - domain logic, services, utilities
- `src/styles` - global styling
- `prisma` - Prisma schema + migrations
- `deploy` - deployment, update, nginx, systemd, and SSL scripts/templates
- `scripts` - local/test helper scripts
- `Documentation` - deployment and operational docs
- `tests` - automated tests

### Important Routes

Public:
- `/`
- `/lessons`
- `/teacher`
- `/vouchers`
- `/contact`
- `/book`
- `/terms`

Admin:
- `/setup`
- `/admin/login`
- `/admin/bookings`
- `/admin/invoices`
- `/admin/reports`
- `/admin/settings`
- `/admin/manual`

Student:
- `/student/login`
- `/student/portal`
- `/student/materials`

## Installation and Deployment (VPS / VM / DigitalOcean)

This project is designed to be self-hosted. The recommended entry points for production-like installs and updates are:

- `deploy/deploy.sh` (first deploy / direct deploy)
- `deploy/update.sh` (git pull + deploy wrapper)

### Script roles (`update.sh` vs `deploy.sh`)

Use `update.sh` for routine server maintenance and `deploy.sh` for direct release execution.

`deploy/update.sh` (wrapper):
- runs from your persistent git clone on the server
- can `fetch`/`pull` the selected branch (ff-only)
- shows an interactive two-column TUI for workflow + deploy pass-through settings
- can run immediate helper actions (Nginx / PHP-FPM-if-needed / systemd service / cron jobs)
- passes selected bootstrap workflow helper toggles through to `deploy.sh` during `Start update/deploy`
- then calls `deploy.sh` with the selected options

`deploy/deploy.sh` (release engine):
- builds a timestamped release under `/var/www/melbourne-guitar-school/releases`
- links shared files/dirs (`shared/.env`, `shared/data`)
- runs dependency install, Prisma generate, migrations, build, and service restarts
- updates the `current` symlink atomically
- can be run directly for first installs or advanced/manual workflows

Interactive TUI notes:
- `update.sh` includes a remote update alert line (above “Update Workflow Options”) that highlights a newer remote commit hash + one-line subject when available.
- `update.sh` handles update/deploy orchestration and wrapper-level helper actions, while MySQL+DB bootstrap is handled directly in `deploy.sh`.
- `deploy.sh` supports immediate bootstrap actions `J` (managed cron jobs), `M` (MySQL+DB), `N` (Nginx), `P` (PHP-FPM-if-needed), `U` (app systemd service), plus workflow toggles for `MySQL + create DB`, `Install cron/crond`, and `Install Nginx`.

### 1. Server prerequisites

Recommended target:
- Ubuntu/Debian VM or DigitalOcean Droplet (other Linux distros may work)
- sudo/root access
- domain name (optional at first, recommended for production)

You will also need:
- Git
- a clone of this repository on the server

### 2. Clone the repo on the server

```bash
git clone <your-repo-url> lessonflow
cd lessonflow
```

### 3. Prepare the shared environment file (`.env`)

Both `deploy.sh` and `update.sh` now manage a shared env file at:

- `/var/www/melbourne-guitar-school/shared/.env`

Behavior:
- If the shared `.env` file does not exist, the scripts copy `.env.example` into place.
- In interactive runs, the scripts can open the shared `.env` in a terminal editor.
- `update.sh` and `deploy.sh` both include an explicit TUI action to edit the shared `.env` on demand.
- `deploy.sh` also includes direct TUI bootstrap actions for MySQL+DB (`M`), Nginx (`N`), PHP-FPM-if-needed (`P`), app service (`U`), and cron jobs (`J`).

You must edit the shared `.env` with real values before production use (especially DB, secrets, email, invoice settings).

### 4. Optional server bootstrap helpers (recommended)

Use `update.sh` (wrapper) for most server bootstrap tasks and `deploy.sh` (direct deploy) for MySQL+DB bootstrap from the shared `.env`.

`update.sh` is usually the best day-to-day entry point because it handles `git fetch/pull` before invoking `deploy.sh`, while `deploy.sh` remains the place for MySQL+DB bootstrap from the shared `.env`.

Recommended order on a fresh VPS/Droplet:
1. Edit shared `.env` (`./deploy/update.sh --interactive` or `./deploy/deploy.sh --interactive`)
2. Install cron/crond scheduler (if missing)
3. Install Nginx (if missing)
4. Install local MySQL/MariaDB and create the app database from `DATABASE_URL`
5. Run first deploy (`deploy.sh`)
6. Install/update app systemd service (optional before first deploy, required before starting the app as a service)
7. Install/update managed cron jobs (after the first successful deploy)
8. Configure SSL once DNS is pointing at the server

#### Install cron/crond scheduler (if needed)

```bash
# Wrapper workflow (recommended when using update.sh)
./deploy/update.sh --install-cron --skip-pull --skip-deploy --sudo-deploy

# Direct deploy script (same helper available)
./deploy/deploy.sh --install-cron
```

Notes:
- Installs `cron` or `cronie` depending on the Linux distribution
- Enables + starts `cron` / `crond` (best effort)

#### Install Nginx (if needed)

```bash
# Wrapper workflow (recommended when using update.sh)
./deploy/update.sh --install-nginx --skip-pull --skip-deploy --sudo-deploy

# Direct deploy script (same helper available)
./deploy/deploy.sh --install-nginx
```

#### Install local MySQL/MariaDB and create DB from `DATABASE_URL` in shared `.env`

```bash
# Direct deploy script (MySQL+DB bootstrap lives here)
./deploy/deploy.sh --setup-mysql-db-from-env
```

Notes:
- Reads `DATABASE_URL` from `/var/www/melbourne-guitar-school/shared/.env`
- Only supports local DB hosts (`localhost` / `127.0.0.1`) for this helper
- Creates the database only if it does not already exist
- Does not create DB users/permissions (you must ensure the DB user exists and has access)

#### Install PHP-FPM only if needed by Nginx config (usually skipped for this Next.js app)

```bash
# Wrapper workflow (recommended when using update.sh)
./deploy/update.sh --install-php-fpm-if-needed --skip-pull --skip-deploy --sudo-deploy

# Direct deploy script (same helper available)
./deploy/deploy.sh --install-php-fpm-if-needed
```

For this project’s Next.js deployment, PHP-FPM is typically not required. The helper auto-detects whether the deploy Nginx config appears to need PHP/FastCGI and skips when it is not needed.

#### Install/update app systemd service (if needed)

```bash
# Wrapper workflow (recommended when using update.sh)
./deploy/update.sh --install-app-service --skip-pull --skip-deploy --sudo-deploy

# Direct deploy script (same helper available)
./deploy/deploy.sh --install-app-service
```

Notes:
- Installs/updates `/etc/systemd/system/melbourne-guitar-school.service`
- Runs `systemctl daemon-reload`
- Enables the service and attempts to start it if `/var/www/melbourne-guitar-school/current` exists

#### Install/update managed cron jobs (if needed)

```bash
# Wrapper workflow (recommended when using update.sh)
./deploy/update.sh --install-cron-jobs --skip-pull --skip-deploy --sudo-deploy

# Direct deploy script (same helper available)
./deploy/deploy.sh --install-cron-jobs
```

Notes:
- Installs/updates the managed root crontab block used by LessonFlow scheduled jobs
- Restarts `cron` / `crond` (best effort)
- Can be run before the first deploy, but jobs will only execute successfully once `current/deploy/cron.sh` exists

### 5. First deploy on a VPS / VM / Droplet

Interactive (recommended):

```bash
./deploy/deploy.sh --interactive
```

Or direct deploy:

```bash
./deploy/deploy.sh
```

What the deploy script handles:
- creates a release directory under `/var/www/melbourne-guitar-school/releases`
- links shared resources (`.env`, `.data`)
- installs dependencies (unless skipped)
- generates Prisma client
- runs migrations (unless skipped / overridden)
- builds the Next.js app
- updates the `current` symlink atomically
- restarts services and syncs managed cron jobs (unless skipped)

Interactive `deploy.sh` notes:
- Option `10` opens the shared production `.env` editor (and bootstraps the file from `.env.example` if missing).
- Options `11-13` are bootstrap workflow toggles that run during `Start deploy`:
  - `11` MySQL + create DB
  - `12` Install cron/crond
  - `13` Install Nginx
- `M` runs the MySQL+DB bootstrap helper immediately.
- `N` runs the Nginx install helper immediately.
- `P` runs the PHP-FPM-if-needed helper immediately.
- `J` installs/updates managed cron jobs immediately.
- `U` installs/updates the app systemd service immediately.

### 6. Ongoing updates (recommended workflow)

```bash
./deploy/update.sh --interactive
```

Or non-interactive:

```bash
./deploy/update.sh --sudo-deploy
```

`update.sh`:
- fetches/pulls latest git changes (ff-only)
- provides immediate helper actions (Nginx/PHP-FPM/systemd service/cron jobs)
- passes selected bootstrap workflow toggles through to `deploy.sh` during deploy runs (to avoid duplicate setup routines)
- delegates the actual release deploy to `deploy.sh`

Interactive `update.sh` notes:
- Shows a cached remote update check alert (when the selected remote branch has a newer commit than local).
- Option `10` opens the shared `.env` editor.
- Options `11-15` are bootstrap workflow toggles (cron, app service, cron jobs, Nginx, PHP-FPM) that run during `Start update/deploy` when enabled.
- `J` installs/updates managed cron jobs immediately.
- `N` runs the Nginx install helper immediately.
- `P` runs the PHP-FPM-if-needed helper immediately.
- `U` installs/updates the app systemd service immediately.

Common non-interactive examples:

```bash
# Routine update + deploy with sudo auto-escalation forced on
./deploy/update.sh --sudo-deploy

# Deploy without pulling (for a known local checkout state)
./deploy/update.sh --skip-pull --sudo-deploy

# Pull only (no deploy)
./deploy/update.sh --skip-deploy

# Bootstrap cron scheduler + app service + managed cron jobs (no git pull/deploy)
./deploy/update.sh --install-cron --install-app-service --install-cron-jobs --skip-pull --skip-deploy --sudo-deploy
```

### 7. SSL (optional)

You can pass SSL setup options through `update.sh`/`deploy.sh` when you’re ready:

```bash
./deploy/update.sh --ssl --domain example.com --email you@example.com --sudo-deploy
```

## Local Development Setup

### Requirements

- Node.js 20+
- npm
- MySQL 8+ (local or Docker)

### Quick start

1. Install dependencies

```bash
npm install
```

2. Copy env template

```bash
cp .env.example .env
```

3. Start local MySQL (Docker example)

```bash
docker run --name lessonflow-dev-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=mgs_dev \
  -p 3306:3306 \
  -d mysql:8
```

4. Ensure `DATABASE_URL` in `.env` points to MySQL (example)

```bash
DATABASE_URL="mysql://root:root@127.0.0.1:3306/mgs_dev"
```

5. Run migrations

```bash
npx prisma migrate deploy
```

6. Start the app

```bash
npm run dev
```

7. Open setup wizard and create the first admin account

- `http://127.0.0.1:3000/setup`

## Testing

Tests require a MySQL database (Prisma provider is MySQL).

Recommended local test DB (Docker):

```bash
docker run --name lessonflow-test-mysql \
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

## Common Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run prisma:studio
```

## Environment Variables (Important Groups)

Use `.env.example` as the starting template.

Key groups:
- Database: `DATABASE_URL` (MySQL)
- Sessions/security: `ADMIN_SESSION_SECRET`, `STUDENT_SESSION_SECRET`, `CRON_SECRET`
- Student portal: password encryption key + session settings
- Email delivery: SMTP and/or Gmail OAuth settings
- Invoice defaults: business/bank/GST configuration
- Learning materials storage: local or S3 settings

## Scheduled Jobs / Automation

Protected job endpoints use:
- header `x-cron-secret: <CRON_SECRET>`

`deploy/cron.sh` reads `NEXT_PUBLIC_SITE_URL` and `CRON_SECRET` from the shared deploy `.env` file (`/var/www/melbourne-guitar-school/shared/.env`) so cron jobs use the same URL/secret as the running app.

Examples include:
- daily bookings digest
- invoice reminders
- admin operations reports (daily/weekly/monthly/yearly)

See:
- `vercel.json`
- `Documentation/digitalocean-admin-operations.md`

## Branding Note

This repository still contains historical/internal names related to the original Melbourne Guitar School deployment (for example package/repo paths and deploy directories such as `/var/www/melbourne-guitar-school`).

The product branding presented in this README is **LessonFlow**.

## License

LessonFlow is released under the **MIT License**.
See `LICENSE`.
