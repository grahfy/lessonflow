# Changelog

All notable product releases for LessonFlow are documented in this file.

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
