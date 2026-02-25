---
type: debt
priority: medium
created: 2026-02-25
status: created
tags: [admin, production, verification, digitalocean, manual-testing]
keywords: [droplet smoke test nginx systemd cron x-cron-secret admin login invoices bookings]
patterns: [/admin/login, /admin/bookings, /admin/invoices, /api/setup/env, /api/jobs/invoice-reminders, x-cron-secret]
---

# DEBT-003: DigitalOcean Droplet Manual Smoke Verification For Admin Workflows

## Description

Run the remaining manual production-like smoke verification steps for admin workflows on a DigitalOcean Droplet (or staging-equivalent proxy-backed environment) after DEBT-001 and DEBT-002 code/test-harness work.

## Why This Exists

DEBT-002 completed the MySQL test harness alignment and local disposable-MySQL automated verification, but the required proxy/runtime/manual checks need a real droplet/staging environment.

## Scope

### Manual Verification Checklist
- [ ] `/admin/login`, `/admin/bookings`, `/admin/invoices`, and logout work behind Nginx/Caddy with HTTPS termination
- [ ] Setup APIs (`/api/setup/env`, `/api/setup/configure`) are blocked after setup completion
- [ ] Cron-protected job endpoints run successfully via droplet scheduler with `x-cron-secret`
- [ ] Learning-material upload/download/delete works with configured persistent local storage path
- [ ] Restart behavior after env changes is confirmed (`systemd` service)
- [ ] Findings and any new follow-up tickets are documented

## References

- `thoughts/tickets/debt_admin_production_readiness_audit.md`
- `thoughts/tickets/debt_admin_prod_verification_and_test_harness_mysql_alignment.md`
- `Documentation/digitalocean-admin-operations.md`
