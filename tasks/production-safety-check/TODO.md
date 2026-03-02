# TODO: Production Upgrade Safety Verification

## 1. Critical Migration Bug Fix [devops]
- [x] **Fix `deploy/deploy.sh` Migration Trigger** [devops]
  - [x] Restore `legacy_name="melbourne-guitar-school"` in `check_legacy_migration()`.
  - [x] Verify `legacy_service` and `legacy_nginx` paths are correct.
- [x] **Fix `deploy/update.sh` Migration Trigger** [devops]
  - [x] Verified `update.sh` delegates to `deploy.sh` for migration.

## 2. Script Logic Sync [devops]
- [x] **Verify `deploy/backup.sh`** [devops]
  - [x] Implemented path-resiliency for legacy/new paths.
- [x] **Verify `deploy/cron.sh`** [devops]
  - [x] Implemented path-resiliency for legacy/new paths.
- [x] **Verify `deploy/maintenance.sh`** [devops]
  - [x] Implemented path-resiliency for legacy/new paths.

## 3. Local Branding & Fallback Validation [test]
- [x] **Rerun Whitelabel Tests** [test]
  - [x] `npx vitest tests/whitelabel-config.test.ts`
  - [x] `npx vitest tests/email-templates.test.ts`
- [x] **Verify Default Images** [frontend]
  - [x] Confirmed `src/lib/branding.ts` uses current MGS assets.

## 4. Production Upgrade Finalization [devops]
- [x] **Document "Manual Undo" Procedure** [docs]
  - [x] Guide added to `ACT.md`.
- [x] **Final Pre-Flight Check** [audit]
  - [x] Grep audit performed; "example.com" only remains in example placeholders.
