# LessonFlow - VPS Deployment Guide

Complete guide for deploying to a Virtual Private Server.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Automated)](#quick-start-automated)
3. [Manual Server Setup](#manual-server-setup)
4. [Database Setup](#database-setup)
5. [Application Deployment](#application-deployment)
6. [SSL Certificate](#ssl-certificate)
7. [Scheduled Jobs](#scheduled-jobs-systemd-timers)
8. [Monitoring & Logs](#monitoring--logs)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- VPS with 1GB RAM minimum (2GB recommended)
- Root or sudo access
- Domain name pointing to server IP

**Supported Operating Systems:**

| OS Family        | Distributions                                    |
| ---------------- | ------------------------------------------------ |
| Debian/Ubuntu    | Ubuntu 20.04+, Debian 11+, Linux Mint, Pop!_OS   |
| RHEL Family      | RHEL 8+, CentOS Stream, Rocky Linux, AlmaLinux, Fedora |
| openSUSE         | openSUSE Leap 15+, openSUSE Tumbleweed           |
| Arch Linux       | Arch, Manjaro, EndeavourOS                       |

---

## Quick Start (Automated)

The `setup-packages.sh` script automatically detects your OS and installs all dependencies:

```bash
# Clone the repository
git clone https://gitlab.com/grahfmusic/lessonflow.git
cd lessonflow

# Run automated setup (detects OS automatically)
sudo ./deploy/setup-packages.sh
```

This installs:
- Node.js 20.19+ LTS
- MySQL/MariaDB
- Nginx
- Certbot (for SSL)
- Build tools
- Configures firewall

### Options

```bash
# Dry run (see what would be installed)
sudo ./deploy/setup-packages.sh --dry-run

# Skip specific components
sudo ./deploy/setup-packages.sh --skip-node      # Node.js already installed
sudo ./deploy/setup-packages.sh --skip-db        # Using external database
sudo ./deploy/setup-packages.sh --skip-nginx     # Nginx already installed
sudo ./deploy/setup-packages.sh --skip-certbot   # Skip SSL tools

# Non-interactive mode (no prompts)
sudo ./deploy/setup-packages.sh --non-interactive

# Combine options
sudo ./deploy/setup-packages.sh --dry-run --skip-nginx
```

After running the script, continue with [Database Setup](#database-setup).

### Daily Deploy / Update Runbook (Operators)

For day-to-day releases on a configured droplet:

```bash
cd /opt/lessonflow  # or the UPDATES_GIT_REPO_PATH value from /var/www/lessonflow/shared/.env
sudo ./deploy/update.sh --branch main
```

Deploy model:
- `update.sh` pulls the persistent source checkout forward with `git fetch/pull`.
- `deploy.sh` then builds a fresh timestamped release under `/var/www/lessonflow/releases/` and repoints `/var/www/lessonflow/current`.
- Check the current host layout any time with `sudo ./deploy/deploy.sh --print-deploy-mode`.

Archive-source variant:
- If the source tree was installed from a `.tar.gz` or `.zip` instead of `git clone`, replace the extracted files in that source directory first.
- Then run `./deploy/update.sh` from the extracted source tree. The wrapper switches to archive mode, skips git pull actions, and deploys the files already present on disk.
- Archive mode expects the operator to preserve readable ownership/permissions on the extracted source tree before starting the deploy.

Recommended defaults:
- `Dependencies`: ON for normal releases (turn OFF only when you know lockfiles/deps did not change)
- `Cron jobs sync`: ON so the managed cron block stays aligned with supported jobs

Notes:
- `update.sh` / `deploy.sh` now show pulled commit details and pause for a keypress if a `git pull` updates the deploy script itself, then they return to the TUI main menu.
- The one-time migration helper now hands off to `deploy/update.sh` with automatic `git fetch/pull` (no `--skip-pull`) so the latest deploy logic is used.
- Admins can confirm deployed commits in the app using the `Latest Updates` popup after login.
- When the source tree has no `.git` directory, `update.sh` shows a reduced archive-source menu and `deploy.sh --print-deploy-mode` reports `Source mode: archive/copy`.
- Example lesson-plan templates are now auto-seeded after deploy when the library is empty, so the post-deploy prompt is no longer needed.
- `--skip-deps` skips the full app dependency install, but Prisma schema work can still bootstrap `prisma@7.7.0` when the CLI is missing so `prisma generate` / migrations can complete.
- On current 2GB droplets, deploy builds use the low-memory Next.js profile, an auto heap override, and temporary swap when privileged swap access is available.
- Deploys now reuse shared npm and Next.js build caches under `/var/www/lessonflow/shared/cache/` so repeated releases do not start from a fully cold install/build path.
- If a stale temporary swap file cannot be removed, `deploy.sh` retries with a sibling swap filename instead of dropping swap management for that build.
- If `update.sh` reports checkout ownership or archive-source permission problems, fix those first rather than retrying with the same source tree state.
- Shared env upgrades append blank placeholders for new keys instead of inventing defaults; review those placeholders before treating the deploy as complete.

Optional fast-build mode:

```bash
sudo MGS_DEPLOY_FAST_BUILD=1 ./deploy/update.sh --branch main
```

- This forces `NEXT_LOW_MEMORY_BUILD=1` during deploy even on larger hosts.
- Use it only when CI or another pre-deploy check is already enforcing lint and typecheck, because deploy-time build validation is reduced in exchange for faster builds.

### Legacy Runtime Migration (One-Time)

If production still uses legacy runtime naming (`/var/www/melbourne-guitar-school`),
run the one-time migration helper before normal update runs:

```bash
cd ~/melbourne-guitar-school
sudo ./deploy/guitarschool-to-lessonflow.sh --dry-run
sudo ./deploy/guitarschool-to-lessonflow.sh --execute --branch main
```

Detailed migration steps are documented in [`migration.md`](../migration.md).

---

## Manual Server Setup

If you prefer to install packages manually or need more control:

### Ubuntu/Debian

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS (20.19+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Install Nginx
sudo apt install -y nginx

# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Install build tools
sudo apt install -y build-essential python3
```

### RHEL/CentOS/Rocky/Alma/Fedora

```bash
# Update system
sudo dnf upgrade -y  # or 'yum' on older systems

# Install Node.js 20 LTS (20.19+)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install MariaDB (or MySQL on Fedora)
sudo dnf install -y mariadb-server mariadb
sudo systemctl enable --now mariadb
sudo mysql_secure_installation

# Install Nginx
sudo dnf install -y nginx
sudo systemctl enable --now nginx

# Install Certbot
sudo dnf install -y epel-release  # RHEL/CentOS/Rocky/Alma only
sudo dnf install -y certbot python3-certbot-nginx

# Install build tools
sudo dnf group install -y "Development Tools"
```

### openSUSE

```bash
# Update system
sudo zypper refresh
sudo zypper update -y

# Install Node.js 20 LTS (20.19+)
sudo zypper install -y nodejs20 nodejs20-npm
sudo ln -sf /usr/bin/node20 /usr/bin/node
sudo ln -sf /usr/bin/npm20 /usr/bin/npm

# Install MariaDB
sudo zypper install -y mariadb mariadb-tools
sudo systemctl enable --now mysql
sudo mysql_secure_installation

# Install Nginx
sudo zypper install -y nginx
sudo systemctl enable --now nginx

# Install Certbot
sudo zypper install -y certbot python3-certbot-nginx

# Install build tools
sudo zypper install -y -t pattern devel_basis
```

### Arch Linux/Manjaro

```bash
# Update system
sudo pacman -Syu

# Install Node.js
sudo pacman -S --noconfirm nodejs npm

# Install MariaDB
sudo pacman -S --noconfirm mariadb
sudo mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql
sudo systemctl enable --now mariadb
sudo mysql_secure_installation

# Install Nginx
sudo pacman -S --noconfirm nginx
sudo systemctl enable --now nginx

# Install Certbot
sudo pacman -S --noconfirm certbot certbot-nginx

# Install build tools
sudo pacman -S --noconfirm base-devel python
```

---

## Database Setup

### 1. Create Database and User

```bash
sudo mysql
```

```sql
CREATE DATABASE lessonflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mgs_user'@'localhost' IDENTIFIED BY 'your-secure-password';
GRANT ALL PRIVILEGES ON lessonflow.* TO 'mgs_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2. Create Environment File

```bash
sudo nano /var/www/lessonflow/shared/.env
```

```env
# Database
DATABASE_URL="mysql://mgs_user:your-secure-password@localhost:3306/lessonflow"

# Site URL
NEXT_PUBLIC_SITE_URL="https://example.com"

# Session Secrets (generate with: openssl rand -base64 32)
ADMIN_SESSION_SECRET="your-admin-session-secret"
STUDENT_SESSION_SECRET="your-student-session-secret"
STUDENT_SESSION_MAX_AGE_SECONDS="2592000"

# Student Portal
STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY="your-encryption-key"
STUDENT_PORTAL_PASSWORD_LENGTH="14"

# Cron Secret
CRON_SECRET="your-cron-secret"

# Email delivery (configure one or both)
# SMTP (optional)
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your-smtp-user"
SMTP_PASS="your-smtp-password"
SMTP_FROM="LessonFlow <no-reply@example.com>"

# Gmail API OAuth2 (recommended fallback / preferred on hosts blocking SMTP ports)
GMAIL_CLIENT_ID=""
GMAIL_CLIENT_SECRET=""
GMAIL_REFRESH_TOKEN=""
GMAIL_USER_EMAIL="admin@example.com"

# Browser-triggered updates
# These are auto-seeded by deploy/update bootstrap on first install or repair.
UPDATES_GIT_REPO_PATH="/opt/lessonflow"
UPDATES_DEPLOY_USER="grahf"

# Learning Materials Storage
LEARNING_MATERIALS_STORAGE_DRIVER="local"
LEARNING_MATERIALS_LOCAL_ROOT="/var/www/lessonflow/data/learning-materials"
ADMIN_STAFF_PHOTOS_LOCAL_ROOT="/var/www/lessonflow/data/admin-staff-photos"
EMAIL_SIGNATURE_LOGO_LOCAL_ROOT="/var/www/lessonflow/data/email-signature-logo"

# Invoice Configuration
INVOICE_BUSINESS_NAME="LessonFlow"
INVOICE_BUSINESS_ABN="your-abn"
INVOICE_BANK_NAME="Your Bank"
INVOICE_BANK_BSB="xxx-xxx"
INVOICE_BANK_ACCOUNT_NAME="Account Name"
INVOICE_BANK_ACCOUNT_NUMBER="xxxxxxxxxx"
INVOICE_PAYMENT_TERMS_DAYS="14"
INVOICE_GST_REGISTERED="false"
INVOICE_DEFAULT_TAX_MODE="gst_free"
INVOICE_CREDIT_NOTE_PREFIX="MGSCN"
```

The first-install / repair bootstrap now creates `/var/www/lessonflow/shared/.env` from `.env.example`, fills the deploy/update keys above, and restores runtime ownership so `www-data` can keep saving settings.

Runtime config saves from `/admin/settings` and `/api/setup/configure` persist to this shared env file, not to a timestamped release copy.

After any deploy or permission repair, verify:

```bash
sudo -u www-data test -w /var/www/lessonflow/shared/.env
readlink -f /var/www/lessonflow/current/.env
sudo -u www-data test -w /var/www/lessonflow/data/learning-materials
```

The first command should succeed, and the second should resolve to `/var/www/lessonflow/shared/.env`.
The third command should also succeed.

Use an absolute `LEARNING_MATERIALS_LOCAL_ROOT` in production. Relative roots are acceptable for local development, but in standalone deployments they resolve from the runtime app directory and can end up inside the current release tree instead of persistent shared storage.
The admin profile photo and email-signature logo stores follow the same rule and should point at shared absolute paths in production.

---

## Application Deployment

### 1. Initial Deployment

From your local machine or the server:

```bash
# Clone or copy the application
git clone https://gitlab.com/grahfmusic/lessonflow.git
cd lessonflow

# Run deployment script (first time)
# Tip: running without flags opens an interactive prompt in a TTY
sudo ./deploy/deploy.sh --branch main

# Optional: interactive mode (choose branch / migrations / SSL / cert email)
sudo ./deploy/deploy.sh --interactive

# Optional: deploy and run SSL setup in one command
sudo ./deploy/deploy.sh --branch main --ssl --domain example.com --email admin@example.com

# Optional: update git + deploy in one interactive command (server clone workflow)
sudo ./deploy/update.sh --interactive
```

Notes:
- The deploy script auto-applies `NODE_OPTIONS=--max-old-space-size=3072` on ~1GB and ~2GB RAM hosts unless you already set a heap limit.
- On ~1GB and ~2GB RAM hosts, deploy-time low-memory protection now starts before `npm ci --omit=dev`, so production dependency installation gets the same early swap/headroom path as the later build.
- On ~2GB RAM hosts, the Next.js build step now uses `experimental.webpackMemoryOptimizations`, caps its low-memory heap at `2048` MB, and temporarily targets `2048` MB total swap while keeping the existing low-memory build path.
- If a previous deploy leaves behind an inaccessible temporary swap file, the deploy script now retries with a fresh sibling swap filename instead of abandoning temporary swap creation for the build.
- Browser-triggered or other non-root deploy runs now skip temporary swap management cleanly when the deploy user lacks privileged swap access, instead of failing on stale swap-file cleanup.
- The deploy script prunes old Node/npm temp files in `/tmp`, `/var/tmp`, and npm cache temp before builds to reduce ENOSPC failures.
- Use `--no-spinner --no-color` for CI/log-only environments.
- `deploy/update.sh` wraps `git fetch/pull` + `deploy.sh` for git checkouts, or runs a reduced deploy-only archive mode when the source tree has no `.git` directory.
- First root-led deploy/update runs now repair host wiring automatically: shared env, deploy user, repo ownership, sudoers, app service, and systemd timers. When run from a valid git checkout, bootstrap adopts that current checkout as `UPDATES_GIT_REPO_PATH`.
- `deploy/deploy.sh --print-deploy-mode` reports whether the host is already using the supported release-directory layout or still looks legacy/in-place.
- Both scripts now expose `Dependencies` and `Cron jobs sync` as first-class TUI main-menu options.
- `deploy.sh` / `update.sh` self-update at startup via `git pull` (when applicable), show detailed commit changes, wait for a keypress in TTY mode, and restart back to the main menu if the script code changed.
- `deploy.sh` and `update.sh` banners now render dynamically and include the app version from `package.json`, so longer titles do not break the right border.
- `deploy/deploy.sh` (and therefore `deploy/update.sh`) now re-syncs the repo Nginx site config on every deploy, runs `nginx -t`, and restarts Nginx after a successful deploy.
- `deploy/deploy.sh` now writes deploy commit metadata to shared data so admins can view post-deploy commit notes in the in-app `Latest Updates` popup.
- `deploy/deploy.sh` now auto-retries schema backup dumps with tablespace compatibility handling and only continues when a valid SQL dump file is produced.
- Managed systemd timer bootstrap now defers installation until a runnable `current/deploy/cron.sh` exists, avoiding first-run "runner not found" noise.
- Keep production Nginx changes in `deploy/nginx.conf` / `deploy/nginx-http.conf`; local edits under `/etc/nginx/sites-available/` will be overwritten by the next deploy/update.
- Admin/student login endpoints are rate-limited strictly, but general `/admin` and `/api/admin` console traffic now uses a higher limit to avoid intermittent operator-facing `503` errors during normal use.

### 2. Install Systemd Service

`deploy.sh` / `update.sh` now install and validate the managed `lessonflow.service` unit automatically when app-service bootstrap is enabled or missing. The installed unit is rendered from `deploy/app.service.template` using the detected git checkout path so the service sandbox matches the host layout.

### 2b. Enable Browser-Triggered Updates

The admin update button now starts a dedicated host-side systemd runner. It no longer accepts sudo credentials in the browser.

The first-install / repair bootstrap now installs the required sudoers files automatically:
- the deploy-user sudoers policy for host-side deploy actions
- the `lessonflow-web-update` trigger sudoers policy for `www-data`

The dedicated runner now starts as a root-owned systemd unit so low-memory deploy safeguards, swap management, and service restarts still work during browser-triggered updates.
Git fetch/merge operations are pinned to `UPDATES_DEPLOY_USER` so the persistent source checkout does not drift into root-owned state. Manual root-shell runs of `./deploy/update.sh` now honor the same shared-env setting.

### 2c. Scheduled Jobs Use Systemd Timers

LessonFlow uses systemd timers, not cron/crond, as the supported scheduler path in production. Deploy/update bootstrap installs and enables the timer/service pairs automatically when `systemctl` is available.

Check the timer suite with:

```bash
sudo systemctl list-timers --all | grep lessonflow
```

### 3. Install Nginx Configuration

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/lessonflow
sudo ln -s /etc/nginx/sites-available/lessonflow /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Run Database Migrations

```bash
cd /var/www/lessonflow/current
sudo -u www-data npx prisma migrate deploy
```

If this is an existing database and you added the new baseline migration (`20260222_initial_schema`) after the database was already initialized, Prisma may fail with `P3018` / MySQL `1050` (`Table ... already exists`) on that first migration.

Safe recovery (baseline metadata only, do not execute baseline SQL on an existing DB):
```bash
cd /var/www/lessonflow/current
sudo -u www-data npx prisma migrate resolve --applied 20260222_initial_schema
sudo -u www-data npx prisma migrate deploy
```

`deploy/deploy.sh` (and therefore `deploy/update.sh`) now handles this baseline case automatically.

### 5. Complete Setup Wizard

Visit `https://example.com/setup` to:
- Verify configuration
- Configure Gmail API or SMTP email delivery (the wizard shows a combined `Email delivery` check)
- Create admin account

### 6. Setup SSL Certificate

```bash
sudo ./deploy/setup-ssl.sh
```

If the live host is already configured, `setup-ssl.sh` will auto-detect the canonical domain from the active Nginx site or `NEXT_PUBLIC_SITE_URL` in `/var/www/lessonflow/shared/.env`. It will also reuse `SSL_EMAIL` from the shared env, or fall back to `ADMIN_EMAIL` when `SSL_EMAIL` is unset. Pass `--domain` or `--email` to override detection.

See [SSL Certificate](#ssl-certificate) section for full details.

---

## SSL Certificate

### Automated Setup (Recommended)

The included `setup-ssl.sh` script handles everything:

```bash
sudo ./deploy/setup-ssl.sh
```

This script:
- Installs certbot if needed
- Verifies DNS resolution
- Obtains Let's Encrypt certificate
- Updates nginx configuration
- Sets up automatic renewal (twice daily)

### Options

```bash
# Custom domain
sudo ./deploy/setup-ssl.sh --domain example.com --email your@email.com

# Test with staging server (won't create valid cert)
sudo ./deploy/setup-ssl.sh --staging

# Force renewal
sudo ./deploy/setup-ssl.sh --force
```

For first-time SSL setup without `--email`, define one of these in `/var/www/lessonflow/shared/.env`:

```env
SSL_EMAIL="ops@example.com"
# or fall back to the existing admin contact
ADMIN_EMAIL="owner@example.com"
```

### Manual Setup (Alternative)

If you prefer manual setup:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

### Check Certificate Status

```bash
sudo certbot certificates
```

### Manual Renewal Test

```bash
sudo certbot renew --dry-run
```

---

## Scheduled Jobs (Systemd Timers)

LessonFlow uses **systemd timers** for scheduled jobs (preferred over cron for production deployments). Timers integrate with systemd logging, support missed execution recovery, and work with read-only filesystems.

### Timer Schedule

| Timer | Service | Schedule | Description |
|-------|---------|----------|-------------|
| `lessonflow-daily-bookings.timer` | `lessonflow-daily-bookings.service` | Daily at 8:00 PM | Daily bookings digest |
| `lessonflow-invoice-reminders.timer` | `lessonflow-invoice-reminders.service` | Daily at 8:30 PM | Invoice reminders |
| `lessonflow-admin-reports-daily.timer` | `lessonflow-admin-reports-daily.service` | Daily at 8:45 PM | Daily admin reports |
| `lessonflow-admin-reports-weekly.timer` | `lessonflow-admin-reports-weekly.service` | Monday at 8:00 AM | Weekly admin reports |
| `lessonflow-admin-reports-monthly.timer` | `lessonflow-admin-reports-monthly.service` | 1st of month at 8:15 AM | Monthly admin reports |
| `lessonflow-admin-reports-yearly.timer` | `lessonflow-admin-reports-yearly.service` | January 1st at 8:30 AM | Yearly admin reports |
| `lessonflow-gmail-sync.timer` | `lessonflow-gmail-sync.service` | Every 2 minutes | Gmail synchronization |

All times are in server timezone (UTC 20:00 = 6:00 PM AEDT).

### Managing Timers

```bash
# View all LessonFlow timers
systemctl list-timers 'lessonflow-*.timer'

# View timer status and next trigger
systemctl list-timers lessonflow-daily-bookings.timer

# View timer details
systemctl cat lessonflow-daily-bookings.timer

# View service logs
sudo journalctl -u lessonflow-daily-bookings -f

# Manually trigger a job
sudo systemctl start lessonflow-daily-bookings.service

# Enable/disable a timer
sudo systemctl enable lessonflow-daily-bookings.timer
sudo systemctl disable lessonflow-daily-bookings.timer

# Reload timers after changes
sudo systemctl daemon-reload
sudo systemctl restart lessonflow-daily-bookings.timer
```

### Installing Timers Manually

If you need to install timers manually (outside of deploy):

```bash
# Copy unit files
sudo cp deploy/lessonflow-*.service /etc/systemd/system/
sudo cp deploy/lessonflow-*.timer /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable all timers
sudo systemctl enable lessonflow-*.timer

# Start all timers
sudo systemctl restart lessonflow-*.timer
```

### Fallback to Traditional Cron

If your system doesn't support systemd timers, you can use traditional cron. Add these entries to root's crontab:

```bash
sudo crontab -e
```

Managed cron entries (legacy fallback):

```cron
# Daily bookings digest at 8:00 PM
0 20 * * * /var/www/lessonflow/current/deploy/cron.sh daily-bookings-digest

# Invoice reminders at 8:30 PM
30 20 * * * /var/www/lessonflow/current/deploy/cron.sh invoice-reminders

# Daily owner report at 8:45 PM
45 20 * * * /var/www/lessonflow/current/deploy/cron.sh admin-reports-daily

# Weekly owner report every Monday at 8:00 AM
0 8 * * 1 /var/www/lessonflow/current/deploy/cron.sh admin-reports-weekly

# Monthly owner report on the 1st at 8:15 AM
15 8 1 * * /var/www/lessonflow/current/deploy/cron.sh admin-reports-monthly

# Yearly owner report on Jan 1 at 8:30 AM
30 8 1 1 * /var/www/lessonflow/current/deploy/cron.sh admin-reports-yearly

# Gmail sync every 2 minutes
*/2 * * * * /var/www/lessonflow/current/deploy/cron.sh gmail-sync
```

**Note:** The deploy script automatically installs systemd timers by default. Traditional cron is only used as a fallback when systemd is not available.

---

## Monitoring & Logs

### Application Logs

```bash
# View logs
sudo journalctl -u lessonflow -f

# View recent logs
sudo journalctl -u lessonflow --since "1 hour ago"
```

### Nginx Logs

```bash
tail -f /var/log/nginx/lessonflow.access.log
tail -f /var/log/nginx/lessonflow.error.log
```

### Scheduled Job Logs (Systemd Timers)

```bash
# View all timer logs
sudo journalctl -u lessonflow-daily-bookings -f
sudo journalctl -u lessonflow-invoice-reminders -f
sudo journalctl -u lessonflow-admin-reports-daily -f
sudo journalctl -u lessonflow-gmail-sync -f

# View logs from a specific time
sudo journalctl -u lessonflow-daily-bookings --since "1 hour ago"

# View recent failures
sudo journalctl -u lessonflow-daily-bookings -p err
```

### Cron Logs (Legacy Fallback)

If using traditional cron instead of systemd timers:

```bash
tail -f /var/log/lessonflow/cron-$(date +%Y%m%d).log
```

### Deploy Update Metadata (Admin "Latest Updates")

Successful deploys write a JSON summary of the applied commit(s) here:

```bash
/var/www/lessonflow/shared/data/deploy/latest-deploy-update.json
```

That file is surfaced in the admin UI via the `Latest Updates` button and is auto-shown once after login when a new deployed commit is detected in the browser.

### Service Status

```bash
sudo systemctl status lessonflow
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u lessonflow -n 50

# Check if port is in use
sudo lsof -i :3000

# Verify environment file
cat /var/www/lessonflow/shared/.env

# Test manually
cd /var/www/lessonflow/current
sudo -u www-data node .next/standalone/server.js
```

If `systemctl status lessonflow` reports `status=226/NAMESPACE`, the host could not create the filesystem namespace requested by the unit sandboxing. `deploy.sh` and `update.sh` first disable a stale `/etc/systemd/system/lessonflow.service.d/override.conf` when present; otherwise they install `/etc/systemd/system/lessonflow.service.d/namespace-compat.conf` and retry with reduced systemd sandboxing. If logs mention a missing path such as `/opt/melbourne-guitar-school`, check `UPDATES_GIT_REPO_PATH` in `/var/www/lessonflow/shared/.env`; the deploy scripts ignore missing repo paths when rendering new service units.

### Database Connection Issues

```bash
# Test MySQL connection
mysql -u mgs_user -p lessonflow

# Check DATABASE_URL format
# Should be: mysql://user:password@localhost:3306/database_name
```

### Nginx 502 Bad Gateway

```bash
# Check if Node app is running
sudo systemctl status lessonflow

# Check Nginx config
sudo nginx -t

# Check error logs
tail -f /var/log/nginx/lessonflow.error.log
```

### Prisma Migration Baseline Error (`P3018` / MySQL `1050`)

If Prisma reports that the first baseline migration failed because tables already exist:

```text
Applying migration `20260222_initial_schema`
Error: P3018 ... Database error code: 1050 ... already exists
```

Do this (safe on existing databases):

```bash
cd /var/www/lessonflow/current
sudo -u www-data npx prisma migrate resolve --applied 20260222_initial_schema
sudo -u www-data npx prisma migrate deploy
```

Do **not** run `prisma db execute` for the baseline migration SQL on a non-empty production database.

### Rollback to Previous Release

```bash
sudo ./deploy/deploy.sh --rollback
```

---

## Deployment Workflow

### Regular Deployments

```bash
# SSH into server
ssh user@your-server

# Navigate to your persistent git clone (not the deployed current release)
cd ~/lessonflow

# Update git clone + deploy (interactive)
sudo ./deploy/update.sh

# Existing shared env files keep current values. Any newly introduced keys from
# the repo .env.example are appended as blank placeholders such as KEY="" so
# you can review and populate them after the upgrade.

# Skip managed cron sync for this run (rare/manual maintenance case)
sudo ./deploy/update.sh --skip-cron

# Or specify branch + SSL in one command
sudo ./deploy/update.sh --branch main --ssl --domain example.com

# Or run non-interactively with SSL setup in one step
sudo ./deploy/deploy.sh --branch main --ssl --domain example.com
```

### Zero-Downtime Deploys

The deployment script keeps the last 2 releases by default. If something goes wrong:

```bash
sudo ./deploy/deploy.sh --rollback
```

To confirm the host is on the expected layout before or after an update:

```bash
sudo ./deploy/deploy.sh --print-deploy-mode
```

---

## Security Checklist

- [ ] Firewall enabled (UFW)
- [ ] SSH key-based auth only
- [ ] Root login disabled
- [ ] Fail2ban installed
- [ ] Automatic security updates enabled
- [ ] MySQL only listens on localhost
- [ ] Environment file permissions set to 600
- [ ] SSL certificate installed
- [ ] Session secrets are strong random strings

### Enable Firewall

```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### Install Fail2ban

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## Cost Estimates

| Provider       | Tier          | Monthly Cost | Notes                        |
| -------------- | ------------- | ------------ | ---------------------------- |
| DigitalOcean   | Basic Droplet | $6-12/mo     | 1-2GB RAM, good for starters |
| Hetzner        | CX22          | ~$5/mo       | Great value, EU servers      |
| Linode/Akamai  | Shared CPU    | $5-10/mo     | Reliable, good docs          |
| Vultr          | Regular       | $5-10/mo     | Many locations               |
| AWS Lightsail  | $3.50 plan    | $3.50/mo     | Easiest AWS option           |

**Total estimated monthly cost: $5-15/mo** (VPS only, domain separate)
