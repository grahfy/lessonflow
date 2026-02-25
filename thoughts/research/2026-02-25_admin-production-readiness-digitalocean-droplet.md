---
date: 2026-02-25T22:57:21+11:00
git_commit: 4beafdae9e38bae39b58ee795e2732072fba240e
branch: main
repository: melbourne_guitar_school_website
topic: "Admin production readiness audit and hardening research (DigitalOcean Droplet)"
tags: [research, admin, production, digitalocean, security, operations]
last_updated: 2026-02-25T22:57:21+11:00
---

## Ticket Synopsis

Research for `thoughts/tickets/debt_admin_production_readiness_audit.md`.

Scope confirmed by user:
- Include all admin-adjacent dependencies (email, cron, storage, invoices)
- Audit + implementation ticket (not audit-only)
- Target platform: DigitalOcean Droplet

## Summary

This codebase already has solid production-oriented building blocks for admin workflows (setup readiness checks, cookie-based admin auth, cron-secret protected job endpoints), but the audit found several **high-impact production blockers** and operational gaps for a Droplet deployment.

Top findings:
- `P0` Unauthenticated setup APIs (`/api/setup/env`, `/api/setup/configure`, `/api/setup/status`) remain accessible after setup, including `.env` write capability.
- `P1` Shared rate limiting trusts the first `X-Forwarded-For` value, which is spoofable behind common Nginx reverse proxy configs on a Droplet.
- `P1` Admin API error normalization is inconsistent: only `3/23` admin route files contain a `try` block, so many failures can bubble as framework 500 responses.
- `P1` Docs/scheduling assumptions are still Vercel-centric (`vercel.json`) and need a Droplet cron/systemd-timer runbook.
- `P1/P2` Database provider guidance is inconsistent (`Prisma` schema is `mysql`, but setup checks still tell operators to use managed Postgres).

Adjacent critical issue discovered while tracing shared auth/rate-limit patterns:
- Public `GET /api/booking-requests` returns all booking requests without auth (`src/app/api/booking-requests/route.ts:10`). This is not an `/api/admin/**` route, but it leaks admin-managed booking request data and should be treated as a high-priority security fix.

## Detailed Findings

### 1. P0: Unauthenticated setup APIs can read configuration state and write `.env`

The setup page is hidden after initialization (`src/app/setup/page.tsx:10` redirects to `/admin/login` when setup is complete), but the setup APIs themselves are not protected:
- `POST /api/setup/configure` writes environment configuration via `saveEnvConfig()` with no auth/setup-complete guard (`src/app/api/setup/configure/route.ts:8`).
- `GET /api/setup/env` returns configurable env metadata/current values with no auth guard (`src/app/api/setup/env/route.ts:9`).
- `GET /api/setup/status` exposes readiness checks with no auth guard (`src/app/api/setup/status/route.ts:8`).

Impact on a production Droplet:
- Remote attackers can attempt `.env` mutation if the app process user can write project files (`src/lib/setup.ts:881`, `src/lib/setup.ts:902`, `src/lib/setup.ts:821`).
- Even if some secrets are masked, non-secret config values are exposed and secret presence is revealed (`src/lib/setup.ts:827`, `src/lib/setup.ts:833`).
- `DATABASE_URL` is defined as `isSecret: false`, so the setup env API can expose the full DB connection string (`src/lib/setup.ts:50`, `src/lib/setup.ts:57`; returned by `src/app/api/setup/env/route.ts:22`).

This is the most urgent production hardening issue in scope.

### 2. P1: Login rate limiting is spoofable behind common reverse proxy header behavior

`getRequestIp()` trusts the **first** `X-Forwarded-For` value (`src/lib/rate-limit.ts:76`, `src/lib/rate-limit.ts:79`) and is used for admin login rate limiting (`src/app/api/admin/login/route.ts:8`) and student login rate limiting (`src/app/api/student/login/route.ts:28`).

