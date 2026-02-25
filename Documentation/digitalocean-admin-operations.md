# DigitalOcean Droplet Admin Operations Runbook

This runbook covers production operation of the admin system on a DigitalOcean Droplet using:
- `systemd` for process management
- `Nginx` for reverse proxy + HTTPS termination
- `cron` or `systemd` timers for scheduled jobs
- MySQL for the application database
- Local persistent filesystem storage for learning materials

## 1. Process Management (`systemd`)

Example unit file (`/etc/systemd/system/mgs-web.service`):

```ini
[Unit]
Description=Melbourne Guitar School Web App
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/srv/melbourne_guitar_school_website
Environment=NODE_ENV=production
EnvironmentFile=/srv/melbourne_guitar_school_website/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mgs-web
sudo systemctl status mgs-web
sudo journalctl -u mgs-web -f
```

## 2. Reverse Proxy (`Nginx`) Requirements

Use HTTPS termination and forward client IP headers so login rate limiting sees the correct IP.

Example location block:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;

  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Notes:
- `X-Real-IP` is preferred by the app for rate limiting.
- HTTPS is required for secure admin cookies in production.

## 3. Scheduled Jobs on a Droplet

The app exposes HTTP endpoints protected by `x-cron-secret`:
- `POST /api/jobs/daily-bookings-digest`
- `POST /api/jobs/invoice-reminders`

### Option A: `cron`

Use `curl` with `x-cron-secret`:

```bash
# 8:00 PM daily (server time)
0 20 * * * curl -fsS -X POST \
  -H "x-cron-secret: ${CRON_SECRET}" \
  https://your-domain.example/api/jobs/daily-bookings-digest >/var/log/mgs-daily-digest.log 2>&1

# 8:30 PM daily (server time)
30 20 * * * curl -fsS -X POST \
  -H "x-cron-secret: ${CRON_SECRET}" \
  https://your-domain.example/api/jobs/invoice-reminders >/var/log/mgs-invoice-reminders.log 2>&1
```

If running from root/system cron, ensure `CRON_SECRET` is available (or inline the secret carefully and protect file permissions).

### Option B: `systemd` timer (recommended)

Service example (`/etc/systemd/system/mgs-invoice-reminders.service`):

```ini
[Unit]
Description=Run invoice reminder job for Melbourne Guitar School

[Service]
Type=oneshot
EnvironmentFile=/srv/melbourne_guitar_school_website/.env
ExecStart=/usr/bin/curl -fsS -X POST \
  -H x-cron-secret:${CRON_SECRET} \
  https://your-domain.example/api/jobs/invoice-reminders
```

Timer example (`/etc/systemd/system/mgs-invoice-reminders.timer`):

```ini
[Unit]
Description=Schedule invoice reminder job

[Timer]
OnCalendar=*-*-* 20:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

Commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mgs-invoice-reminders.timer
sudo systemctl list-timers | grep mgs-
```

Repeat for daily bookings digest at `20:00`.

## 4. Restart After Setup/Env Changes

The setup UI writes `.env` but does not restart the process automatically.
After saving environment config in `/setup` (or manually editing `.env`), restart the app service:

```bash
sudo systemctl restart mgs-web
sudo systemctl status mgs-web
```

Then re-run setup checks and verify admin login.

## 5. Learning Materials Local Storage (Persistent Filesystem)

If using `LEARNING_MATERIALS_STORAGE_DRIVER=local`, ensure the configured root path is:
- persistent across deploys/restarts
- writable by the app service user
- backed up according to your retention policy

Example:

```bash
sudo mkdir -p /srv/mgs-data/learning-materials
sudo chown -R www-data:www-data /srv/mgs-data
sudo chmod -R 750 /srv/mgs-data
```

Set in `.env`:

```dotenv
LEARNING_MATERIALS_STORAGE_DRIVER="local"
LEARNING_MATERIALS_LOCAL_ROOT="/srv/mgs-data/learning-materials"
```

## 6. Smoke Verification (Droplet)

After deploy/restart:
1. Open `/admin/login` and confirm login works over HTTPS.
2. Load `/admin/bookings` and `/admin/invoices`.
3. Trigger each scheduled job endpoint manually with `curl` + `x-cron-secret`.
4. Confirm learning-material upload/download/delete works if enabled.
5. Review service logs (`journalctl`) and Nginx logs for errors.
