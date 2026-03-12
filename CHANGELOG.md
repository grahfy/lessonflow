# Changelog

All notable product releases for LessonFlow are documented in this file.

## [1.2.0] - 2026-03-12

Third public release of LessonFlow, covering user-facing and operator-facing changes since `v1.1.0`.

Release range: `v1.1.0..v1.2.0`

Detailed release notes: [`Documentation/release-notes-v1.2.0.md`](Documentation/release-notes-v1.2.0.md)

### Highlights

- Adds a dedicated teachers workspace so owners can manage staff accounts, teaching profiles, role boundaries, and assignment defaults from inside the admin console.
- Makes lesson scheduling timezone-safe by interpreting `datetime-local` values in the configured business timezone instead of implicit browser or Linux local time.
- Expands assignment behavior across bookings, booking requests, booking series, and customer defaults, including a safe owner fallback on single-user installs.
- Improves upgrade behavior for older datasets by backfilling legacy unassigned records only when the install is still fully unassigned and eligible for automatic repair.
- Cleans up deploy/update terminal progress rendering so spinner timing labels no longer leave stray characters behind during host updates.

### Added

- `/admin/teachers` with a directory workspace, profile tabs, tooltip coverage, sticky save controls, and teacher photo/password support.
- Teacher-assignment helpers and APIs for bookings, booking requests, booking series, and customer primary-teacher defaults.
- A new app-level timezone contract based on `NEXT_PUBLIC_TIMEZONE`, shared by booking, invoice, and portal datetime flows.
- A deploy-time legacy staff-assignment backfill for eligible installs with fully unassigned historical data.

### Changed

- Owner-only and teacher-scoped admin behavior now follows explicit role rules rather than assuming a single undifferentiated admin account.
- Single-user installs now treat the owner as the valid assignable teacher when no active teacher account exists.
- Operator docs, in-app manual content, and the GitLab handbook now describe the staff-management and timezone-aware scheduling model as part of the core product surface.

### Fixed

- Corrected booking-edit, manual-booking, and customer-assignment surfaces that previously showed `Unassigned` when the owner was the only valid staff account.
- Corrected production upgrade handling so eligible single-owner installs can repair older unassigned booking data safely.
- Cleared deploy/update spinner rows before redraw and final status output so elapsed and ETA suffixes do not leave visual artifacts.

### Upgrade Notes

- Apply the Prisma migrations added since `v1.1.0` before treating an existing installation as `1.2.0`.
- `NEXT_PUBLIC_TIMEZONE` should now be set explicitly to the school’s business timezone, for example `Australia/Melbourne`.
- The app no longer relies on Linux `localtime` as the booking-time source of truth; production hosts should keep the application timezone and host timezone aligned only for operator convenience.
- Single-user installs should verify that the owner now appears as the assignable teacher in bookings and customer assignment flows.
- After deployment, confirm `/admin/teachers`, `/admin/bookings`, and `/admin/about` reflect the expected `1.2.0` state.

### Notes

- The release narrative includes both product and deploy behavior because assignment and timezone correctness depend on code, env configuration, and upgrade handling together.
- Legacy assignment backfill is intentionally gated so it does not rewrite installations that already contain real staff assignment data.

## [1.1.0] - 2026-03-12

Second public release of LessonFlow, covering user-facing and operator-facing changes since `v1.0`.

Release range: `v1.0..v1.1.0`

Detailed release notes: [`Documentation/release-notes-v1.1.0.md`](Documentation/release-notes-v1.1.0.md)

### Highlights

- Adds a dedicated admin About page plus footer release metadata so staff can confirm the live version and commit without leaving the application.
- Expands `deploy/update.sh` and `deploy/deploy.sh` to support archive or copied source trees in addition to persistent git checkouts.
- Improves production release provenance so archive-built hosts still show real deploy metadata instead of falling back to placeholder package information.
- Hardens runtime handling for stale Next-Action POSTs by returning a clear 400 response on unsupported page-route requests.
- Refreshes the operator manual and screenshots so the in-app documentation reads like a reference work rather than a task-only handbook.

### Added

- Admin-facing release metadata surfaces at `/admin/about`, the admin footer, and the protected build-info API.
- Archive-source deploy detection, reduced archive-mode update menus, and deploy-mode reporting that includes source-mode detail.
- Shell tests covering deploy-mode detection and archive-mode update behavior.

### Changed

- Upgraded Prisma, `@prisma/client`, and the MariaDB adapter to `7.5.0`.
- Updated deploy/update documentation so technical owners can follow either the persistent git or extracted archive workflow safely.
- Reframed the in-app manual and repository handbook pages around article-style operator reference material.

### Fixed

