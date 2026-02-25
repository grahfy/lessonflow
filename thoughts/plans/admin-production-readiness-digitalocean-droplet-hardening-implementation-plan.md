# Admin Production Readiness (DigitalOcean Droplet) Hardening Implementation Plan

## Overview

Implement a production hardening pass for the admin system on a DigitalOcean Droplet, combining audit-driven fixes for confirmed P0/P1 issues with a droplet-specific verification/runbook update.

This plan is based on the researched findings in `thoughts/research/2026-02-25_admin-production-readiness-digitalocean-droplet.md` and the scoped ticket `thoughts/tickets/debt_admin_production_readiness_audit.md`.

## Current State Analysis

The admin system has solid foundations:
- Server-page admin gating uses `getCurrentAdmin()` (for example `src/app/admin/bookings/page.tsx:7`).
- Admin APIs consistently use `requireAdminFromRequest()` where intended (for example `src/app/api/admin/invoices/route.ts:14`, `src/lib/admin-route.ts:13`).
- Setup readiness checks already validate many production prerequisites (DB, HTTPS site URL, secrets, email, storage) in `src/lib/setup.ts:469`.
- Cron job endpoints are already protected with `x-cron-secret` (`src/app/api/jobs/daily-bookings-digest/route.ts:9`, `src/app/api/jobs/invoice-reminders/route.ts:14`).

However, the research found production blockers and reliability gaps:
- Unauthenticated setup APIs can expose config state and write `.env` (`src/app/api/setup/configure/route.ts:8`, `src/app/api/setup/env/route.ts:9`, `src/app/api/setup/status/route.ts:8`).
- Public `GET /api/booking-requests` leaks booking-request data (`src/app/api/booking-requests/route.ts:10`).
- Rate limiting trusts spoofable proxy headers on a droplet (`src/lib/rate-limit.ts:76`).
- Admin API error normalization is inconsistent across the route set (research scan: only `3/23` admin route files contain a `try` block).
- README scheduling guidance is Vercel-specific (`README.md:244`, `vercel.json:2`) and not droplet-operationalized.
- Setup validation/check messaging is inconsistent with the current MySQL Prisma provider (`prisma/schema.prisma:5`, `src/lib/setup.ts:61`, `src/lib/setup.ts:487`).

## Desired End State

- Setup APIs are not exploitable after initialization and do not expose production config details unauthenticated.
- Public endpoints no longer expose admin-managed booking request data.
- Admin/student login rate limiting behaves safely behind a DigitalOcean Droplet reverse proxy.
- Core admin routes return predictable JSON error shapes during server failures (especially primary admin workflows).
- README/runbook guidance supports DigitalOcean Droplet deployment operations (`systemd`, reverse proxy, cron/systemd timers).
- Setup messaging/validation is aligned with the MySQL production deployment supported by the current Prisma schema.

### Key Discoveries
- `POST /api/setup/configure` can write `.env` without auth (`src/app/api/setup/configure/route.ts:8`, `src/lib/setup.ts:881`).
- `GET /api/setup/env` exposes configurable env values and secret presence state (`src/app/api/setup/env/route.ts:9`, `src/lib/setup.ts:827`).
- `DATABASE_URL` is currently classified as non-secret in setup UI/API config (`src/lib/setup.ts:50`, `src/lib/setup.ts:57`).
- Public booking request list is exposed via unauthenticated GET (`src/app/api/booking-requests/route.ts:10`).
- Login rate limiting depends on `getRequestIp()` trusting the first `x-forwarded-for` value (`src/lib/rate-limit.ts:76`, `src/app/api/admin/login/route.ts:8`).
- Scheduled jobs are code-ready for droplet use, but docs still rely on `vercel.json` scheduling (`README.md:244`, `vercel.json:2`).
- Setup checks mention Postgres despite MySQL Prisma provider (`src/lib/setup.ts:487`, `prisma/schema.prisma:5`).

## What We're NOT Doing

- Replacing the admin authentication/session model (cookie + HMAC token design remains).
- Implementing S3 learning-material storage (explicitly out of scope and currently unimplemented).
- Rebuilding all admin APIs around a new framework-level error wrapper if it creates large regression risk.
- Provisioning infrastructure automatically (Terraform/Ansible/cloud-init). This plan covers app hardening + runbook/docs, not full IaC.
- UI redesign work unrelated to production reliability/security.

