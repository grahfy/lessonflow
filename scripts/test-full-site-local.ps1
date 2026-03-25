<#
.SYNOPSIS
    Local convenience script for a "full site" smoke run on Windows.

.DESCRIPTION
    This script bootstraps env files, prepares local databases (dev and test),
    runs tests, and optionally starts next dev.

.PARAMETER SkipInstall
    Skip npm ci dependency installation.

.PARAMETER SkipTests
    Skip npm test automated tests.

.PARAMETER Seed
    Clear existing customer/invoice data and seed fresh fake data including lesson planning.

.PARAMETER SeedDocsDemo
    Clear existing dev data and seed the deterministic docs/demo dataset including lesson planning.

.PARAMETER NoStart
    Do not start Next.js dev server after setup/checks.

.EXAMPLE
    .\test-full-site-local.ps1
    .\test-full-site-local.ps1 -SkipInstall -SkipTests -NoStart
    .\test-full-site-local.ps1 -Seed
    .\test-full-site-local.ps1 -SeedDocsDemo
#>

param(
    [switch]$Help,
    [switch]$SkipInstall,
    [switch]$SkipTests,
    [switch]$Seed,
    [switch]$SeedDocsDemo,
    [int]$SeedCount = 50,
    [switch]$NoStart
)

if ($Help) {
    Write-Host @"
Usage: scripts\test-full-site-local.ps1 [-SkipInstall] [-SkipTests] [-Seed | -SeedDocsDemo] [-SeedCount <n>] [-NoStart] [-Help]

Options:
  -SkipInstall       Skip npm ci dependency installation
  -SkipTests         Skip npm test automated tests
  -Seed              Clear the dev DB and seed generic fake admin/customer/invoice/lesson-plan data
  -SeedDocsDemo      Clear the dev DB and seed the deterministic docs/demo dataset including lesson planning
  -SeedCount <n>     Number of fake customers to seed for -Seed (default: 50)
  -NoStart           Do not start Next.js dev server after setup/checks
  -Help              Show this help message
"@
    exit 0
}

$ErrorActionPreference = "Stop"

$LISTEN_HOST = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
$PORT = if ($env:PORT) { $env:PORT } else { "3000" }
$TESTS_FAILED = $false
$SEED_MODE = if ($SeedDocsDemo) { "docs-demo" } elseif ($Seed) { "fake" } else { "none" }

if ($Seed -and $SeedDocsDemo) {
    Write-Error "Choose only one seed mode: -Seed or -SeedDocsDemo"
    exit 1
}

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
if (-not $ROOT_DIR) {
    $ROOT_DIR = Get-Location
}
Set-Location $ROOT_DIR

$SITE_URL_HOST = if ($LISTEN_HOST -eq "0.0.0.0") { "127.0.0.1" } else { $LISTEN_HOST }
$SITE_URL = "http://${SITE_URL_HOST}:${PORT}"
$DOCS_DEMO_ADMIN_EMAIL = if ($env:DOCS_SCREENSHOTS_ADMIN_EMAIL) { $env:DOCS_SCREENSHOTS_ADMIN_EMAIL } else { "owner@example.com" }
$DOCS_DEMO_ADMIN_PASSWORD = if ($env:DOCS_SCREENSHOTS_ADMIN_PASSWORD) { $env:DOCS_SCREENSHOTS_ADMIN_PASSWORD } else { "DocsDemoAdmin!23" }
$DOCS_DEMO_STUDENT_PASSWORD = if ($env:DOCS_SCREENSHOTS_STUDENT_PASSWORD) { $env:DOCS_SCREENSHOTS_STUDENT_PASSWORD } else { "StudentDemo!23" }

function Log {
    param([string]$Message)
    Write-Host "[local-full-site] $Message"
}

if (-not $SkipInstall) {
    Log "Installing dependencies..."
    npm ci --no-fund --no-audit --loglevel=error
}

function Test-DockerAvailable {
    try {
        $dockerProcess = Start-Process -FilePath "docker" -ArgumentList "info" -Wait -PassThru -NoNewWindow -ErrorAction Stop
        if ($dockerProcess.ExitCode -ne 0) {
            Log "Docker returned non-zero exit code"
            return $false
        }
        Log "Docker is accessible"
        return $true
    }
    catch {
        Log "Docker check failed: $($_.Exception.Message)"
        return $false
    }
}

function Get-DatabaseUrl {
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" -Raw
        if ($envContent -match 'DATABASE_URL="([^"]+)"') {
            return $matches[1]
        }
    }
    return $null
}

