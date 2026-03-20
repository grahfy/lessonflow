# Local Development Guide

This guide covers setting up the Melbourne Guitar School (LessonFlow) application for local development.

## Prerequisites

### Node.js

- **Version**: Node.js 20.x LTS or newer
- Check your version: `node --version`
- Recommend using [nvm](https://github.com/nvm-sh/nvm) (Linux/macOS) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage Node versions

### Docker and Docker Compose

Required for running the MariaDB database locally.

**Windows**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop)

**macOS**: Install Docker Desktop or Docker Engine

**Linux**: Install Docker Engine and Docker Compose:
```bash
sudo apt update
sudo apt install docker.io docker-compose
sudo systemctl start docker
sudo usermod -aG docker $USER  # Log out and back in
```

Verify Docker is running:
```bash
docker ps
```

### Database Client (Optional)

For debugging and direct database access:
- **TablePlus** (GUI): https://tableplus.com
- **MySQL Workbench**: https://www.mysql.com/products/workbench
- **mysql CLI**: `brew install mysql` (macOS) or `sudo apt install mysql-client` (Linux)

Connection details (see Docker Compose section below):
- Host: `127.0.0.1`
- Port: `3306`
- User: `root`
- Password: `root`
- Database: `mgs_dev`

## Quick Start

### Using Automated Scripts

The project includes scripts that automate the full setup process.

**macOS/Linux:**
```bash
# Full setup with seeding (recommended for first run)
./scripts/test-full-site-local.sh --seed

# Setup without seeding
./scripts/test-full-site-local.sh
```

**Windows (PowerShell):**
```powershell
# Full setup with seeding
.\scripts\test-full-site-local.ps1 -Seed

# Setup without seeding
.\scripts\test-full-site-local.ps1
```

These scripts will:
1. Install npm dependencies
2. Create `.env` from `.env.example`
3. Start MariaDB via Docker Compose
4. Run Prisma migrations
5. Generate Prisma client
6. Seed whitelabel defaults
7. Optionally seed fake data
8. Run tests
9. Start the dev server

### One-Command Setup with Seeding

For a complete fresh setup with demo data:

```bash
# macOS/Linux
./scripts/test-full-site-local.sh --seed --no-start

# Windows
.\scripts\test-full-site-local.ps1 -Seed -NoStart
```

After running, access the site at `http://localhost:3000`:
- **Admin**: http://localhost:3000/admin/login
- **Student Portal**: http://localhost:3000/student/login

Default admin credentials:
- Email: `admin@example.com`
- Password: `admin123`

## Ephemeral Demo Preview

For a sales/demo-friendly local instance that resets when the session ends:

```bash
./scripts/test-full-site-demo.sh
```

Behavior:
1. Starts a dedicated demo MariaDB container
2. Runs migrations and seeds a richer demo dataset
3. Prints frontend, admin, and student preview links plus demo credentials
4. Allows data changes during the session
5. Removes the demo database container on exit so the next run starts clean

Useful options:

```bash
./scripts/test-full-site-demo.sh --skip-install
./scripts/test-full-site-demo.sh --no-start
```

## Manual Setup (Step by Step)

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd melbourne-guitar-school

# Install dependencies
npm ci
```

### 2. Create Environment File

```bash
cp .env.example .env
```

The default `.env` is pre-configured for local Docker MariaDB:
```
DATABASE_URL="mysql://root:root@127.0.0.1:3306/mgs_dev"
```

### 3. Start MariaDB with Docker Compose

```bash
# Start MariaDB in background
docker-compose up -d

