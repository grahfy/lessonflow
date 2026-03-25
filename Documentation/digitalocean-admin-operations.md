# Technical Owner Runbook: Installation, Updates, and Deploy Scripts

The technical-owner runbook documents the server-side operational procedures used to install, update, verify, and recover a LessonFlow deployment on a VPS. It is intended for the person responsible for hosting and deployment rather than for routine lesson administration.

<div class="manual-callout warning">
<strong>Audience note:</strong> This chapter is not required for everyday booking, billing, or support work. It exists for the operator who maintains the production host and must make controlled changes to services, scripts, and runtime configuration.
</div>

## Runbook Scope

This runbook covers:

- first-time installation on a server or VPS
- routine updates
- deploy-script selection
- service and timer verification
- post-deploy checking
- basic recovery direction

## Initial Installation

Initial installation generally follows this order:

1. connect to the VPS
2. place the repository on the host
3. install required packages
4. configure filesystem permissions
5. run the first deployment
6. configure SSL if required
7. verify the installation

### VPS Access

```bash
ssh <deploy-user>@<server-host>
```

The host identity should be confirmed before any deployment or configuration action is taken.

### Package Preparation

```bash
sudo ./deploy/setup-packages.sh
```

This helper is intended for fresh hosts or hosts missing required system packages.

### Permission Preparation

```bash
sudo ./deploy/setup-permissions.sh <deploy-user>
```

This step establishes the filesystem access model expected by the deployment scripts.

### First Deployment

```bash
./deploy/deploy.sh
```

The main deploy script is the normal first-install entrypoint and may also be appropriate for lower-level recovery work.

### SSL Setup

```bash
sudo ./deploy/setup-ssl.sh
```

SSL setup should only occur after domain and nginx prerequisites are ready.

## Routine Updates

For an already-installed system, the standard update path is:

```bash
./deploy/update.sh
```

This is the preferred routine path for ordinary code or configuration updates.

For the current DigitalOcean 2GB droplet profile, the deploy/update scripts now keep the low-memory build path, enable Next.js webpack memory optimisations for deploy builds, and target a conservative build heap plus temporary swap during updates. Non-root web-update runs skip temporary swap management when the deploy user lacks privileged swap access. This affects the deployment build only and does not change the runtime systemd service memory cap.

### Release 1.2.0 Upgrade Checks

When moving to `1.2.0`, the technical owner should explicitly confirm:

1. the Prisma migrations since `v1.1.0` have been applied successfully
2. `NEXT_PUBLIC_TIMEZONE` is set to the intended business timezone
3. single-user installs now show the owner account as the valid assignable teacher
4. older fully unassigned datasets have either been backfilled safely or deliberately reviewed after deploy

## Script Selection

| Script or file | Intended use |
| --- | --- |
| `deploy/setup-packages.sh` | Prepare a fresh host with required system packages |
| `deploy/setup-permissions.sh` | Establish or repair deployment-user access |
| `deploy/deploy.sh` | First deployment or lower-level recovery deployment |
| `deploy/update.sh` | Routine update of an existing installation |
| `deploy/setup-ssl.sh` | SSL configuration after prerequisites are met |
| `deploy/cron.sh` | Scheduled-job entrypoint |
| `deploy/backup.sh` | Controlled backup operations |
| `deploy/maintenance.sh` | Maintenance tasks matching the script’s purpose |
| `deploy/nginx.conf` | Main nginx configuration template |
| `deploy/nginx-http.conf` | Transitional or HTTP-only nginx configuration |
| `deploy/lessonflow.service` | Main systemd unit for the application runtime |

## Service and Timer Verification

Post-deploy verification should include runtime service and scheduled-job review.

Typical commands include:

```bash
systemctl status lessonflow
systemctl list-timers --all | grep lessonflow
```

The exact set of timers may include daily bookings digest, invoice reminders, admin reports, and Gmail sync units.

## Admin-Side Release Visibility

The admin console exposes update banners, pending-changes review, deployment history, and a live progress page for web-triggered updates. These surfaces are useful for confirmation and correlation, but they do not replace the shell-side deployment procedure documented here.

## Post-Deploy Verification

After installation or update, confirm:

1. the service is active
2. the public site responds
3. <code>/admin/login</code> is reachable
4. core admin screens open normally
5. the student login route responds
6. expected timers and services remain present

## Recovery Orientation

If deployment fails, the failure should be categorised before any retry:

- package problem
- build problem
- configuration problem
- permission problem
- service problem

Host-side service checks and the in-app Logs page should be used together where appropriate.

<div class="manual-callout danger">
<strong>Production safety:</strong> Test-seeding flows, destructive cleanup commands, and experimental scripts should not be run against production unless there is a deliberate recovery plan and confirmed backups.
</div>

## Related Sections

- [Settings and Configuration](08-Settings-and-Configuration.md)
- [Updates and Release Visibility](11-Updates-and-Release-Visibility.md)
- [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)
- [Staff Management and Teacher Assignment](03a-Staff-Management-and-Teacher-Assignment.md)
