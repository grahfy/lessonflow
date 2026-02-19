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
- Manual booking popup launched from `Add Manual Booking`.
- Customer directory popup launched from `Customers`.
- Customer create/edit/delete (delete archives linked profiles to preserve history).
- Existing customer selection in manual booking popup (auto-fill supported).
- Deterministic duplicate detection (email/phone) during manual booking entry with confirmation workflow.
- Optional customer-profile update from manual booking confirmation flow.
- Booking edit/move/cancel.
- Pending request edit/move/reject (cancel maps to reject).
- Recurring series cancellation for future instances.
- Manual reminder and custom customer emails from dialog.
- Automatic customer update email when confirmed bookings are moved.

## Motion Verification Checklist
After `npm run dev`, validate the global tween choreography in both normal and reduced-motion modes.

1. Public route sequencing:
   - Navigate between `/`, `/lessons`, `/teacher`, `/vouchers`, `/contact`, `/book`, `/terms`.
   - Confirm outgoing page elements tween out quickly before route swap.
   - Confirm incoming page elements tween in sequentially.
2. Admin route sequencing:
   - Sign in at `/admin/login` and load `/admin/bookings`.
   - Confirm admin cards enter in sequence, calendar events animate in capped batches, and dense month views remain responsive.
3. Dialog lifecycle:
   - Open a booking dialog from the calendar and then open/close the nested email dialog.
   - Confirm both dialog layers tween in/out and only unmount after exit completes (no abrupt teardown).
4. Reduced-motion fallback:
   - Enable OS/browser reduced motion and repeat the checks above.
   - Confirm transitions become immediate without interaction regressions.

## Daily Digest Job
Endpoint: `POST /api/jobs/daily-bookings-digest`  
Required header: `x-cron-secret: <CRON_SECRET>`

`vercel.json` includes daily cron scheduling.

## Notes
- This repository now runs only the Next.js App Router implementation.
- Current-year booking constraints are enforced by server-side validation.
