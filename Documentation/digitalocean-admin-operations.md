# Technical Owner Runbook: Installation, Updates, and Deploy Scripts

<div class="manual-callout warning">
<strong>Audience:</strong> This chapter is for the person responsible for hosting, deployment, and production recovery. It is not required for normal lesson administration.
</div>

## What This Runbook Covers

- first-time installation on a VPS or server
- routine updates
- when to use each deploy script
- service and timer verification
- safe post-deploy checks
- where to look if deployment or runtime behavior fails

## Installation Flow for a New VPS

Use this sequence when LessonFlow is being installed on a host for the first time.

### Step 1: Connect to the VPS

```bash
ssh <deploy-user>@<server-host>
```

Confirm you are on the correct machine before changing anything.

### Step 2: Place the repository on the server

Clone or update the LessonFlow repository into the intended deploy location. Follow the host's normal Git access process.

### Step 3: Install required packages

Use the package helper when preparing a fresh host:

```bash
sudo ./deploy/setup-packages.sh
```

Use this when system dependencies are missing or the host is being prepared for LessonFlow for the first time.

### Step 4: Configure filesystem permissions

Grant the intended deployment user the access required to manage releases safely:

```bash
sudo ./deploy/setup-permissions.sh <deploy-user>
```

This prepares the web root and deployment permissions expected by the update and deploy flows.

### Step 5: Run the first deploy

For a first-time installation, use the main deploy script:

```bash
./deploy/deploy.sh
```

If your deployment process uses branch or release options, use the host's approved invocation pattern.

### Step 6: Configure SSL if needed

When the app is reachable on HTTP and the domain is ready, use the SSL helper:

```bash
sudo ./deploy/setup-ssl.sh
```

Use this only after domain and nginx prerequisites are correct.

### Step 7: Verify the installation

After deployment, confirm:

- the app loads in a browser
- `/admin/login` is reachable
- the public site responds
- the student login route responds
- `lessonflow.service` is active
- required timers/services are installed

## Routine Updates on an Existing System

For normal updates on an already-installed host, use:

```bash
./deploy/update.sh
```

This is the standard operator path for pulling changes, rebuilding, and restarting through the existing deployment model.

Use `update.sh` when:

- the app is already installed
- you want the normal guided update flow
- you are applying routine code/config changes

## When to Use `deploy.sh` Instead of `update.sh`

Use `deploy/deploy.sh` for:

- first-time deployment
- lower-level deployment work where the main deploy script is the correct entrypoint
- recovery or reinstall scenarios where the update wrapper is not the right tool

Use `deploy/update.sh` for:

- normal ongoing updates to an existing installation

## Deploy Script Reference

| Script / File | Use it for | Notes |
| --- | --- | --- |
| `deploy/setup-packages.sh` | preparing a fresh host | installs required system packages |
| `deploy/setup-permissions.sh` | deploy-user filesystem access | run when preparing or correcting deployment permissions |
| `deploy/deploy.sh` | first-time or lower-level deployment | primary deploy script |
| `deploy/update.sh` | routine updates | safest normal update path |
| `deploy/setup-ssl.sh` | SSL setup | use only when nginx/domain prerequisites are ready |
| `deploy/cron.sh` | scheduled job entrypoint | used by timers/services for background jobs |
| `deploy/backup.sh` | backup operations | use for controlled backup workflows |
| `deploy/maintenance.sh` | maintenance tasks | use only when the maintenance task matches the need |
| `deploy/nginx.conf` | main nginx config template | server-facing configuration reference |
| `deploy/nginx-http.conf` | pre-SSL or HTTP-only nginx config | transitional or HTTP-specific setup |
| `deploy/lessonflow.service` | systemd app service | main application runtime |

## Services and Timers to Verify

Key runtime units include:

- `lessonflow.service`
- daily bookings digest timer/service
- invoice reminders timer/service
- admin reports timers/services
- Gmail sync timer/service

Check status with standard host tooling, for example:

```bash
systemctl status lessonflow
systemctl list-timers --all | grep lessonflow
```

## Update Visibility from the Admin UI

The admin console shows:

- update-available banner
- pending changes dialog
- deployment history dialog
- update progress page for web-triggered updates

These help confirm what changed, but they do not replace the command-line runbook when you need to install, deploy, or recover the host.

## Post-Deploy Verification Checklist

After any installation or update:

1. confirm the service is active
2. confirm the site responds
3. confirm admin login works
4. open bookings, invoices, reports, logs, and settings
5. confirm the student login route responds
6. confirm timers/services still exist where expected

## Recovery Hints

If a deployment fails:

- stop and read the output before retrying blindly
- confirm whether the failure is package, build, config, permission, or service related
- use the Logs page and host-side service status together
- do not run test or seed tooling against production data

<div class="manual-callout danger">
<strong>Never do this on production:</strong> do not use local test-seeding flows, destructive cleanup scripts, or experimental commands unless you have a deliberate recovery plan and confirmed backups.
</div>
