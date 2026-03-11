# LessonFlow (Melbourne Guitar School) - Project Context

LessonFlow is a comprehensive management platform tailored for music schools and individual teachers to automate administrative workflows including bookings, invoicing, reporting, and student resources.

## Project Overview

*   **Product Name:** LessonFlow (internally often referenced as Melbourne Guitar School).
*   **Target Audience:** Solo music teachers and small to medium-sized music schools.
*   **Core Pillars:**
    *   **Scheduling:** Public booking requests, admin calendar management, and recurring lesson series.
    *   **Invoicing:** Full financial lifecycle from draft to payment, including PDF generation and automated reminders.
    *   **Student Portal:** Authenticated access for students to view their schedule and learning materials (audio/PDF).
    *   **Reporting:** Operational and revenue dashboards for school owners.

## Technical Stack

*   **Framework:** Next.js 15 (App Router)
*   **Language:** TypeScript
*   **ORM:** Prisma
*   **Database:** MySQL
*   **Styling:** Standard CSS in `src/styles/` plus CSS Modules for feature-local UI, with Radix UI for complex primitives.
*   **Animation:** GSAP (`gsap`) for UI transitions and motion.
*   **Testing:** Vitest (unit/integration) and Playwright (E2E/Screenshots).
*   **Utilities:** `pdf-lib` (PDF generation), `nodemailer` (email), `zod` (validation).

## Project Structure

*   `src/app/`: Next.js App Router routes and API handlers.
    *   `/admin/`: Admin console routes.
    *   `/student/`: Student portal routes.
    *   `/api/`: Backend API endpoints.
*   `src/components/`: React components.
    *   `motion/`: GSAP-powered animation components.
*   `src/lib/`: Domain logic, services (DB access), and shared utilities.
*   `prisma/`: Database schema (`schema.prisma`) and migration history.
*   `deploy/`: Custom deployment engine for VPS/DigitalOcean Droplets, featuring interactive TUI scripts.
*   `Documentation/`: Comprehensive end-user and technical operator manuals.
*   `tests/`: Test suites.
    *   `e2e/`: Playwright E2E tests.
    *   Root `tests/`: Vitest integration tests.

## Development & Build Commands

### Setup
*   `npm install`: Install dependencies.
*   `cp .env.example .env`: Initialize environment variables.
*   `npm run test:prepare`: Setup test database (requires MySQL).

### Development
*   `npm run dev`: Start Next.js development server.
*   `npm run prisma:studio`: Open Prisma Studio to explore data.
*   `npm run prisma:generate`: Update Prisma client after schema changes.

### Quality & Testing
*   `npm test`: Run Vitest test suite.
*   `npm run test:e2e`: Run Playwright E2E tests.
*   `npm run lint`: Run ESLint.
*   `npm run typecheck`: Run TypeScript compiler check.

### Production & Deployment
*   `npm run build`: Create production build.
*   `bash deploy/deploy.sh --interactive`: Interactive deployment/update on server.

## Key Architectures & Conventions

*   **Surgical Updates:** When modifying domain logic, prioritize `src/lib` services.
*   **Audit Trails:** Most entities (Bookings, Invoices, Credentials) have append-only audit log tables in Prisma.
*   **Financial Integrity:** Invoices denormalize customer data at the time of creation to ensure historical accuracy even if customer profiles change.
*   **Branding:** Branding strings are centralized in `src/lib/branding.ts`.
*   **Styling:** Prefer standard CSS or CSS Modules over inline styles or utility-first frameworks.
*   **Deployment:** The project uses a "releases" based symlink deployment strategy on Linux servers, managed by scripts in `deploy/`.
*   **Documentation in Code:** Always comment code extensively when modifying or adding. Provide clear explanations for complex logic, domain-specific decisions, and technical trade-offs to ensure maintainability.

## Gemini CLI Preferences

*   **Commit Strategy:** When using the Conductor extension, avoid making individual commits for every task or phase. Instead, perform all implementation work and then make **one single, long, and detailed multiline commit** at the end of the track (when it is complete) that explains the "why" and "what" of all changes.

## Operational Notes

*   **Scheduled Jobs:** The system relies on cron jobs (calling `/api/jobs/*`) for reminders and digests, protected by `CRON_SECRET`.
*   **Email Fallback:** If SMTP fails, the system logs emails to `OutboundEmail` with a `queued_no_smtp` status for manual admin follow-up.
*   **Setup Wizard:** Initial application state and admin account creation is handled via `/setup`.
