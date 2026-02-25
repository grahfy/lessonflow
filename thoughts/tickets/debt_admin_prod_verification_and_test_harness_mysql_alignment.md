---
type: debt
priority: high
created: 2026-02-25
status: implemented
tags: [admin, production, verification, testing, mysql, digitalocean]
keywords: [mysql test prepare prisma migrate deploy staging droplet smoke verification admin]
patterns: [package.json test:prepare, prisma/schema.prisma, DATABASE_URL, npx prisma migrate deploy, /api/admin/**, /api/jobs/**]
---

# DEBT-002: Admin Production Verification And MySQL Test Harness Alignment

## Description

Complete the remaining production-readiness verification work that could not be finished in DEBT-001: align the automated test preparation path with the MySQL Prisma provider, then run a production-like smoke pass on a DigitalOcean Droplet or staging-equivalent environment.

## Why This Exists

DEBT-001 implemented the core P0/P1 hardening changes and passed local `typecheck`/`lint`/`build`, but final closure is blocked by environment-dependent verification:
- `npm test` fails because `npm run test:prepare` still forces `DATABASE_URL=\"file:./test.db\"` while Prisma uses `provider = \"mysql\"`.
- `npx prisma migrate deploy` and droplet-backed manual smoke tests require a real MySQL database + proxy/runtime environment that is not available in the local workspace.

## Scope

### In Scope
- Update test prep/test environment configuration so automated tests can run against the supported MySQL provider (or document/implement an intentional alternative test schema path).
- Re-run `npm test` successfully after alignment.
- Run `npx prisma migrate deploy` against a disposable/staging MySQL database and record outcome.
- Execute a droplet/staging smoke checklist for admin login, bookings, invoices, logout, setup API gating, cron job endpoints with `x-cron-secret`, and local learning-material storage.
- Document findings and any residual issues.

### Out of Scope
- New feature work unrelated to admin production readiness.
- Broad infra automation/IaC beyond what is needed to perform the verification pass.

## Starting Points

- Parent ticket: `thoughts/tickets/debt_admin_production_readiness_audit.md`
- Implementation plan/results: `thoughts/plans/admin-production-readiness-digitalocean-droplet-hardening-implementation-plan.md`
- Prisma provider: `prisma/schema.prisma`
- Test script mismatch: `package.json`
- Droplet runbook: `Documentation/digitalocean-admin-operations.md`

## Success Criteria

### Automated Verification
- [x] `npm test` passes (using Docker MySQL with `TEST_DATABASE_URL`)
- [x] `npx prisma migrate deploy` succeeds against a staging/disposable MySQL DB (validated against disposable Docker MySQL DB)
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build` (validated with `DATABASE_URL` pointed at disposable MySQL DB)

### Manual Verification
- [ ] `/admin/login`, `/admin/bookings`, `/admin/invoices`, and logout work on a proxy-backed environment
- [ ] Setup APIs are blocked after setup completion as intended
- [ ] Cron-protected job endpoints execute successfully with `x-cron-secret`
- [ ] Learning-material upload/download/delete works with configured persistent local storage
- [x] Findings and any further follow-up tickets are documented

## Execution Results (2026-02-25)

### Implemented
- Replaced SQLite-specific test bootstrap with MySQL-aware test preparation via `scripts/prepare-test-db.cjs`.
- Added Docker-friendly `TEST_DATABASE_URL` workflow and clear setup guidance in `README.md`.
- Added test runner wrapper (`scripts/run-vitest-with-test-db.cjs`) so Vitest uses the MySQL test DB URL instead of the app's default `.env` DB URL.
- Added baseline Prisma migration `prisma/migrations/20260222_initial_schema/migration.sql` so fresh MySQL databases can apply migrations before `20260223_fix_outbound_email_columns`.
- Added a test-only bootstrap fallback to `prisma db push --skip-generate` when `prisma migrate deploy` cannot initialize an ephemeral test DB.
- Updated `tests/api-contact.test.ts` to match current route contract: contact submissions persist and return `503` when email delivery is queued/unavailable.

### Verified (Disposable Docker MySQL)
- `TEST_DATABASE_URL='mysql://root:root@127.0.0.1:3307/mgs_test' npm test` -> `27/27` test files passed, `77/77` tests passed.
- `DATABASE_URL='mysql://root:root@127.0.0.1:3307/mgs_test' npx prisma migrate deploy` -> no pending migrations.
- `npm run typecheck` -> passed.
- `npm run lint` -> passed with existing unrelated warning (`src/components/student-portal-client.tsx:211`, `<img>`).
- `DATABASE_URL='mysql://root:root@127.0.0.1:3307/mgs_test' npm run build` -> passed.

## Deviations / Remaining Work

- **Manual droplet/staging smoke verification not executed in this workspace**
  - Proxy-backed admin login/bookings/invoices/logout, setup API gating, cron endpoints with `x-cron-secret`, and local learning-material storage require a real droplet/staging runtime and were not runnable locally in this execution pass.
  - Follow-up ticket created: `thoughts/tickets/debt_admin_droplet_manual_smoke_verification.md`.

- **Build verification required explicit MySQL `DATABASE_URL` override**
  - After aligning tests to MySQL and regenerating Prisma Client, this workspace's local `.env` (SQLite URL) is incompatible with the MySQL Prisma schema during `next build` prerendering.
  - Production-targeted verification was executed successfully by setting `DATABASE_URL` to the disposable MySQL DB.

- **Migration-history operational note**
  - Adding `20260222_initial_schema` before the existing `20260223_fix_outbound_email_columns` migration may require `prisma migrate resolve --applied 20260222_initial_schema` on any already-initialized database that has only the later migration recorded.
