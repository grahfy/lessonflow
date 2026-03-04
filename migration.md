# Production Migration: `melbourne-guitar-school` -> `lessonflow`

This runbook migrates the production runtime naming to `lessonflow` while keeping the existing domain and database in place.

## Scope

- Keep repo path: `~/melbourne-guitar-school`
- Migrate runtime path: `/var/www/melbourne-guitar-school` -> `/var/www/lessonflow`
- Migrate service/nginx/cron naming to `lessonflow`
- Keep domain and TLS certs unchanged (`melbourneguitarschool.com.au`)
- Keep existing DB name unchanged

## Important Policy

Production is a low-power VPS deployment using `systemd + nginx + MySQL/MariaDB`.
Docker is local development/testing only and not part of production deployment.

## One-Time Migration Script

Use:

```bash
cd ~/melbourne-guitar-school
sudo ./deploy/guitarschool-to-lessonflow.sh --dry-run
sudo ./deploy/guitarschool-to-lessonflow.sh --execute --branch main
```

Options:

- `--dry-run` (default)
- `--execute`
- `--skip-deploy`
- `--branch <name>`
- `--handoff-timeout-seconds <N>` (`1200` default, `0` disables timeout)
- `--no-color`

## What the Script Does

1. Creates backups under `/var/backups/lessonflow-migration/<timestamp>/`
2. Moves deploy directory to `/var/www/lessonflow`
3. Installs/updates `lessonflow.service`
4. Converts nginx site config and enabled symlink to `lessonflow`
5. Rewrites root crontab to LessonFlow managed block
6. Updates `BACKUP_CLOUD_FOLDER` from `melbourne-guitar-school-backups` to `lessonflow-backups` when present
7. Removes `/home/grahf/melbourne-guitar-school/.maintenance.conf` (after backup)
8. Runs post-migration handoff via `deploy/update.sh` unless `--skip-deploy` is set
   - pulls latest branch changes before deploy
   - runs non-interactively for shared `.env` review prompt
   - suppresses self-update keypress pauses for scripted migration handoff
   - times out stalled handoff runs, captures diagnostics, attempts metadata-lock blocker kill, then retries once

## Troubleshooting: Migration Appears Stuck

Most commonly this is either:

- A DB metadata lock during `prisma migrate deploy`
- Waiting on a self-update/key reload prompt in a previous flow

Run these in a second SSH session:

```bash
ps -ef | rg 'guitarschool-to-lessonflow|update.sh|deploy.sh|prisma'
sudo mysql -e "SHOW FULL PROCESSLIST;"
```

If you see `Waiting for table metadata lock`, kill the blocker:

```bash
sudo mysql -e "KILL <blocking_id>;"
```

Quick check:

```bash
ls -ld /var/www/lessonflow /var/www/lessonflow/current
```

Then rerun deployment (usually no need to rerun one-time migration):

```bash
cd ~/melbourne-guitar-school
git pull --ff-only origin main
sudo ./deploy/update.sh --branch main --allow-dirty --no-spinner
```

If you paste the output of `SHOW FULL PROCESSLIST;`, we can identify the blocking session id.

## Post-Migration Validation

Run:

```bash
sudo systemctl status lessonflow --no-pager
sudo nginx -t
readlink -f /var/www/lessonflow/current
sudo crontab -l | grep /var/www/lessonflow/current/deploy/cron.sh
curl -I https://melbourneguitarschool.com.au
```

## Future Deploys

Continue using:

```bash
cd ~/melbourne-guitar-school
sudo ./deploy/update.sh --branch main --allow-dirty
```

`--allow-dirty` is recommended if the server clone has local untracked files.
