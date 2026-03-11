# LessonFlow Release Notes: Version 1.0

Release date: March 12, 2026

This `1.0` release marks the first public release of LessonFlow from the initial project import through current `main`.

Release range: `5d00dae794560461b8951d01d46821937c72c711..f6dc8f4`

## Highlights

- Launches LessonFlow as a self-hosted operations platform for music teachers and studios, covering public enquiries, bookings, customers, invoicing, reporting, student materials, and operational administration in one system.
- Delivers a full admin workflow with booking approvals, manual bookings, customer management, invoice creation and follow-up, reports, settings, system logs, and an in-app operations manual.
- Adds a student portal for login, lesson visibility, booking actions, and access to assigned learning materials.
- Ships production-focused deployment and maintenance tooling for low-power VPS environments using `systemd + nginx + MariaDB`.

## Features

### Admin Operations

- Added a denser admin console with day, week, month, and year booking views plus approval, reschedule, cancel, reminder, and manual-booking workflows.
- Added a searchable customer directory with booking history, invoice history, learning-material support, and portal credential management.
- Added invoice lifecycle tooling with draft/send flows, PDF generation, reminders, payment-state changes, voiding, credit-note support, and reusable invoice product presets.
- Added owner-facing reports, invoice aging visibility, system logs, bug-report support, update visibility, and screenshot-backed operator documentation inside `/admin/manual`.
- Added settings management for branding, public content, invoicing, products, email delivery, and system configuration.

### Student and Public Experience

- Added protected public booking and contact flows with CAPTCHA and validation guardrails.
- Added a student portal for secure login, appointment visibility, request and cancellation actions, and access to PDF, audio, and image learning materials.
- Added portal credential regeneration and stronger student-facing session handling, including automatic logout for admin and student portals.
- Added videos/public content improvements, stronger SEO coverage, and location-aware booking protections.

### Email and Communication

- Added branded email templates and centralized email rendering across customer-facing communications.
- Added provider-aware email delivery with SMTP support, Gmail API support, and fallback handling when one transport fails.
- Added Gmail connection status, manual sync controls, and two-way sent-message history visibility in the admin experience.
- Added reminder automation for invoices and operational email follow-up workflows tied to bookings and customer activity.

### Deployment and Operations

- Added first-run setup flows and environment validation for production readiness.
- Added self-hosted deployment, update, SSL, backup, restore, and maintenance tooling for VPS environments.
- Added deployment history visibility and browser-triggered update progress tracking inside the admin console.
- Added scheduled background jobs for reminders, reports, daily summaries, and Gmail synchronization.

## Fixes and Stability Improvements

- Hardened admin authentication, admin API error handling, and protected-route behavior.
- Restored reliable settings editing, email sending fallbacks, invoice filtering, and booking-related admin actions.
- Fixed customer and learning-material linking issues, student portal naming regressions, and public/admin layout problems across desktop and mobile.
- Improved deploy reliability for SSL reuse, release symlink repair, non-root installs, shared environment handling, and low-memory VPS builds.
- Stabilized invoice PDF rendering, logo handling, manual booking creation, and update-runner behavior.

## Operations and Deployment

- Production runtime is centered on Prisma with a MySQL/MariaDB database.
- Scheduled jobs now use `systemd` timers as the preferred production path for reminders, reports, daily bookings, and Gmail sync.
- Browser-triggered updates run through a dedicated host-side systemd runner instead of prompting for sudo in the browser.
- Admin settings can trigger a controlled service restart so runtime configuration changes take effect.
- Production deployment guidance is Docker-independent and targets self-hosted VPS environments using `systemd + nginx + MySQL/MariaDB`.

## Upgrade Notes

- Apply the Prisma migrations included under `prisma/migrations/` before treating an existing installation as `1.0`.
- Required environment keys for supported production setups include `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, and `CRON_SECRET`.
- `EMAIL_PROVIDER` now controls SMTP-versus-Gmail preference. Gmail mode also requires `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_USER_EMAIL`.
- Existing deployments with pre-migration databases should follow the baseline migration guidance in `deploy/README.md` to avoid Prisma baseline conflicts.
- Existing hosts using older update flows should install the dedicated web-update systemd unit and related sudoers entry before relying on browser-triggered updates.
- Existing hosts moving from older cron-based scheduling should ensure the LessonFlow timers and services are installed and enabled.

## Risk / Notes

- This release note is history-based because the repository has no prior Git release tags.
- Rollback planning matters because deploy/update flows now interact with shared environment files, release symlinks, systemd units, and scheduled jobs.
- Gmail history sync depends on valid OAuth credentials and a working `lessonflow-gmail-sync` timer/service installation.
- Existing installs may require one-time migration handoff or environment cleanup before they behave like a fresh `1.0` install.
