## Manual Migration & Rollback Guide

### Emergency Rollback (If update fails)
If the migration runs but the app fails to start, follow these steps to restore the old version:

1. **Rename Directory Back:**
   ```bash
   sudo mv /var/www/lessonflow /var/www/melbourne-guitar-school
   ```
2. **Restore Old Service:**
   ```bash
   sudo systemctl stop lessonflow.service
   sudo systemctl disable lessonflow.service
   sudo systemctl enable melbourne-guitar-school.service
   sudo systemctl start melbourne-guitar-school.service
   ```
3. **Restore Nginx Symlink:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/melbourne-guitar-school /etc/nginx/sites-enabled/melbourne-guitar-school
   sudo rm /etc/nginx/sites-enabled/lessonflow
   sudo nginx -t && sudo systemctl reload nginx
   ```

### Manual Migration (If auto-detection is skipped)
If you need to trigger the rename manually:
```bash
sudo mv /var/www/melbourne-guitar-school /var/www/lessonflow
# Then run the new deploy script to install the new service and nginx configs
```

## 2026-03-02: Step 2 - Script Logic Sync & Resiliency
- **Action:** Updated `backup.sh`, `cron.sh`, and `maintenance.sh` with path-resiliency logic.
- **Improvement:** These scripts now automatically detect if they are running in a legacy `/var/www/melbourne-guitar-school` or new `/var/www/lessonflow` environment and adjust their internal paths accordingly.
- **Verification:** Unit tests passed, confirming "Melbourne Guitar School" remains the default branding until configured otherwise.
