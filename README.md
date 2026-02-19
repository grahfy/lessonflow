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
- Pending request approval and rejection.
- Day/week/month booking views.
- Manual booking create.
- Booking move/cancel.
- Recurring series cancellation for future instances.

## Daily Digest Job
Endpoint: `POST /api/jobs/daily-bookings-digest`  
Required header: `x-cron-secret: <CRON_SECRET>`

`vercel.json` includes daily cron scheduling.

## Notes
- Legacy static HTML files remain in repository root for reference during migration.
- Current-year booking constraints are enforced by server-side validation.
