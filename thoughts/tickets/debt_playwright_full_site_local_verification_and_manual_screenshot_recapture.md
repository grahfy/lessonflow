---
type: debt
priority: high
created: 2026-03-04
status: implemented
tags: [qa, e2e, playwright, verification, manual, screenshots, admin, student, public]
keywords: [test-full-site-local.sh, full site local verification, playwright regression sweep, recapture manual screenshots, admin login admin@example.com admin123, student portal login via generated password]
patterns: [scripts/test-full-site-local.sh, tests/e2e/**, scripts/sync-manual-screenshots.cjs, tests/e2e/docs-screenshots.spec.ts, src/app/admin/manual/**, src/lib/manual/content.ts, public/documentation/screenshots/**, Documentation/assets/**]
---

# DEBT: Full-Site Playwright Local Verification and Manual Screenshot Recapture

## Description

After implementing the UI/UX epic changes, run a full local Playwright verification sweep using `scripts/test-full-site-local.sh` and recapture/sync admin manual screenshots.

## Context

The epic touches public, student, and admin surfaces broadly. A comprehensive end-to-end pass is required to catch visual/interaction regressions and keep manual screenshots aligned with the updated UI.

## Requirements

### Functional Requirements
- Execute `scripts/test-full-site-local.sh` locally after epic implementation changes are complete.
- Ensure E2E verification includes:
  - public routes
  - student portal flows
  - admin routes/dialog workflows impacted by the epic.
- Recapture admin manual screenshots with Playwright and sync assets into manual rendering paths.
- Update manual screenshot references only if filenames/coverage change.

### Test Data & Access Requirements
- Admin login credentials for local verification:
  - email: `admin@example.com`
  - password: `admin123`
- Student portal verification setup:
  - create a new customer in admin
  - generate portal password
  - use that generated credential to validate student login/portal flow.

### Non-Functional Requirements
- Keep verification reproducible for future runs.
- Do not commit sensitive runtime secrets outside approved local test configuration.
- Document any failed steps with route/action context and follow-up tickets.

## Current State

Automation assets exist (`scripts/test-full-site-local.sh`, docs screenshot tooling), but this final verification pass is not yet tracked as a dedicated closure gate for the new epic.

## Desired State

A repeatable verification and screenshot-refresh step that proves the full site remains stable after the redesign and keeps the manual visually current.

## Research Context

### Keywords to Search
- `test-full-site-local.sh` - inspect startup assumptions and required env.
- `docs-screenshots.spec.ts` - understand screenshot capture coverage.
- `sync-manual-screenshots.cjs` - confirm asset sync destination and naming.
- portal credential generation flow in customers admin - verify test setup steps.

### Patterns to Investigate
- `scripts/test-full-site-local.sh`
- `tests/e2e/**`
- `tests/e2e/docs-screenshots.spec.ts`
- `scripts/sync-manual-screenshots.cjs`
- `src/components/admin/customers/customer-profile-dialog.tsx`
- `public/documentation/screenshots/**`

### Key Decisions Made
- This ticket is a post-implementation validation gate for the epic, not a feature change itself.
- Student portal validation requires generated credentials from a newly created customer to reflect real workflow behavior.
- Manual screenshot recapture is required so documentation stays truthful after UI updates.

## Success Criteria

### Automated Verification
- [x] `scripts/test-full-site-local.sh`
- [x] `npm run typecheck`
- [x] `npm run lint` (or document known pre-existing lint debt)
- [x] `npm run docs:screenshots`
- [x] `npm run docs:screenshots:sync`

### Manual Verification
- [x] Admin login works using `admin@example.com` / `admin123`.
- [x] Student portal login validated using newly created customer + generated password.
- [x] Public route smoke flow passes for updated typography/layout/dialog behavior.
- [x] Admin dialog/report/manual flows pass key regression checks from epic tickets.
- [x] Updated screenshots appear correctly in `/admin/manual` sections.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
- Related manual ticket: `thoughts/tickets/feature_admin_manual_rewrite_as_arts_teaching_operations_guide.md`

## Notes

- If script or Playwright environment assumptions are outdated, capture remediation steps in this ticket before implementation closeout.
- 2026-03-04 execution attempt of `scripts/test-full-site-local.sh --seed --no-start --skip-install` failed immediately because Docker runtime was not running on host.
- 2026-03-04 successful verification execution:
  - `bash ./scripts/test-full-site-local.sh --seed --skip-install` (runs tests and starts local dev server)
  - Created a new customer via admin API, revealed generated portal password, and used those credentials for student portal screenshot capture.
  - `npm run test:e2e`
  - `npm run docs:screenshots`
  - `npm run docs:screenshots:sync`
  - `npm run typecheck`
  - `npm run lint`
