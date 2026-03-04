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
