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
git clone https://github.com/your-org/lessonflow-website.git
cd lessonflow-website

# Run automated setup (detects OS automatically)
sudo ./deploy/setup-packages.sh
```

This installs:
- Node.js 20 LTS
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
cd /var/www/lessonflow/current
sudo ./deploy/update.sh --branch main
```

Recommended defaults:
- `Dependencies`: ON for normal releases (turn OFF only when you know lockfiles/deps did not change)
- `Cron jobs sync`: ON so the managed cron block stays aligned with supported jobs

Notes:
- `update.sh` / `deploy.sh` now show pulled commit details and pause for a keypress if a `git pull` updates the deploy script itself, then they return to the TUI main menu.
- The one-time migration helper now hands off to `deploy/update.sh` with automatic `git fetch/pull` (no `--skip-pull`) so the latest deploy logic is used.
- Admins can confirm deployed commits in the app using the `Latest Updates` popup after login.

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

# Install Node.js 20
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

# Install Node.js 20
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

# Install Node.js 20
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
UPDATES_GIT_REPO_PATH="/opt/melbourne-guitar-school"
UPDATES_DEPLOY_USER="deploy"

# Learning Materials Storage
LEARNING_MATERIALS_STORAGE_DRIVER="local"
LEARNING_MATERIALS_LOCAL_ROOT="/var/www/lessonflow/data/learning-materials"

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

```bash
sudo chmod 600 /var/www/lessonflow/shared/.env
sudo chown www-data:www-data /var/www/lessonflow/shared/.env
```

---

## Application Deployment

### 1. Initial Deployment

From your local machine or the server:

```bash
# Clone or copy the application
git clone https://github.com/your-org/lessonflow-website.git
cd lessonflow-website

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
- The deploy script auto-applies `NODE_OPTIONS=--max-old-space-size=3072` only on ~1GB RAM hosts (unless you already set a heap limit).
- The deploy script prunes old Node/npm temp files in `/tmp`, `/var/tmp`, and npm cache temp before builds to reduce ENOSPC failures.
- Use `--no-spinner --no-color` for CI/log-only environments.
- `deploy/update.sh` wraps `git fetch/pull` + `deploy.sh` with the same interactive/spinner UI.
- Both scripts now expose `Dependencies` and `Cron jobs sync` as first-class TUI main-menu options.
- `deploy.sh` / `update.sh` self-update at startup via `git pull` (when applicable), show detailed commit changes, wait for a keypress in TTY mode, and restart back to the main menu if the script code changed.
- `deploy.sh` and `update.sh` banners now render dynamically and include the app version from `package.json`, so longer titles do not break the right border.
- `deploy/deploy.sh` (and therefore `deploy/update.sh`) now re-syncs the repo Nginx site config on every deploy, runs `nginx -t`, and restarts Nginx after a successful deploy.
- `deploy/deploy.sh` now writes deploy commit metadata to shared data so admins can view post-deploy commit notes in the in-app `Latest Updates` popup.
- `deploy/deploy.sh` now auto-retries schema backup dumps with tablespace compatibility handling and only continues when a valid SQL dump file is produced.
- Managed cron bootstrap now defers job installation until a runnable `current/deploy/cron.sh` exists, avoiding first-run "runner not found" noise.
- Keep production Nginx changes in `deploy/nginx.conf` / `deploy/nginx-http.conf`; local edits under `/etc/nginx/sites-available/` will be overwritten by the next deploy/update.
- Admin/student login endpoints are rate-limited strictly, but general `/admin` and `/api/admin` console traffic now uses a higher limit to avoid intermittent operator-facing `503` errors during normal use.

### 2. Install Systemd Service

```bash
sudo cp deploy/lessonflow.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable lessonflow
sudo systemctl start lessonflow
```

### 2b. Enable Browser-Triggered Updates

The admin update button now starts a dedicated host-side systemd runner. It no longer accepts sudo credentials in the browser.

```bash
# Allow the runtime user to start the dedicated web-update service
sudo cp deploy/web-update-trigger.sudoers.template /etc/sudoers.d/lessonflow-web-update
sudo sed -i 's/<APP_RUNTIME_USER>/www-data/g' /etc/sudoers.d/lessonflow-web-update
sudo chmod 0440 /etc/sudoers.d/lessonflow-web-update

# Run a deploy/update after setting UPDATES_DEPLOY_USER in shared/.env
# so deploy.sh installs /etc/systemd/system/lessonflow-web-update.service
./deploy/update.sh --branch main
```

The dedicated runner executes the deploy flow as `UPDATES_DEPLOY_USER`; the app runtime user is only allowed to start that specific systemd unit.

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
sudo ./deploy/setup-ssl.sh --email your@email.com
```

If the live host is already configured, `setup-ssl.sh` will auto-detect the canonical domain from the active Nginx site or `NEXT_PUBLIC_SITE_URL` in `/var/www/lessonflow/shared/.env`. Pass `--domain` to override detection.

See [SSL Certificate](#ssl-certificate) section for full details.

---

## SSL Certificate

### Automated Setup (Recommended)

The included `setup-ssl.sh` script handles everything:

```bash
sudo ./deploy/setup-ssl.sh --email your@email.com
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
sudo ./deploy/setup-ssl.sh --email your@email.com --staging

# Force renewal
sudo ./deploy/setup-ssl.sh --email your@email.com --force
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

# Skip managed cron sync for this run (rare/manual maintenance case)
sudo ./deploy/update.sh --skip-cron

# Or specify branch + SSL in one command
sudo ./deploy/update.sh --branch main --ssl --domain example.com --email admin@example.com

# Or run non-interactively with SSL setup in one step
sudo ./deploy/deploy.sh --branch main --ssl --domain example.com --email admin@example.com
```

### Zero-Downtime Deploys

The deployment script keeps the last 5 releases. If something goes wrong:

```bash
sudo ./deploy/deploy.sh --rollback
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
