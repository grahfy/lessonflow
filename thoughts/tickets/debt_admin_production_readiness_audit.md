---
type: debt
priority: high
created: 2026-02-25
status: implemented
tags: [admin, production, deployment, operations, hardening, digitalocean]
keywords: [admin production readiness, admin deployment audit, digitalocean droplet, prod smoke test, environment validation, auth cookie, prisma migrations, setup wizard checks, systemd, nginx]
patterns: [requireAdminFromRequest, getCurrentAdmin, evaluateSetupChecks, process.env.NODE_ENV === "production", response.cookies.set, "NextResponse.json({ error })", /api/admin/**, /admin/**, x-cron-secret, vercel.json]
---

# DEBT-001: Admin Production Readiness Audit And Hardening (DigitalOcean Droplet)

## Description

Review the admin codebase and admin-dependent operational paths to ensure the admin system works reliably on a production machine (DigitalOcean Droplet), then implement fixes for discovered P0/P1 blockers and produce prioritized remediation tickets for any remaining non-trivial issues.

This ticket is intentionally scoped as an **audit + implementation + production smoke verification** ticket. It should directly fix contained high-severity blockers while still splitting larger follow-up work into child tickets.

## Context

The admin surface now spans authenticated server pages (`/admin/**`), multiple admin APIs (`/api/admin/**`), setup-time environment checks, invoice/email workflows, scheduled jobs, and learning-material storage. Production reliability depends on both code correctness and deployment/runtime assumptions (database driver, secrets, HTTPS, writable storage, cron secrets, provider limitations, process management, and host-level scheduling).

The target deployment environment is a **DigitalOcean Droplet**, which introduces platform-specific operational concerns (service manager, reverse proxy, TLS termination, cron/systemd timers, filesystem permissions, and restart behavior) that must be validated alongside application code.

Recent work already addressed one admin UX/runtime issue (misleading admin-bookings auth/error messaging and login title wording), but there has not yet been a consolidated production-readiness audit across the broader admin stack.

## Requirements

### Functional Requirements
- Review all admin entry routes and admin API endpoints for production failure modes, auth gating, and error-response behavior.
- Verify admin setup and first-run flows are compatible with production deployment expectations.
- Validate environment variable requirements for admin functionality and identify missing/unsafe defaults for production.
- Identify production blockers vs warnings (P0/P1/P2) with concrete reproduction steps and impacted routes.
- Implement and verify fixes for discovered P0/P1 blockers within this ticket where changes are contained and safe.
- Produce child tickets for each non-trivial remediation item (or a small set of tightly related fixes).
- Execute a production-like smoke checklist for core admin workflows (login, bookings, invoices, logout, setup gating).
- Validate DigitalOcean Droplet deployment assumptions required by admin workflows (service process, reverse proxy, HTTPS, firewall, writable paths, cron execution).
- Update deployment/docs/test-environment notes in the same task if runtime assumptions or verification steps change.

### Non-Functional Requirements
- Keep scope focused on admin production readiness (not feature redesign).
- Use file-level evidence and reproducible findings, not broad assumptions.
- Prefer changes that preserve existing auth/session model unless a blocker proves redesign is required.
- Ensure findings distinguish code issues from deployment/configuration issues.
- Document DigitalOcean Droplet assumptions explicitly (reverse proxy, HTTPS termination, persistent filesystem, scheduled job runner, service manager).
- Make implementation changes in small verifiable steps to reduce production regression risk.

## Current State

- Admin routes are server-gated via `getCurrentAdmin()` and setup gating via `isSetupComplete()` in pages such as `src/app/admin/bookings/page.tsx:7` and `src/app/admin/login/page.tsx:12`.
- Admin login sets an httpOnly session cookie with `secure` enabled only in production (`process.env.NODE_ENV === "production"`) in `src/app/api/admin/login/route.ts:49`.
- Admin session signing requires `ADMIN_SESSION_SECRET`, and legacy bootstrap behavior still references `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `src/lib/admin-auth.ts:29` and `src/lib/admin-auth.ts:92`.
- Setup wizard readiness checks already cover several production concerns (DB URL, connectivity, HTTPS site URL, secrets, email delivery, storage writability) in `src/lib/setup.ts:469`.
- The setup checks explicitly mark S3 learning-material storage as selected-but-not-implemented in this build (`src/lib/setup.ts:629`, `src/lib/student-portal/material-storage.s3.ts:14`).
- README and `.env.example` include production setup guidance and required envs, but these need validation against actual admin runtime behavior (`README.md:177`, `README.md:264`, `.env.example:1`).
- README states scheduled jobs are configured in `vercel.json`, which requires translation to a Droplet-native cron/systemd timer setup for this target environment (`README.md:244`).

## Desired State

- Admin routes and admin APIs function correctly on a production machine using supported configuration.
- Production blockers are identified, with P0/P1 issues fixed in this ticket where feasible and remaining work split into actionable remediation tickets.
- DigitalOcean Droplet deployment assumptions for admin functionality are explicit and verified (DB, HTTPS, secrets, storage, email, cron, service process, filesystem permissions).
- The project has a repeatable admin production smoke-test checklist that can be run before release.
- The project has droplet-specific deployment/runbook notes for admin-critical services and scheduled jobs.

## Research Context

### Keywords to Search
- `requireAdminFromRequest` - trace admin API auth coverage and consistency.
- `getCurrentAdmin` - verify server-page auth gating and cookie usage.
- `evaluateSetupChecks` - confirm production checks match runtime requirements.
- `response.cookies.set` - inspect cookie flags and session behavior in prod.
- `process.env.NODE_ENV === "production"` - find prod-only branches that may change admin behavior.
- `NextResponse.json({ error` - review API error normalization consistency across admin endpoints.
- `LEARNING_MATERIALS_STORAGE_DRIVER` - validate admin learning-material workflows against storage capabilities.
- `x-cron-secret` - verify scheduled jobs relied on by admin workflows are deployable and documented.
- `DigitalOcean Droplet Next.js systemd nginx` - identify host-level runtime requirements and pitfalls.
- `systemd service env file restart node app` - validate production process/env management approach.

### Patterns to Investigate
- `src/app/admin/**/*.tsx` auth/setup redirects - ensure no route leaks or redirect loops.
- `src/app/api/admin/**/route.ts` auth + error handling shape - ensure predictable client behavior under failure.
- Prisma DB operations without top-level `try/catch` in admin APIs - identify unhandled 500 HTML/error responses.
- Runtime dependencies on local filesystem writes - confirm persistent volume requirements are documented and tested.
- Email provider fallback paths (SMTP -> Gmail API -> queued) - confirm admin UX and operational expectations in production.
- Scheduled job deployment path on non-Vercel hosts - translate `vercel.json` schedule assumptions into cron/systemd timer setup on a droplet.
- Service-user file permissions for `.data/` and learning materials root - prevent runtime write failures on droplet.
- Reverse-proxy / forwarded-header / HTTPS cookie behavior - ensure admin login/session works behind Nginx or Caddy.
- Setup wizard `pass/warn/fail` checks vs actual hard runtime requirements - close any gaps.
- README/.env.example vs code reality - detect drift in required envs and production steps.

### Key Decisions Made
- Audit + implementation scope - this ticket audits broadly and directly fixes contained P0/P1 blockers in the same pass.
- Include admin-adjacent dependencies - email, storage, cron, and setup checks are included because admin workflows depend on them in production.
- Target platform is a DigitalOcean Droplet - droplet-specific service/process/proxy/cron validation is in scope.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npx prisma migrate deploy` succeeds in a production-like environment (staging DB / disposable prod-like DB)
- [ ] Re-run relevant checks after each implemented P0/P1 fix set (`npm run typecheck`, `npm run lint`, targeted tests)

### Manual Verification
- [ ] Validate `/setup` production checks match actual runtime requirements (DB, secrets, email, storage, site URL)
- [ ] Create/verify admin account and sign in at `/admin/login` on a production-like host
- [ ] Load `/admin/bookings` and confirm calendar data, auth expiry handling, and error messaging behavior
- [ ] Load `/admin/invoices` and perform at least one read-only + one action workflow in production-like config
- [ ] Verify admin logout and re-login behavior across full-page navigation/reload
- [ ] Verify learning-material upload/download/delete behavior with the selected supported storage driver (`local` + persistent volume)
- [ ] Verify scheduled job endpoints used by admin workflows can be invoked with `x-cron-secret` on the target host
- [ ] Verify DigitalOcean Droplet runtime setup: service manager (prefer `systemd`), reverse proxy (`Nginx` or `Caddy`), HTTPS, firewall, and app restart behavior
- [ ] Verify scheduled job execution on droplet (cron or systemd timer) replaces/augments `vercel.json` schedule assumptions
- [ ] Produce a findings + remediation report with severity, repro steps, fixes applied in this ticket, and child tickets for unresolved issues

## Related Information

- Production env and setup docs: `README.md:177`, `README.md:264`
- Vercel-specific schedule note requiring droplet translation: `README.md:244`
- Example env values / placeholders: `.env.example:1`
- Admin auth/session implementation: `src/lib/admin-auth.ts:20`
- Admin login cookie flags and rate limit: `src/app/api/admin/login/route.ts:7`
- Setup readiness checks: `src/lib/setup.ts:469`
- Known storage limitation (S3 not implemented): `src/lib/student-portal/material-storage.s3.ts:9`
- Admin route gating examples: `src/app/admin/bookings/page.tsx:7`, `src/app/admin/login/page.tsx:12`

## Notes

- Confirmed target platform: DigitalOcean Droplet.
- Assume a Linux droplet with a process manager (`systemd` preferred), reverse proxy (`Nginx` or `Caddy`), HTTPS termination, and persistent storage volume/path for local learning materials.
- If the actual droplet stack differs (Docker Compose, PM2, Traefik, managed DB proxy, etc.), document the deviation and adjust verification steps.
- Include all admin-adjacent dependencies (email/cron/storage/invoice flows) because they affect admin production behavior.
- This ticket should **not** absorb unrelated feature requests or UI redesign work.
- Use child tickets for large remediations (for example, broad admin API error normalization or automated droplet provisioning scripts) if they exceed safe single-ticket scope.
- Remaining verification/test-infrastructure closure has been split into `thoughts/tickets/debt_admin_prod_verification_and_test_harness_mysql_alignment.md`.