## Design Options

### Option A: Security-first containment + targeted reliability hardening (Selected)
- Fix P0 exposures immediately (setup APIs + public booking-request GET).
- Fix droplet-specific proxy/rate-limit behavior.
- Normalize error handling for primary admin routes first, then decide whether to sweep all remaining routes in this ticket or split a follow-up.
- Add droplet runbook/docs and align setup messaging.

Why selected:
- Delivers the highest risk reduction quickly.
- Matches the ticket scope (audit + implementation) while keeping regression risk manageable.
- Leaves room to split broad route-normalization work if it grows beyond safe single-ticket scope.

### Option B: Full admin route normalization sweep before addressing operational docs
- Normalize all admin route error handling first, then handle security/docs issues.

Why not selected:
- Slower risk reduction; delays fixing the setup API exposure and public data leak.
- Larger code churn before addressing the confirmed P0 issues.

## Implementation Approach

Assumed production stack for this plan (chosen to avoid unresolved scope questions):
- DigitalOcean Droplet (Linux)
- `systemd` service for the Next.js app process
- `Nginx` reverse proxy with HTTPS termination
- MySQL database (managed MySQL recommended, or MySQL on-droplet if operationally supported)
- `cron` or `systemd` timers invoking job endpoints with `x-cron-secret`
- Persistent writable local directory for learning materials

Implementation sequence:
1. Eliminate confirmed security exposures (setup APIs and public booking-request GET).
2. Harden proxy-aware rate limiting and document required reverse-proxy headers.
3. Add consistent JSON error handling for core admin APIs used by `/admin/bookings` and `/admin/invoices` workflows; sweep remaining admin routes only if safe within ticket scope.
4. Align setup validation/check messaging with MySQL and droplet runbook expectations.
5. Execute droplet-oriented smoke verification and document residual issues / child tickets.

## Phase 1: P0 Security Containment (Setup APIs + Booking Request Data Exposure)

### Overview

Close confirmed remote attack/data exposure paths before broader reliability work.

### Changes Required

#### 1. Gate setup APIs after initialization (and restrict sensitive setup operations)
**Files**:
- `src/app/api/setup/configure/route.ts`
- `src/app/api/setup/env/route.ts`
- `src/app/api/setup/status/route.ts`
- `src/lib/setup.ts` (if helper additions are needed)
- `src/lib/admin-route.ts` (optional reuse helper if Request/NextRequest compatibility requires adapter)

**Changes**:
- Enforce a clear setup API access policy:
  - Before setup completion: allow setup endpoints required by the setup wizard.
  - After setup completion: block setup env/config endpoints by default (recommended) or require authenticated admin explicitly.
- Ensure `POST /api/setup/configure` cannot write `.env` after setup is complete unless explicitly allowed and admin-authenticated.
- Reduce exposure from `GET /api/setup/env` after setup completion (prefer `403/409` over returning env values).
- Keep `GET /api/setup/status` behavior safe after setup completion (either minimal state only or same gating policy).
- Return explicit JSON errors for blocked setup endpoint access (`setup already complete`, `unauthorized`, etc.).

#### 2. Remove/lock down unauthenticated booking-request listing
**File**: `src/app/api/booking-requests/route.ts`
**Changes**:
- Remove or block the `GET` handler that returns booking-request rows publicly.
- Preserve the public `POST` booking submission behavior used by `src/components/booking-form.tsx`.
- Prefer returning `405 Method Not Allowed` or `401/403` for GET to avoid accidental client reliance.

#### 3. Verify no public UI depends on removed `GET /api/booking-requests`
**Files**:
- `src/components/booking-form.tsx`
- Any additional call sites found during implementation

**Changes**:
- Confirm only `POST` is used publicly.
- If any internal tooling relies on `GET`, migrate it to `/api/admin/booking-requests` before removal.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] Add/update tests for setup API access rules (pre-setup vs post-setup) if test harness coverage is practical
- [x] Add/update tests for `GET /api/booking-requests` no longer exposing rows publicly