# Verify it's running
docker-compose ps
```

Expected output:
```
NAME                    COMMAND                  SERVICE              STATUS              PORTS
lessonflow-dev-mysql    docker-entrypoint.sh…    lessonflow-dev-mysql    running             0.0.0.0:3306->3306/tcp
```

Wait for MariaDB to be ready (usually 5-10 seconds):
```bash
docker-compose exec lessonflow-dev-mysql mysqladmin ping -h localhost -u root -proot
```

### 4. Run Prisma Migrations

```bash
npx prisma migrate deploy
```

### 5. Generate Prisma Client

```bash
npm run prisma:generate
```

### 6. Seed Whitelabel Defaults

This creates the default branding and site configuration:

```bash
npx tsx scripts/seed-whitelabel-defaults.ts
```

### 7. Start Development Server

```bash
npm run dev
```

The site will be available at http://localhost:3000

### Dev Server Route Troubleshooting

If `next dev` starts returning a false `404` for a route that exists in `src/app` (for example `/admin/settings`) while the production build still resolves it correctly, clear the local Next.js build artifacts first:

```bash
npm run clean
npm run dev
```

This removes stale `.next` output, which can occasionally leave the dev server in a bad routing state after larger App Router changes.

---

**Optional: Seed Fake Data**

To populate the database with test customers, bookings, and invoices:

```bash
# Clear existing data and seed fresh
npx tsx scripts/clear-customer-data.ts
npx tsx scripts/clear-all-data.ts
npx tsx scripts/seed-fake-data.ts 50   # 50 customers
npx tsx scripts/seed-invoice-presets.ts
```

## Docker Compose Commands

### Starting/Stopping the Database

```bash
# Start MariaDB
docker-compose up -d

# Stop MariaDB
docker-compose down

# Stop and remove volumes (full reset)
docker-compose down -v
```

### Viewing Logs

```bash
# Stream logs
docker-compose logs -f

# View recent logs
docker-compose logs --tail=50

# View logs for specific service
docker-compose logs -f lessonflow-dev-mysql
```

### Resetting the Database

```bash
# Stop and remove containers and volumes
docker-compose down -v

# Start fresh
docker-compose up -d

# Wait for DB, then migrate
sleep 5
npx prisma migrate deploy
npx tsx scripts/seed-whitelabel-defaults.ts
```

### Useful Docker Commands

```bash
# Check container status
docker ps

# Access MariaDB shell
docker-compose exec lessonflow-dev-mysql mysql -u root -proot mgs_dev

# Restart the container
docker-compose restart lessonflow-dev-mysql

# View resource usage
docker stats
```

## Common Tasks

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test (filter by name)
npm run test:watch -- --grep booking

# Run end-to-end tests
npm run test:e2e

# Run only admin mobile responsiveness checks
npm run test:e2e -- tests/e2e/admin-mobile.spec.ts
```

### Admin Mobile QA Checklist

Use this when making shared admin UI/layout changes:

```bash
# 1) Start dev server
npm run dev

# 2) Export admin credentials used by Playwright login helper
export DOCS_SCREENSHOTS_ADMIN_EMAIL="admin@example.com"
export DOCS_SCREENSHOTS_ADMIN_PASSWORD="admin123"

# 3) Run mobile admin route + dialog regression
npm run test:e2e -- tests/e2e/admin-mobile.spec.ts
```

### Seeding Fake Data

```bash
# Clear and reseed with 50 customers
npx tsx scripts/clear-customer-data.ts
npx tsx scripts/clear-all-data.ts
npx tsx scripts/seed-fake-data.ts 50
npx tsx scripts/seed-invoice-presets.ts
```

### Clearing and Reseeding Data

```bash
# Clear all customer/booking/invoice data
npx tsx scripts/clear-customer-data.ts

# Clear all data including admin users (keeps whitelabel config)
npx tsx scripts/clear-all-data.ts

# Reseed whitelabel defaults
npx tsx scripts/seed-whitelabel-defaults.ts
```

### Accessing the Database Directly

**Using Docker exec:**
```bash
docker-compose exec lessonflow-dev-mysql mysql -u root -proot mgs_dev
```

**Using TablePlus or MySQL Workbench:**
- Host: `127.0.0.1`
- Port: `3306`
- Username: `root`
- Password: `root`
- Database: `mgs_dev`

**Resetting Admin Password:**
```bash
npm run reset-admin-password  # If available
# Or manually run the reset script
bash scripts/reset-admin-password.sh
```

## Troubleshooting

### Port Conflicts

**Port 3000 in use:**
```bash
# Find process using port 3000
# macOS/Linux
lsof -i :3000

# Windows
netstat -ano | findstr :3000

# Kill the process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

**Port 3306 in use (database):**
```bash
# Check if another MySQL/MariaDB is running
docker ps | grep 3306

