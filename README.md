# Melbourne Guitar School Booking Platform

Next.js full-stack implementation for public marketing pages, contact form submission, booking requests, and owner-managed booking administration.

## Stack
- Next.js (App Router) + TypeScript
- Prisma ORM + SQLite (local dev)
- API routes for booking/contact/admin workflows
- SMTP-backed email delivery with DB logging fallback

## Setup
1. Install dependencies:
```bash
npm install
```
2. Configure environment:
```bash
cp .env.example .env
```
3. Run database migrations:
```bash
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name init_booking
```
4. Start development server:
```bash
npm run dev
```

## Test Environment
Tests run against an isolated SQLite database (`prisma/test.db`) and load env values in this order:
`.env.test.local` -> `.env.test` -> `.env.local` -> `.env`.

1. Create optional local test env overrides:
```bash
cp .env.test.example .env.test.local
```
2. Prepare/reset the test database:
```bash
npm run test:prepare
```
3. Run tests:
```bash
npm test
```

## Full Local Site Check
Run the full local verification flow (install deps, prepare local dev DB, run tests, then start the app):

```bash
npm run local:full-site
```

The site will be available at `http://127.0.0.1:3000` by default.
If tests fail, the script still starts the local site so manual QA can continue.
Optional flags:
- `npm run local:full-site -- --no-start` (run setup + tests only)
- `npm run local:full-site -- --skip-install` (skip `npm ci`)
- `npm run local:full-site -- --skip-tests` (start site without running tests)

## Key Routes
- Public pages: `/`, `/lessons`, `/teacher`, `/vouchers`, `/terms`
- Contact form: `/contact`
- Booking request form: `/book`
- Owner login: `/admin/login`
- Owner dashboard: `/admin/bookings`

## Environment Variables
- `DATABASE_URL`: Prisma connection string (`file:./prisma/dev.db` for local).
- `ADMIN_EMAIL`: owner login email and notification destination.
- `ADMIN_PASSWORD`: owner login password bootstrap.
- `ADMIN_SESSION_SECRET`: signing secret for admin session cookie.
- `CRON_SECRET`: secret required by daily digest job endpoint.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP settings. If unset, emails are logged to `OutboundEmail` with `queued_no_smtp`.

## Admin Operations
Owner dashboard supports:
- Visual day/week/month booking calendar.
- Status colors:
  - confirmed bookings (green)
  - pending requests (yellow)
  - rejected requests (red, visible for 48 hours)
  - cancelled bookings (slate, visible for 48 hours)
- Click-to-open booking dialog with full customer and lesson details.
- Pending request approval and rejection.
- Manual booking create.
- Booking edit/move/cancel.
- Pending request edit/move/reject (cancel maps to reject).
- Recurring series cancellation for future instances.
- Manual reminder and custom customer emails from dialog.
- Automatic customer update email when confirmed bookings are moved.

## Daily Digest Job
Endpoint: `POST /api/jobs/daily-bookings-digest`  
Required header: `x-cron-secret: <CRON_SECRET>`

`vercel.json` includes daily cron scheduling.

## Notes
- Legacy static HTML files remain in repository root for reference during migration.
- Current-year booking constraints are enforced by server-side validation.
