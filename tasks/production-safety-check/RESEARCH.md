# Research: Production Upgrade Safety Verification

## Objective
Verify the production environment at `melbourneguitarschool.com.au` and ensure that the new modularized version of LessonFlow can be deployed without any data loss or visible branding changes.

## 1. Remote Server Audit Findings
The following states were verified on the remote server (`grahf@melbourneguitarschool.com.au`):

- **Deployment Directory:** `/var/www/melbourne-guitar-school` (Verified exists).
- **Systemd Service:** `melbourne-guitar-school.service` (Verified active and running).
- **Nginx Configuration:** `/etc/nginx/sites-enabled/melbourne-guitar-school` (Verified exists).
- **Crontab Status:** No managed cron block (`# BEGIN ...`) found in the current crontab. This means the migration script's strip logic will correctly skip this step without error.
- **Ownership:** Files are owned by `www-data:www-data`.

## 2. Implementation Gap Analysis (CRITICAL)
Upon reviewing the local `deploy/deploy.sh`, I identified a regression in the migration logic caused by the global rename in the previous step:

- **Migration Trigger Bug:** In `check_legacy_migration()`, the variable `legacy_name` was renamed to `"lessonflow"`. This is incorrect. It **must** be `"melbourne-guitar-school"` to detect the existing installation.
- **Service Handoff:** The script correctly handles stopping the old service if the directory is migrated.
- **Nginx Cleanup:** The script correctly removes the old Nginx symlink if found.

## 3. Data Integrity & Branding Fallbacks
- **Preservation:** The `mv` command in the migration logic preserves all files, including `shared/.env` (credentials) and `shared/data/` (student files).
- **Branding:** `src/lib/branding.ts` correctly defaults to "Melbourne Guitar School" and "Guitar".
- **SEO:** The new placeholder system in `src/lib/seo.ts` will use these branding defaults, ensuring search engine results remain consistent.
- **CMS Seeding:** The `seed-whitelabel-defaults.ts` script will ensure the new database tables are populated with the current MGS content on the first deploy.

## 4. Conclusion & Recommendation
The upgrade is safe **provided the migration trigger bug is fixed**. All other aspects of the modularization preserve the existing data and identity of the Melbourne Guitar School deployment.

I recommend proceeding to the planning phase to fix the identified bug and document the final verification checklist.
