# Plan: Production Upgrade Safety Audit (Melbourne Guitar School)

**Goal:** Verify that upgrading the production server at `melbourneguitarschool.com.au` to the new modularized LessonFlow version will cause zero data loss and zero visible changes to the existing branding.

## Step 1: Remote Environment Audit
- **Action:** Connect to the server via SSH.
- **Verification points:**
    - Confirm the application is currently at `/var/www/melbourne-guitar-school`.
    - Verify the systemd service is named `melbourne-guitar-school.service`.
    - Check for Nginx config paths in `/etc/nginx/sites-enabled/`.
    - Inspect the current crontab for the `# BEGIN MELBOURNE_GUITAR_SCHOOL_MANAGED_CRON` marker.
    - Confirm the existence and location of the `.env` file and `data/` folder (learning materials).

## Step 2: Migration Logic Cross-Reference
- **Action:** CompareDiscoveries from Step 1 against `deploy/deploy.sh`.
- **Verification points:**
    - Ensure `check_legacy_migration` accurately targets the discovered paths.
    - Confirm the Nginx cleanup logic targets the correct site filenames.
    - Verify the crontab marker replacement logic matches the server's existing markers.

## Step 3: Data Preservation & .env Safety
- **Action:** Audit the `.env` merging logic.
- **Verification points:**
    - Confirm that `ensure_shared_env_file` correctly reads the existing `shared/.env` and only appends new keys, never overwriting existing database or secret values.
    - Verify that the directory rename (`mv`) ensures `shared/data/` (student files) remains intact and accessible under the new path.

## Step 4: Database & Code Fallback Verification
- **Action:** Review Prisma migrations and branding fallbacks.
- **Verification points:**
    - Confirm `npx prisma migrate deploy` only adds new tables (`PublicPageContent`, `EmailTemplate`, `InvoiceTemplate`) and does not modify existing student/invoice schemas.
    - Verify that `src/lib/branding.ts` fallbacks are identical to the current production branding.
    - Confirm `seed-whitelabel-defaults.ts` correctly populates the new tables with the current MGS content.

## Step 5: Rollback Strategy Confirmation
- **Action:** Define a recovery plan.
- **Verification points:**
    - Ensure that if the update fails, we can manually rename the directory back and restore the old service to bring the site back online instantly.

## Verification Criteria
- All remote paths and service names are identified.
- Migration logic is verified to match these exact paths.
- Code fallbacks are confirmed to match current production branding.
- A manual "emergency undo" procedure is documented in the ACT log.