- Corrected production release metadata fallback behavior on hosts that deploy from archive snapshots without a `.git` directory.
- Rejected stale or malformed Next-Action POST requests on page routes before they trigger misleading runtime errors.
- Refreshed student portal screenshots and artwork used in operator documentation.

### Upgrade Notes

- No new Prisma migrations were added in this release range.
- No new required environment keys were added in this release range.
- Do not skip dependencies on the first `1.1.0` rollout, because Prisma packages changed in `package.json` and `package-lock.json`.
- Git-backed hosts should continue using `sudo ./deploy/update.sh --branch main` as the normal update path.
- Archive or copied source installs should replace the extracted source tree contents first, then run `./deploy/update.sh` from that source tree so archive mode deploys the on-disk files.
- After deploy, verify `/admin/about` or the admin footer shows the expected release label and commit metadata.

### Notes

- Public notes intentionally exclude internal-only repo/process documentation commits from the same git range.
- Archive mode skips git-only metadata capture during deploy, so source ownership and readability still need to be curated by the operator.

## [1.0] - 2026-03-12

First public release of LessonFlow, covering the repo history from the initial project import through the public-ready `main` branch.

Release range: `5d00dae794560461b8951d01d46821937c72c711..8d65c5b`

Detailed release notes: [`Documentation/release-notes-v1.0.md`](Documentation/release-notes-v1.0.md)

### Highlights

- Launches LessonFlow as a self-hosted operations platform for music teachers and studios, combining public enquiries, bookings, customers, invoicing, reporting, student materials, and operational admin tooling.
- Delivers a full admin workflow with booking approvals, manual bookings, customer management, invoice follow-up, reports, settings, system logs, and an in-app operations manual.
- Adds a student portal for secure login, lesson visibility, booking actions, and access to assigned learning materials.
- Ships production-focused deployment and maintenance tooling for low-power VPS environments using `systemd + nginx + MariaDB`.

### Added

- Admin calendar views and workflows for approvals, reschedules, cancellations, reminders, and manual bookings.
- Customer operations for search, history, learning-material assignment, and portal credential management.
- Invoice lifecycle tooling including PDF generation, reminders, payment-state changes, credit-note support, and reusable invoice presets.
- Owner-facing reports, update visibility, deployment history, system logs, and screenshot-backed manual content.
- Protected public booking and contact flows with CAPTCHA and stronger validation.
- Student portal support for appointments, request/cancellation flows, and PDF, audio, and image learning materials.
- Provider-aware email delivery with SMTP support, Gmail API support, fallback handling, and sent-message sync/history visibility.
- First-run setup, production environment validation, deployment/update scripts, backup/restore tooling, and scheduled background jobs.

### Changed

- Standardized production operations around Prisma with MySQL/MariaDB.
- Moved scheduled production jobs to `systemd` timers as the preferred runtime path.
- Switched browser-triggered updates to a dedicated host-side systemd runner rather than browser-entered sudo.
- Expanded admin settings so branding, content, invoicing, product, email, and system behavior can be managed from the application.
- Cleaned the tracked public branch so GitLab source archives no longer ship internal AI workflow material or private planning notes.
- Added deploy-mode reporting so operators can verify whether a host is on the supported release-directory layout.

### Fixed

- Hardened admin authentication, protected-route behavior, and admin API error handling.
- Restored reliable settings editing, booking-related admin actions, and email delivery fallbacks.
- Fixed customer and learning-material linking issues, student portal naming regressions, and layout issues across desktop and mobile.
- Improved deploy reliability around SSL reuse, release symlink repair, shared environment handling, and low-memory VPS builds.
- Stabilized invoice PDF rendering, logo handling, manual booking creation, and update progress behavior.

### Upgrade Notes

- Apply the Prisma migrations under `prisma/migrations/` before treating an existing installation as `1.0`.
- Required production environment keys include `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, and `CRON_SECRET`.
- `EMAIL_PROVIDER` controls SMTP-versus-Gmail preference. Gmail mode also requires `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_USER_EMAIL`.
- Existing deployments should follow the baseline migration guidance in `deploy/README.md` to avoid Prisma baseline conflicts on pre-existing databases.
- Existing hosts using older web-update flows should install the dedicated web-update systemd unit and sudoers entry before relying on browser-triggered updates.
- Existing hosts should ensure the LessonFlow timers and services are installed and enabled when moving from older cron-based scheduling.
- Operators can run `sudo ./deploy/deploy.sh --print-deploy-mode` to confirm the host is using the expected release-directory deploy layout.

### Notes

- This release entry is history-based because the repository has no prior Git release tags.
- Rollback planning matters because deploy/update flows now interact with shared environment files, release symlinks, systemd units, and scheduled jobs.
- GitLab release archives now reflect the cleaned public branch rather than the earlier pre-cleanup tag state.