On a DigitalOcean Droplet with Nginx using a typical `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, a client can pre-seed `X-Forwarded-For` and cause the app to read a spoofed first IP. That weakens brute-force protections and pollutes rate-limit keys.

This is a deployment-sensitive bug because it may appear "fine" locally but degrade login protection in production.

### 3. P1: Setup/docs scheduler guidance is Vercel-specific; Droplet execution path is undefined

The scheduled job endpoints are implemented as normal authenticated HTTP routes protected by `x-cron-secret`:
- Daily digest: `src/app/api/jobs/daily-bookings-digest/route.ts:9`
- Invoice reminders: `src/app/api/jobs/invoice-reminders/route.ts:14`

README documents the endpoints correctly (`README.md:231`, `README.md:235`) but then states schedules are configured in `vercel.json` (`README.md:244`), and `vercel.json` contains the cron schedules (`vercel.json:2`).

For a DigitalOcean Droplet deployment, there is currently no equivalent runbook for:
- cron vs `systemd` timer setup
- curl invocation with `x-cron-secret`
- log capture / retry policy
- service user/env file loading for scheduled invocations

This is an operational gap, not a code bug, but it directly affects admin workflows (owner digests, invoice reminders).

### 4. P1: Admin API error normalization is inconsistent (most routes lack top-level exception handling)

Pattern scan results (route-file heuristic):
- `23` admin route files scanned under `src/app/api/admin/**`
- `3` include a `try` block
- `20` do not include a `try` block

Representative routes with auth + validation but no top-level exception normalization:
- `src/app/api/admin/invoices/route.ts:14` (GET) and `src/app/api/admin/invoices/route.ts:115` (POST)
- `src/app/api/admin/bookings/[id]/route.ts:42` (PATCH) and `src/app/api/admin/bookings/[id]/route.ts:219` (DELETE)

The admin clients usually attempt JSON parsing and fallback messages (for example `src/components/admin-invoices-client.tsx:134`, `src/components/admin-invoices-client.tsx:251`), but unhandled exceptions in routes can still produce framework-generated 500 responses that are less predictable for the UI and harder to diagnose in production.

This is a reliability hardening area rather than a single defect; it should be split into targeted child tickets or tackled by a shared error-handling pattern.

### 5. P1/P2: Database provider guidance is internally inconsistent (MySQL vs Postgres)

The live Prisma datasource provider is `mysql` (`prisma/schema.prisma:5`), and the README production setup explicitly instructs MySQL (`README.md:268`, `README.md:275`, `README.md:297`).

However:
- Setup check messaging tells operators to use managed Postgres when SQLite is detected (`src/lib/setup.ts:487`).
- Setup env validation also allows `postgresql://` URLs (`src/lib/setup.ts:61`) even though the Prisma schema is pinned to MySQL.

This mismatch can mislead operators during first-run setup and lead to failed deployments or confusion during droplet provisioning.

### 6. P2: Local learning-material storage support is viable on Droplet, but runbook gaps remain

The project intentionally defaults to local learning-material storage (`src/lib/student-portal/material-storage.ts:37`) and the S3 driver is explicitly unimplemented (`src/lib/student-portal/material-storage.s3.ts:14`).

This is compatible with a Droplet **if** a persistent writable path is configured. The setup checks do a basic writability probe (`src/lib/setup.ts:447`) and warn in production to ensure persistence/backups (`src/lib/setup.ts:641`, `src/lib/setup.ts:644`).

The runtime local driver writes directly to the filesystem (`src/lib/student-portal/material-storage.local.ts:50`, `src/lib/student-portal/material-storage.local.ts:52`).

Operational implication:
- The ticket should produce droplet runbook steps for ownership/permissions/backups of `.data/learning-materials` (or `LEARNING_MATERIALS_LOCAL_ROOT`) and verify the `systemd` service user can read/write that path.

### 7. Adjacent Critical Finding (outside `/api/admin/**` but admin-impacting): Public booking-requests data exposure

`GET /api/booking-requests` returns all booking request rows with no auth (`src/app/api/booking-requests/route.ts:10`).

This route is also used by the public booking form for `POST` (`src/components/booking-form.tsx:69`), which likely explains why the endpoint exists publicly. However, the unauthenticated `GET` leaks customer PII and request history and should be separated/removed/guarded.

This is not strictly an admin route, but it exposes data the admin system manages and should be treated as a high-priority follow-up (or included in the same hardening pass if capacity allows).

## Code References

- `thoughts/tickets/debt_admin_production_readiness_audit.md:1` - ticket under research
- `src/app/setup/page.tsx:10` - setup page redirects away once setup is complete
- `src/app/api/setup/configure/route.ts:8` - unauthenticated `.env` configuration write endpoint
- `src/app/api/setup/env/route.ts:9` - unauthenticated env metadata/value endpoint
- `src/app/api/setup/status/route.ts:8` - unauthenticated setup readiness endpoint
- `src/lib/setup.ts:50` - configurable env vars include `DATABASE_URL`
- `src/lib/setup.ts:57` - `DATABASE_URL` marked `isSecret: false`
- `src/lib/setup.ts:761` - `.env` write implementation
- `src/lib/setup.ts:881` - `saveEnvConfig()` persists env changes
- `src/lib/setup.ts:461` - `isSetupComplete()` only checks admin count
- `src/lib/setup.ts:487` - setup check message recommends Postgres
- `src/lib/setup.ts:628` - storage-driver readiness check and S3 fail state
- `src/lib/setup.ts:641` - prod local-storage readiness produces warning (not pass)
- `src/lib/rate-limit.ts:76` - proxy IP extraction trusts first `x-forwarded-for`
- `src/app/api/admin/login/route.ts:8` - admin login rate limit uses shared IP extraction
- `src/app/api/student/login/route.ts:28` - student login rate limit uses same IP extraction
- `src/app/api/jobs/daily-bookings-digest/route.ts:9` - cron-secret protected job endpoint
- `src/app/api/jobs/invoice-reminders/route.ts:14` - cron-secret protected invoice reminder endpoint
- `vercel.json:2` - schedules defined only for Vercel cron
- `README.md:244` - docs state schedules are configured in `vercel.json`
- `README.md:268` - production setup docs instruct MySQL
- `prisma/schema.prisma:5` - Prisma datasource provider is `mysql`
- `src/app/api/admin/invoices/route.ts:14` - representative admin route without top-level `try/catch`
- `src/app/api/admin/bookings/[id]/route.ts:42` - representative admin mutation route without top-level `try/catch`
- `src/components/admin-invoices-client.tsx:134` - client-side API error parsing helper (more robust than some routes)
- `src/app/api/booking-requests/route.ts:10` - unauthenticated GET returns booking request rows

## Architecture Insights

- The admin system has a clean split between server-page auth gating (`getCurrentAdmin`) and API auth gating (`requireAdminFromRequest`), which is a good foundation for droplet deployment hardening.
- Setup/readiness tooling is unusually mature for a small app (env validation, storage/email checks, UI-driven config), but its API exposure currently bypasses the UI-level safety assumptions.
- The project mixes platform-agnostic scheduled job route design with platform-specific deployment docs (`vercel.json`). Moving to a Droplet mainly requires operationalization, not redesign of job endpoints.
- Local material storage is a valid intentional choice for a single-host deployment, but it makes filesystem persistence/permissions a first-class production concern.

## Historical Context (from thoughts/)

- `thoughts/tickets/2026-02-19-booking-contact-admin-system.md:1` frames the original admin scheduling system as "production-ready" and explicitly includes scheduled email workflows; this research shows the code has most of the pieces but still needs production hardening and deployment runbook alignment.
- `thoughts/tickets/2026-02-19-admin-visual-calendar-booking-dialog.md:1` expanded admin complexity (calendar-first UI, email actions, schedule edits), increasing the importance of consistent admin API error handling in production.
- `thoughts/tickets/2026-02-20-student-portal-login-learning-materials.md:1` added admin-managed learning-material storage, which makes filesystem persistence/permissions on a Droplet part of admin production readiness.
- `thoughts/plans/admin-invoice-create-customer-selection-booking-linking-implementation-plan.md:1` shows active investment in admin invoice workflows, reinforcing the need to harden invoice-related admin routes and reminder scheduling.

## Related Research

- `thoughts/plans/admin-bookings-error-hardening-and-login-title-implementation-plan.md` - recent targeted fix for admin bookings error messaging/auth redirect robustness
- `thoughts/tickets/debt_admin_production_readiness_audit.md` - source ticket for this research

## Open Questions

1. What exact droplet stack will be used: `systemd + Nginx`, `systemd + Caddy`, or Docker/Compose?
2. Will scheduled jobs run via `cron`, `systemd` timers, or an external scheduler hitting the droplet endpoints?
3. Will production use local MySQL on-droplet or a managed MySQL service, and how will secrets/env files be injected (`.env` file vs systemd `EnvironmentFile=`)?
4. Should setup APIs be disabled entirely after initialization, or re-exposed behind admin auth only (with an explicit "maintenance mode" path)?
5. Do you want the adjacent public `GET /api/booking-requests` data exposure fixed in the same implementation pass as this admin hardening ticket?