# Stop the conflicting service
# On macOS: Stop MySQL from System Preferences > MySQL
# On Windows: Stop MySQL service from Services
```

### Database Connection Problems

**"Can't connect to MySQL server":**
1. Verify Docker is running: `docker ps`
2. Check container status: `docker-compose ps`
3. Restart the container: `docker-compose restart`
4. Check logs: `docker-compose logs lessonflow-dev-mysql`

**"Unknown database 'mgs_dev'":**
1. The database wasn't created. Restart the container:
   ```bash
   docker-compose down
   docker-compose up -d
   ```
2. The volume might be corrupted. Reset completely:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

**"Access denied for user 'root'":**
- Verify password in `.env` matches Docker Compose config (`root`)
- Try reconnecting after a few seconds (initial setup delay)

### Permission Issues

**npm install fails:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules
npm ci
```

**Docker permission denied (Linux):**
```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or:
newgrp docker
```

### Common Error Messages

**"next dev" server won't start:**
```bash
# Clean Next.js artifacts
npm run clean

# Try again
npm run dev
```

**Prisma client out of sync:**
```bash
# Regenerate Prisma client
npm run prisma:generate
```

**Tests fail with connection error:**
```bash
# Ensure test database is prepared
npm run test:prepare
```

## Environment Variables

Key environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://root:root@127.0.0.1:3306/mgs_dev` |
| `NEXT_PUBLIC_SITE_URL` | Public site URL | `https://melbourneguitarschool.com.au` |
| `ADMIN_EMAIL` | Default admin email | `owner@example.com` |
| `ADMIN_PASSWORD` | Default admin password | `change-me` |
| `ADMIN_SESSION_SECRET` | Session encryption key | `change-me-session` |
| `STUDENT_SESSION_SECRET` | Student session key | `change-me-student-session` |
| `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY` | Student password encryption | `change-me-student-portal-encryption-key` |
| `NEXT_PUBLIC_BRAND_NAME` | Site display name | `Melbourne Guitar School` |
| `NEXT_PUBLIC_PRIMARY_SUBJECT` | Primary instrument | `Guitar` |
| `NEXT_PUBLIC_PRIMARY_LOCATION` | Primary location | `Northcote` |
| `NEXT_PUBLIC_CONTACT_PHONE` | Contact phone | `0401 489 437` |
| `INVOICE_BUSINESS_NAME` | Business name for invoices | `Melbourne Guitar School` |
| `INVOICE_PAYMENT_TERMS_DAYS` | Invoice payment terms | `14` |
| `LEARNING_MATERIALS_LOCAL_ROOT` | Local storage path | `.data/learning-materials` |

### Customizing Environment Variables

Edit `.env` directly for local development:

```bash
# Example: Change the brand name
NEXT_PUBLIC_BRAND_NAME="My Guitar School"

# Example: Use a different database name
DATABASE_URL="mysql://root:root@127.0.0.1:3306/my_dev_db"
```

After changing `.env`, restart the dev server.

## Project Structure Overview

```
melbourne-guitar-school/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── (public)/        # Public pages (home, lessons, contact, etc.)
│   │   ├── admin/           # Admin dashboard pages
│   │   ├── student/         # Student portal pages
│   │   └── api/            # API routes
│   ├── components/         # React components
│   ├── lib/                # Shared utilities
│   │   ├── admin/          # Admin-specific utilities
│   │   ├── invoices/       # Invoice logic
│   │   ├── student-portal/ # Student portal logic
│   │   └── *.ts            # Core utilities
│   ├── generated/prisma/   # Generated Prisma client
│   └── styles/            # Global CSS
├── prisma/
│   └── schema.prisma      # Database schema
├── scripts/               # Seed and utility scripts
├── public/                # Static assets
├── docker-compose.yml     # MariaDB configuration
└── package.json           # Dependencies
```

### Key Directories

- **`src/app`**: All page routes (App Router)
- **`src/components`**: Reusable UI components
- **`src/lib`**: Business logic, database, auth, email
- **`prisma`**: Database schema and migrations
- **`scripts`**: Data seeding and maintenance scripts