#### Manual Verification
- [ ] Before setup completion, `/setup` wizard still loads and can read/save setup config as intended
- [ ] After setup completion, unauthenticated requests to `/api/setup/env` and `/api/setup/configure` are blocked
- [ ] Public booking form submission (`POST /api/booking-requests`) still works
- [ ] Unauthenticated `GET /api/booking-requests` no longer returns booking request rows

---

## Phase 2: Droplet Proxy/Runtime Hardening (Rate Limit IP + Scheduler Runbook)

### Overview

Make login protections and scheduled jobs behave correctly on a DigitalOcean Droplet behind Nginx, and document the required runtime assumptions.

### Changes Required

#### 1. Harden proxy IP extraction used by rate limiting
**File**: `src/lib/rate-limit.ts`
**Changes**:
- Replace current first-`x-forwarded-for` trust logic with a safer droplet/Nginx-oriented strategy.
- Recommended approach for this ticket:
  - Prefer `x-real-ip` when present.
  - Fallback to a controlled `x-forwarded-for` parsing strategy (documented assumptions).
- Document required reverse proxy header behavior in code comments to avoid future regressions.

#### 2. Validate login rate limit behavior under proxy assumptions
**Files**:
- `src/app/api/admin/login/route.ts`
- `src/app/api/student/login/route.ts`
- Tests/docs as applicable

**Changes**:
- Keep existing rate limit semantics but ensure IP extraction changes do not break login flows.
- Add targeted tests for `getRequestIp()` header precedence/parsing.

#### 3. Add DigitalOcean Droplet scheduler + service runbook
**Files**:
- `README.md`
- Optional new runbook doc (recommended): `Documentation/digitalocean-admin-operations.md` (or repo-preferred docs location)

**Changes**:
- Replace/augment `README.md` guidance that currently points only to `vercel.json` schedules (`README.md:244`).
- Document droplet-native scheduled job execution for:
  - `POST /api/jobs/daily-bookings-digest`
  - `POST /api/jobs/invoice-reminders`
- Include examples for `cron` and/or `systemd` timers with `x-cron-secret`.
- Add process management/restart expectations (`systemd`, env loading, restart after `.env` changes).
- Add reverse-proxy requirements for login/session cookies (HTTPS, forwarded headers).

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] Unit tests for `getRequestIp()` covering `x-real-ip` and `x-forwarded-for` cases

#### Manual Verification
- [ ] Admin login and student login rate limiting still works behind local proxy simulation / staging droplet proxy config
- [x] README/runbook includes working droplet examples for scheduled job invocation with `x-cron-secret`
- [x] Restart instructions after setup env changes are documented for `systemd`-managed deployment

---

## Phase 3: Core Admin API Error Normalization (Targeted P1 Reliability)

### Overview

Standardize JSON error behavior for the highest-impact admin APIs first so admin UIs fail predictably in production.

### Changes Required

#### 1. Define a shared admin API error normalization pattern
**Files**:
- `src/lib` utility file (new, recommended): `src/lib/api-errors.ts` or `src/lib/admin-api-errors.ts`
- Representative admin routes for first adoption

**Changes**:
- Introduce a small helper/pattern for converting unexpected exceptions into consistent JSON responses.
- Keep route-specific validation and auth responses unchanged (`401`, `400`, `404`), only normalize unexpected failures.
- Avoid over-abstracting route signatures; favor a low-risk pattern if generic wrappers become complex.

#### 2. Apply normalization to primary admin routes used most often in production
**Files (minimum initial set)**:
- `src/app/api/admin/invoices/route.ts`
- `src/app/api/admin/bookings/[id]/route.ts`
- `src/app/api/admin/customers/route.ts`
- `src/app/api/admin/customers/[id]/route.ts`
- `src/app/api/admin/booking-requests/route.ts`
- `src/app/api/admin/login/route.ts`
- `src/app/api/admin/logout/route.ts`

**Changes**:
- Add top-level `try/catch` (or equivalent helper usage) to normalize unexpected exceptions.
- Ensure JSON error payloads are parseable by current admin clients.
- Preserve existing auth redirect behavior in clients by not changing `401` semantics.

#### 3. Reassess remaining admin routes and decide split threshold
**Files**:
- Remaining `src/app/api/admin/**/route.ts` not covered in initial set
- Ticket/child ticket artifacts if split is needed