function Get-TestDatabaseUrl {
    if (Test-Path ".env.test.local") {
        $envContent = Get-Content ".env.test.local" -Raw
        if ($envContent -match 'TEST_DATABASE_URL="([^"]+)"') {
            return $matches[1]
        }
    }
    return $null
}

function Start-MariaDBContainer {
    param(
        [string]$ContainerName,
        [string]$DatabaseName,
        [int]$HostPort
    )
    
    $existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
    
    if ($existing) {
        # RATIONALE: Reuse existing containers so local smoke runs remain fast
        # and do not destroy developer data between repeated verification passes.
        $running = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
        if (-not $running) {
            Log "Starting existing container: $ContainerName"
            docker start $ContainerName > $null
        } else {
            Log "Container already running: $ContainerName"
            return 0
        }
    } else {
        Log "Creating and starting container: $ContainerName on port $HostPort"
        $portMapping = $HostPort.ToString() + ":3306"
        docker run -d --name $ContainerName -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=$DatabaseName -p $portMapping mariadb:latest > $null
    }
    
    Log "Waiting for $ContainerName to be ready..."
    $maxRetries = 30
    $retryCount = 0
    while ($retryCount -lt $maxRetries) {
        $result = docker exec $ContainerName mysqladmin ping -h localhost -u root -proot 2>$null
        if ($LASTEXITCODE -eq 0) {
            break
        }
        Start-Sleep -Seconds 1
        $retryCount++
    }
    
    if ($retryCount -ge $maxRetries) {
        throw "Timeout waiting for $ContainerName to start"
    }
    
    Log "$ContainerName is ready"
}

# Ensure env files exist
if (-not (Test-Path ".env")) {
    Log "Creating .env from .env.example"
    Copy-Item ".env.example" ".env"
}

if (-not (Test-Path ".env.test.local") -and (Test-Path ".env.test.example")) {
    Log "Creating .env.test.local from .env.test.example"
    Copy-Item ".env.test.example" ".env.test.local"
}

# Get database URLs
$DB_URL = Get-DatabaseUrl
if (-not $DB_URL) {
    Write-Error "DATABASE_URL not found in .env file"
    exit 1
}

$TEST_DB_URL = Get-TestDatabaseUrl
if (-not $TEST_DB_URL) {
    # NOTE: Fall back to the dev DB URL with the conventional test DB/port swap
    # so Windows users can get running even when .env.test.local is absent.
    $TEST_DB_URL = $DB_URL -replace '/mgs_dev', '/mgs_test'
    $TEST_DB_URL = $TEST_DB_URL -replace ':3306/', ':3307/'
}

Log "Dev database: $DB_URL"
Log "Test database: $TEST_DB_URL"

# Check Docker availability
Log "Checking Docker availability..."
$dockerAvailable = Test-DockerAvailable

if (-not $dockerAvailable) {
    Log "Docker is not available, checking if containers are already running..."
    try {
        $devRunning = docker ps --format "{{.Names}}" | Where-Object { $_ -eq "lessonflow-dev-mysql" } | Measure-Object | Select-Object -ExpandProperty Count
        $testRunning = docker ps --format "{{.Names}}" | Where-Object { $_ -eq "lessonflow-test-mysql" } | Measure-Object | Select-Object -ExpandProperty Count
        
        if ($devRunning -gt 0 -and $testRunning -gt 0) {
            Log "Both database containers are already running, proceeding..."
            $dockerAvailable = $true
        } else {
            Log "Please ensure Docker Desktop is running and accessible from PowerShell."
            Log "You may need to restart your terminal or add Docker to your PATH."
            exit 1
        }
    } catch {
        Log "Cannot check container status: $($_.Exception.Message)"
        exit 1
    }
}

if ($dockerAvailable) {
    Start-MariaDBContainer -ContainerName "lessonflow-dev-mysql" -DatabaseName "mgs_dev" -HostPort 3306
    Start-MariaDBContainer -ContainerName "lessonflow-test-mysql" -DatabaseName "mgs_test" -HostPort 3307
}

# Run migrations on test database
Log "Running Prisma migrations on test database..."
$env:DATABASE_URL = $TEST_DB_URL
npx prisma migrate deploy > $null

# Run migrations on dev database
Log "Running Prisma migrations on dev database..."
$env:DATABASE_URL = $DB_URL
npx prisma migrate deploy > $null

# Generate Prisma client
Log "Generating Prisma client..."
$env:DATABASE_URL = $TEST_DB_URL
npx prisma generate > $null

$env:DATABASE_URL = $DB_URL

