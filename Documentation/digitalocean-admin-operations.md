# DigitalOcean Admin Operations Runbook (Technical Owner)

<div class="manual-callout warning">
<strong>Audience:</strong> This chapter is for technical owners and deployment operators responsible for infrastructure-level reliability.
</div>

This runbook defines how LessonFlow is maintained in a DigitalOcean-hosted environment. It should be used during planned deployments, post-change verification, incident response, and credential rotation windows. The objective is controlled change with predictable rollback paths.

A safe deployment sequence includes code update, dependency installation, migration execution, application build, service restart, and explicit post-deploy verification. Skipping verification is not acceptable; successful restart alone does not prove workflow correctness.

Post-deploy validation should include admin login, booking console load, invoice console load, and student portal route availability. If any critical route fails, halt further changes and investigate before normal operations resume.

Scheduled job reliability must be monitored continuously. Reminder jobs and other timed tasks should be checked for execution success and error patterns. Re-running failed jobs without diagnosis can duplicate side effects, so root-cause confirmation should happen before rerun.

Rollback readiness is part of every deployment plan. Maintain access to a known-good release state and confirm schema compatibility assumptions before applying rollback in production.

Operational safety rules are strict: never run destructive data operations without backup confidence, never point seed/test tooling at production data, and always rotate sensitive secrets after exposure or incident suspicion.

## Deployment Permissions and sudo

Deployments previously required the deployment user to run the update script entirely via `sudo`. This has been updated to use granular privileges and ensure least privilege access.

### Setting up a Deployment User
If you are deploying for the first time, you must configure permissions so the deployment user can access the web root and restart services without `sudo` prompting.

1. **Set up web root permissions:**
   ```bash
   sudo ./deploy/setup-permissions.sh <your_deployment_user>
   ```
   This script adds your user to the `www-data` group and sets `/var/www/lessonflow` to be group-writable so the build process can create releases.

2. **Configure passwordless service restarts:**
   ```bash
   sudo cp deploy/sudoers.template /etc/sudoers.d/lessonflow
   sudo sed -i 's/<DEPLOY_USER>/<your_deployment_user>/g' /etc/sudoers.d/lessonflow
   sudo chmod 0440 /etc/sudoers.d/lessonflow
   ```
   This allows the deployment user to restart `lessonflow`, `nginx`, and `cron` via `systemctl` during the deploy process without requiring an interactive password prompt.

Once configured, simply run `./deploy/update.sh` as the deployment user. The script will automatically escalate privileges via `sudo` only for specific system commands, keeping the main build process isolated to your user permissions.

### Enable Browser-Triggered Updates
The admin console update button now starts a dedicated host-side systemd runner instead of asking for sudo credentials in the browser.

1. **Set the deploy user in the shared environment:**
   ```bash
   sudo nano /var/www/lessonflow/shared/.env
   ```
   Add:
   ```bash
   UPDATES_DEPLOY_USER=<your_deployment_user>
   ```

2. **Install the runtime-user trigger rule:**
   ```bash
   sudo cp deploy/web-update-trigger.sudoers.template /etc/sudoers.d/lessonflow-web-update
   sudo sed -i 's/<APP_RUNTIME_USER>/www-data/g' /etc/sudoers.d/lessonflow-web-update
   sudo chmod 0440 /etc/sudoers.d/lessonflow-web-update
   ```

3. **Deploy once so the web-update service unit is installed/updated:**
   ```bash
   ./deploy/update.sh --branch main
   ```

After these steps, the admin update modal will launch `lessonflow-web-update.service`, which runs the deploy flow as the configured deployment user while preserving the existing in-app log/progress screen.