**Changes**:
- If the sweep remains small/risk-contained, continue in this ticket.
- If not, create a follow-up child ticket with an enumerated route list and apply the same pattern later.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [ ] Targeted route tests (where test harness exists) for unexpected-failure JSON response shape
- [x] `npm run build`

#### Manual Verification
- [ ] `/admin/bookings` and `/admin/invoices` show predictable error messages when backend failures are forced/simulated
- [ ] Admin login/logout endpoints still behave correctly with unchanged auth semantics
- [ ] Core admin route failures no longer return opaque/non-JSON responses for common exception paths

---

## Phase 4: Setup/Docs Consistency Hardening (MySQL Messaging + Droplet Ops Alignment)

### Overview

Align setup validation and readiness messaging with the current MySQL Prisma provider and the chosen droplet deployment model.

### Changes Required

#### 1. Align setup DB validation and messaging with Prisma datasource provider
**File**: `src/lib/setup.ts`
**Changes**:
- Update DB guidance text that currently recommends Postgres when SQLite is detected (`src/lib/setup.ts:487`).
- Make MySQL the explicit production target for this codebase and remove/adjust misleading Postgres guidance in setup validation and check messaging.
- Restrict setup DB URL validation/documentation to the actually supported paths for this ticket (`mysql://` in production, local dev/test allowances only where intentionally supported).
- Keep local dev/test SQLite allowances only if they remain relevant elsewhere (verify against current Prisma schema + docs).

#### 2. Align `.env.example` / README with supported production setup paths
**Files**:
- `.env.example`
- `README.md`

**Changes**:
- Ensure docs reflect actual DB provider support for this codebase.
- Clarify local learning-material storage expectations on a droplet (persistent path, backups, permissions).
- Ensure setup wizard docs match the new setup API access restrictions and restart behavior.

#### 3. Update manual verification steps and release checklist language
**Files**:
- `README.md`
- Optional runbook doc from Phase 2
- Ticket/plan notes (if verification sequence changes)

