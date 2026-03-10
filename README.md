# LessonFlow

<p align="center">
  <img src="lessonflow_logo.jpg" alt="LessonFlow logo" width="384"/>
</p>

LessonFlow is an MIT-licensed platform for music teachers and studios that unifies scheduling, customer records, invoicing, reporting, and student learning materials.

It is designed for self-hosted operations where a small team needs one system for day-to-day lesson administration.

## Feature Highlights

- **Scheduling:** Public lesson enquiry and booking request flows with admin approval workflows. Day/week/month views.
- **Invoicing:** Full financial lifecycle (`draft`, `sent`, `paid`, `void`), PDF generation, credit notes, and automated reminders.
- **Customer Directory:** Centralized profile management with complete booking and invoice history.
- **Student Portal:** Secure authenticated access for students to view schedules and assigned learning materials (Audio/PDF).
- **Reporting:** Operational and revenue dashboards, including invoice aging and billing visibility.
- **In-app System Updates:** Trigger and monitor application updates directly from the admin console with real-time logging.
- **Anti-bot Protection:** Built-in SVG-based CAPTCHA and honeypot validation for all public-facing forms.
- **Gmail Integration:** Native support for sending and syncing emails via the Gmail API.
- **White-label CMS:** Dynamic control over public page content, branding, and SEO metadata via admin settings.
- **Automatic Geo-detection:** Intelligent request country resolution for localized student and admin context.
- **In-app Manual:** Comprehensive searchable operator manual (`/admin/manual`) synchronized with repository documentation.
- **Gift Vouchers:** Public-facing voucher sales page with digital delivery and GiftUp integration.
- **Video Showcase:** Public media page displaying teacher performance videos and original music.
- **Terms & Conditions:** Dedicated public page for voucher and service terms.
- **System Logs:** Admin-accessible diagnostic logs for troubleshooting (`/admin/system-logs`).
- **CAPTCHA Protection:** SVG-based verification for admin email actions on booking requests.
- **Modernized Scheduling:** Replaced legacy cron with systemd timers for reliable scheduled jobs.
- **Enhanced Admin UX:** Mobile-friendly layouts, table pagination, inline tooltips, and improved dialog designs.

## Documentation Map

Use these docs based on what you are doing:

- Local setup and day-to-day dev workflows: [`LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md)
- VPS deployment runbook: [`deploy/README.md`](deploy/README.md)
- Admin operations handbook index: [`Documentation/README.md`](Documentation/README.md)
- Technical operations for hosted environments: [`Documentation/digitalocean-admin-operations.md`](Documentation/digitalocean-admin-operations.md)

## Quick Start (Local Development)

Requirements: Node.js 20+, Docker + Docker Compose.

```bash
npm ci
cp .env.example .env
docker compose up -d
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

Then open:
- App: `http://localhost:3000`
- First-run setup wizard: `http://localhost:3000/setup`

## Production Installation (VPS)

LessonFlow includes a custom deployment engine for Linux servers (Ubuntu, Debian, RHEL, Arch, etc.).

### 1. Server Preparation
Clone the repository on your server and run the automated package installer:

```bash
git clone https://github.com/your-org/lessonflow-website.git
cd lessonflow-website
sudo ./deploy/setup-packages.sh
```
*This installs Node.js 20, MySQL/MariaDB, Nginx, Certbot, and configures the firewall.*

### 2. Initial Deployment
Run the deployment script to set up the directory structure and build the application:

```bash
sudo ./deploy/deploy.sh --branch main --ssl --domain yourdomain.com --email admin@yourdomain.com
```

### 3. Complete Setup
Visit `https://yourdomain.com/setup` to create your admin account and verify the environment.

For detailed VPS instructions, see [`deploy/README.md`](deploy/README.md).

## Common Commands

```bash
# App lifecycle
npm run dev           # Start development server
npm run build         # Create production build
npm run start         # Start production server
npm run clean         # Remove build artifacts and stale caches

# Quality checks
npm run lint          # Run ESLint
npm run typecheck     # Run TypeScript compiler check

# Tests
npm run test:prepare  # Setup test database
npm run test          # Run Vitest integration tests
npm run test:e2e      # Run Playwright E2E tests

# Docs screenshots
npm run docs:screenshots:update   # Capture and sync screenshots for manual

# Prisma
npm run prisma:generate  # Update Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open database explorer
```

## Important Routes

Public:
- `/` (Home), `/lessons`, `/teacher`, `/vouchers`, `/videos`, `/contact`, `/book` (Booking request), `/terms`

Admin:
- `/admin/login`, `/admin/bookings`, `/admin/customers`, `/admin/invoices`, `/admin/reports`, `/admin/settings`, `/admin/manual`, `/admin/system-logs`, `/admin/updates`

Student:
- `/student/login`, `/student/portal`, `/student/materials`

## Deploy & Maintenance Scripts

Located in [`deploy/`](deploy/), these scripts handle the server lifecycle:

- **`setup-packages.sh`**: One-time server bootstrap. Detects OS and installs all dependencies.
- **`deploy.sh`**: The core release engine. Handles builds, migrations, Nginx sync, and systemd timer setup.
  - `sudo ./deploy/deploy.sh --interactive` (Recommended for first-time or manual deploys)
  - `sudo ./deploy/deploy.sh --rollback` (Instant zero-downtime rollback to previous release)
- **`update.sh`**: Wrapper for `git pull` + `deploy.sh`. Used for routine updates.
  - `sudo ./deploy/update.sh --interactive`
- **`setup-ssl.sh`**: Automates Let's Encrypt certificate acquisition and Nginx SSL config.
- **`maintenance.sh`**: Operational upkeep, cache cleaning, and service restarts.
- **`backup.sh`**: Database and application data backup helper.
- **`cron.sh`**: The entrypoint for scheduled jobs using systemd timers (reminders, digests, reports).

## Whitelabel and Branding

LessonFlow supports deep rebranding and content customization without code changes.

Primary configuration surfaces:
- **Environment Variables:** Global branding and secrets in `.env`.
- **Admin Settings:** Real-time control over colors, logos, and email templates via `/admin/settings`.
- **Public CMS:** Edit marketing copy and metrics for public pages directly in the browser.

## Screenshots

### Admin Dashboard (Bookings Console)
![LessonFlow admin dashboard bookings console](public/documentation/screenshots/booking-calendar-week-view.png)

### Admin Reports Dashboard
![LessonFlow admin reports dashboard](public/documentation/screenshots/admin-reports-dashboard.png)

## License

LessonFlow is released under the **MIT License**. See [`LICENSE`](LICENSE).