if ($SEED_MODE -ne "none") {
    Log "Clearing existing data..."
    npx tsx scripts/clear-customer-data.ts 2>$null
    npx tsx scripts/clear-all-data.ts 2>$null
}

# Seed whitelabel defaults.
# RATIONALE: The site shells rely on these defaults even in local smoke runs, so
# the script always seeds them before optional fake student/customer data.
Log "Seeding whitelabel defaults..."
npx tsx scripts/seed-whitelabel-defaults.ts

if ($SEED_MODE -eq "fake") {
    Log "Seeding fake data ($SeedCount customers)..."
    npx tsx scripts/seed-fake-data.ts $SeedCount
    npx tsx scripts/seed-invoice-presets.ts
    npx tsx scripts/seed-lesson-planning.ts --profile fake

    Log "Default admin account:"
    Log "  URL: http://localhost:${PORT}/admin/login"
    Log "  Email: admin@example.com"
    Log "  Password: admin123"
}

if ($SEED_MODE -eq "docs-demo") {
    Log "Seeding deterministic docs/demo dataset..."
    $env:NEXT_PUBLIC_SITE_URL = $SITE_URL
    $env:DOCS_SCREENSHOTS_BASE_URL = $SITE_URL
    $env:DOCS_SCREENSHOTS_ADMIN_EMAIL = $DOCS_DEMO_ADMIN_EMAIL
    $env:DOCS_SCREENSHOTS_ADMIN_PASSWORD = $DOCS_DEMO_ADMIN_PASSWORD
    $env:DOCS_SCREENSHOTS_STUDENT_PASSWORD = $DOCS_DEMO_STUDENT_PASSWORD
    npx tsx scripts/seed-docs-screenshots.ts > $null
    npx tsx scripts/seed-lesson-planning.ts --profile docs-demo > $null

    $checklistPath = Join-Path $ROOT_DIR "Documentation/assets/SCREENSHOT_SEED_CHECKLIST.md"
    $studentName = ""
    $studentPostcode = ""
    if (Test-Path $checklistPath) {
        $studentNameMatch = Select-String -Path $checklistPath -Pattern '^- Student login name: `(.*)`' | Select-Object -First 1
        $studentPostcodeMatch = Select-String -Path $checklistPath -Pattern '^- Student postcode: `(.*)`' | Select-Object -First 1
        if ($studentNameMatch) {
            $studentName = $studentNameMatch.Matches.Groups[1].Value
        }
        if ($studentPostcodeMatch) {
            $studentPostcode = $studentPostcodeMatch.Matches.Groups[1].Value
        }
    }

    Log "Docs/demo admin account:"
    Log "  URL: ${SITE_URL}/admin/login"
    Log "  Email: $DOCS_DEMO_ADMIN_EMAIL"
    Log "  Password: $DOCS_DEMO_ADMIN_PASSWORD"
    if ($studentName -and $studentPostcode) {
        Log "Docs/demo student account:"
        Log "  URL: ${SITE_URL}/student/login"
        Log "  Login: ${studentName} / ${studentPostcode}"
        Log "  Password: $DOCS_DEMO_STUDENT_PASSWORD"
    }
}

if (-not $SkipTests) {
    Log "Running automated tests..."
    $env:DATABASE_URL = $TEST_DB_URL
    $env:TEST_DATABASE_URL = $TEST_DB_URL
    
    npm test
    if ($LASTEXITCODE -ne 0) {
        $TESTS_FAILED = $true
        Log "Automated tests failed. Continuing so you can still test the site manually."
    }
}

Log "Cleaning stale Next.js artifacts..."
npm run clean --silent

if ($NoStart) {
    if ($TESTS_FAILED) { exit 1 }
    Log "Checks completed. Dev server start skipped (-NoStart)."
    exit 0
}

# Ensure port is free
$portInUse = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($portInUse) {
    Log "Port $PORT is in use, freeing it..."
    $processId = (Get-NetTCPConnection -LocalPort $PORT).OwningProcess
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Reset DATABASE_URL back to dev database for the dev server
$env:DATABASE_URL = $DB_URL

Log "Starting local site at http://${LISTEN_HOST}:${PORT}"
Log "NOTE: The site will default to 'Melbourne Guitar School' until you customize it in Admin Settings."

# Start Next.js dev server
$devServer = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -PassThru -NoNewWindow

Log "Dev server started (PID: $($devServer.Id))"
Log "Press Ctrl+C to stop the server"

# Wait for the dev server process
try {
    $devServer.WaitForExit()
} catch {
    Log "Dev server stopped"
    Stop-Process -Id $devServer.Id -Force -ErrorAction SilentlyContinue
}