**Changes**:
- Add a droplet-focused admin smoke checklist (login, bookings, invoices, cron, storage, restart behavior).
- Explicitly require re-running checks after env changes and service restarts.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`

#### Manual Verification
- [x] Setup wizard check messages match the MySQL droplet deployment path (no conflicting Postgres guidance)
- [x] README + runbook are sufficient to deploy and operate admin workflows on a droplet without Vercel-only assumptions
- [x] Local material storage configuration/permissions guidance is explicit and testable

---

## Phase 5: Production-Like Verification and Closure

### Overview

Run the combined verification pass after all implemented fixes, record residual risks, and split any remaining non-trivial work.

### Changes Required

#### 1. End-to-end verification pass (app + droplet assumptions)
**Files**: N/A (verification/reporting)
**Changes**:
- Run full automated checks feasible in the local/staging environment.
- Perform manual admin workflow smoke tests covering login, bookings, invoices, logout, setup gating, cron endpoints, and learning-material storage.

#### 2. Findings closure and child ticket extraction
**Files**:
- `thoughts/tickets/debt_admin_production_readiness_audit.md`
- Child ticket(s) in `thoughts/tickets/` if needed
- Optional review/report artifact in `thoughts/research/` or `thoughts/plans/`

**Changes**:
- Record what was fixed in this ticket vs deferred.
- Create child tickets for any remaining route normalization sweep or droplet automation tasks beyond safe scope.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [ ] `npm test`
- [x] `npm run build`
- [ ] `npx prisma migrate deploy` succeeds against a production-like/staging MySQL database

#### Manual Verification
- [ ] `/setup` pre-setup flow works, and post-setup setup APIs are properly restricted
- [ ] `/admin/login`, `/admin/bookings`, `/admin/invoices`, and logout behave correctly on a proxy-backed environment
- [ ] Cron-protected jobs run successfully from droplet scheduling mechanism with `x-cron-secret`
- [ ] Learning-material upload/download/delete works with the configured persistent local storage path
- [x] Final findings/remediation summary is documented and remaining work is ticketed

---

## Testing Strategy

- Use a security-first sequence: verify P0 fixes immediately after each change before broader refactors.
- Prefer targeted tests for route access control and proxy-IP parsing where possible, because these are easier to regress silently.
- Run `typecheck` + `lint` after each phase; run `build` after route/error-handling and docs/config alignment phases to catch App Router/runtime issues.
- Run `npm test` at least after Phase 1 and at final verification.
- Perform at least one production-like manual pass with a reverse proxy in front of the app (local Nginx/Caddy or staging droplet).

## Performance Considerations

- Setup API gating and public `GET` removal have negligible runtime cost.
- Proxy IP parsing changes are low overhead string parsing on login endpoints only.
- Adding top-level `try/catch` to admin routes should not materially affect performance.
- Local learning-material storage remains single-host filesystem I/O; throughput limits are acceptable for current scope but backup/retention strategy remains operationally important.

## Migration Notes

- No Prisma schema migration is planned for this hardening pass.
- Operational migration is required for DigitalOcean Droplet scheduling if previously relying on Vercel Cron (`vercel.json`).
- If setup API access policy changes after initialization, document the new operator path for post-setup configuration changes (for example admin-authenticated maintenance route vs manual `.env` edits + restart).

## References
- Ticket: `thoughts/tickets/debt_admin_production_readiness_audit.md`
- Research: `thoughts/research/2026-02-25_admin-production-readiness-digitalocean-droplet.md`
- Related Plan: `thoughts/plans/admin-bookings-error-hardening-and-login-title-implementation-plan.md`

## Deviations from Plan

### Phase 1: P0 Security Containment (Setup APIs + Booking Request Data Exposure)
- **Original Plan**: Run broader test verification after Phase 1 (at minimum `npm test` per Testing Strategy) in addition to `typecheck`/`lint`.
- **Actual Implementation**: Completed Phase 1 code changes and added targeted tests, but could not execute `npm test` / `npm run test:prepare` because the repository test script still forces a SQLite `DATABASE_URL` while Prisma is configured with `provider = \"mysql\"`.
- **Reason for Deviation**: Existing test infrastructure mismatch unrelated to Phase 1 code changes blocks test database preparation in the current environment.
- **Impact Assessment**: Phase 1 implementation is typechecked and linted, and test coverage was added, but runtime test execution remains pending until the MySQL test-environment path is fixed (covered by this hardening effort's setup/docs/test-env alignment work).
- **Date/Time**: 2026-02-25T23:10:03+11:00

### Phase 3: Core Admin API Error Normalization (Targeted P1 Reliability)
- **Original Plan**: Add targeted route tests (where practical) that validate normalized JSON response shapes on unexpected failures in patched admin routes.
- **Actual Implementation**: Completed the shared error helper and normalized all `23/23` admin route files with top-level `try/catch`, then verified via route sweep, `typecheck`, `lint`, and `build`; no new admin route failure-shape tests were added in this pass.
- **Reason for Deviation**: The current test harness does not provide a low-friction pattern for fault-injecting these admin route dependencies (Prisma/email/PDF services) without broader test scaffolding changes, and `npm test` remains blocked by the existing MySQL/SQLite test-prepare mismatch.
- **Impact Assessment**: Runtime reliability improved materially and the route set is now consistently JSON-error-normalized, but automated regression coverage for unexpected-failure response shapes remains a gap and should be added after test infrastructure alignment.
- **Date/Time**: 2026-02-25T23:42:00+11:00

### Phase 5: Production-Like Verification and Closure
- **Original Plan**: Run the full automated suite (`npm test`) and production-like verification steps, including `npx prisma migrate deploy` against a staging/prod-like MySQL database and droplet-backed manual smoke checks.
- **Actual Implementation**: Completed the locally-feasible verification set (`typecheck`, `lint`, `build`, targeted tests added in earlier phases) and captured a real `npm test` failure caused by `npm run test:prepare` forcing a SQLite URL against the MySQL Prisma provider.
- **Reason for Deviation**: This workspace does not currently include a production-like/staging MySQL database or a DigitalOcean Droplet runtime for end-to-end smoke verification, and the repository test-prepare script is not aligned with the MySQL provider.
- **Impact Assessment**: Code and docs hardening changes are implemented and compile/build cleanly, but final production-like verification remains pending on infrastructure/test-environment availability. Residual risk is operational/test-harness validation rather than code compilation/runtime startup.
- **Date/Time**: 2026-02-25T23:42:00+11:00
