# Melbourne Guitar School - VPS Deployment Guide

Complete guide for deploying to a Virtual Private Server.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Automated)](#quick-start-automated)
3. [Manual Server Setup](#manual-server-setup)
4. [Database Setup](#database-setup)
5. [Application Deployment](#application-deployment)
6. [SSL Certificate](#ssl-certificate)
7. [Cron Jobs](#cron-jobs)
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
git clone https://github.com/your-org/melbourne-guitar-school-website.git
cd melbourne-guitar-school-website

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
CREATE DATABASE melbourne_guitar_school CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mgs_user'@'localhost' IDENTIFIED BY 'your-secure-password';
GRANT ALL PRIVILEGES ON melbourne_guitar_school.* TO 'mgs_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2. Create Environment File

```bash
sudo nano /var/www/melbourne-guitar-school/shared/.env
```

```env
# Database
DATABASE_URL="mysql://mgs_user:your-secure-password@localhost:3306/melbourne_guitar_school"

# Site URL
NEXT_PUBLIC_SITE_URL="https://melbourneguitarschool.com.au"

# Session Secrets (generate with: openssl rand -base64 32)
ADMIN_SESSION_SECRET="your-admin-session-secret"
STUDENT_SESSION_SECRET="your-student-session-secret"
STUDENT_SESSION_MAX_AGE_SECONDS="2592000"

# Student Portal
STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY="your-encryption-key"
STUDENT_PORTAL_PASSWORD_LENGTH="14"

# Cron Secret
CRON_SECRET="your-cron-secret"

# SMTP (optional but recommended)
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your-smtp-user"
SMTP_PASS="your-smtp-password"
SMTP_FROM="Melbourne Guitar School <no-reply@melbourneguitarschool.com.au>"

# Learning Materials Storage
LEARNING_MATERIALS_STORAGE_DRIVER="local"
LEARNING_MATERIALS_LOCAL_ROOT="/var/www/melbourne-guitar-school/data/learning-materials"

# Invoice Configuration
INVOICE_BUSINESS_NAME="Melbourne Guitar School"
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
sudo chmod 600 /var/www/melbourne-guitar-school/shared/.env
sudo chown www-data:www-data /var/www/melbourne-guitar-school/shared/.env
```

---

## Application Deployment

### 1. Initial Deployment

From your local machine or the server:

```bash
# Clone or copy the application
git clone https://github.com/your-org/melbourne-guitar-school-website.git
cd melbourne-guitar-school-website

# Run deployment script (first time)
sudo ./deploy/deploy.sh --branch main
```

### 2. Install Systemd Service

```bash
sudo cp deploy/melbourne-guitar-school.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable melbourne-guitar-school
sudo systemctl start melbourne-guitar-school
```

### 3. Install Nginx Configuration

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/melbourne-guitar-school
sudo ln -s /etc/nginx/sites-available/melbourne-guitar-school /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Run Database Migrations

```bash
cd /var/www/melbourne-guitar-school/current
sudo -u www-data npx prisma migrate deploy
```

### 5. Complete Setup Wizard

Visit `https://melbourneguitarschool.com.au/setup` to:
- Verify configuration
- Create admin account

### 6. Setup SSL Certificate

```bash
sudo ./deploy/setup-ssl.sh --email your@email.com
```

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
sudo certbot --nginx -d melbourneguitarschool.com.au -d www.melbourneguitarschool.com.au
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

## Cron Jobs

Add scheduled jobs to run daily:

```bash
sudo crontab -e
```

Add these lines:

```cron
# Daily bookings digest at 8:00 PM UTC
0 20 * * * /var/www/melbourne-guitar-school/current/deploy/cron.sh daily-bookings-digest

# Invoice reminders at 8:30 PM UTC
30 20 * * * /var/www/melbourne-guitar-school/current/deploy/cron.sh invoice-reminders
```

Adjust times as needed for your timezone (UTC 20:00 = 6:00 AM AEDT).

---

## Monitoring & Logs

### Application Logs

```bash
# View logs
sudo journalctl -u melbourne-guitar-school -f

# View recent logs
sudo journalctl -u melbourne-guitar-school --since "1 hour ago"
```

### Nginx Logs

```bash
tail -f /var/log/nginx/melbourne-guitar-school.access.log
tail -f /var/log/nginx/melbourne-guitar-school.error.log
```

### Cron Logs

```bash
tail -f /var/log/melbourne-guitar-school/cron-$(date +%Y%m%d).log
```

### Service Status

```bash
sudo systemctl status melbourne-guitar-school
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u melbourne-guitar-school -n 50

# Check if port is in use
sudo lsof -i :3000

# Verify environment file
cat /var/www/melbourne-guitar-school/shared/.env

# Test manually
cd /var/www/melbourne-guitar-school/current
sudo -u www-data node .next/standalone/server.js
```

### Database Connection Issues

```bash
# Test MySQL connection
mysql -u mgs_user -p melbourne_guitar_school

# Check DATABASE_URL format
# Should be: mysql://user:password@localhost:3306/database_name
```

### Nginx 502 Bad Gateway

```bash
# Check if Node app is running
sudo systemctl status melbourne-guitar-school

# Check Nginx config
sudo nginx -t

# Check error logs
tail -f /var/log/nginx/melbourne-guitar-school.error.log
```

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

# Navigate to repo
cd /var/www/melbourne-guitar-school/current

# Pull latest changes
git pull origin main

# Run deployment
sudo ./deploy/deploy.sh --branch main
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
