# Action Log: Prisma Upgrade (6.19.2 -> 7.4.2)

## [2026-03-02] Initialization
- Initialized Action Log.
- Starting Phase 1: Preparation.
- [Phase 1] Identified 21 files importing from @prisma/client.
- [Phase 1] Identified 4 files instantiating new PrismaClient().
- [Phase 1] Verified MySQL accessibility via `npx prisma -v`.
- Phase 1 Complete.

## [2026-03-02] Phase 2: Dependency Update
- Starting Phase 2: Dependency Update.
- Updated `prisma` and `@prisma/client` to 7.4.2.
- Installed `@prisma/adapter-mariadb` and `mariadb` (as `@prisma/adapter-mysql` does not exist).
- Ran `npm install`.
- Phase 2 Complete.

## [2026-03-02] Phase 3: Schema & Configuration
- Starting Phase 3: Schema & Configuration.
- Updated `prisma/schema.prisma` to use `prisma-client` provider and explicit output path.
- Installed `dotenv` to `devDependencies`.
- Created `prisma.config.ts` to manage CLI configuration and environment variables.
- Phase 3 Complete.

## [2026-03-02] Phase 4: Core Refactoring - Database Singleton
- Starting Phase 4: Core Refactoring - Database Singleton.
- Identified that `url` is no longer supported in `schema.prisma` datasource block.
- Removed `url` from `prisma/schema.prisma`.
- Refactored `src/lib/db.ts` to use `mariadb` connection pool and `PrismaMariaDb` adapter.
- Updated `PrismaClient` instantiation to use the adapter and point to the new generated path.
- Phase 4 Complete.

## [2026-03-02] Phase 5: Client Generation
- Starting Phase 5: Client Generation.
- Successfully ran `npx prisma generate`.
- Client generated in `src/generated/prisma`.
- Phase 5 Complete.

## [2026-03-02] Phase 6: Global Code Migration
- Starting Phase 6: Global Code Migration.
- Updated all imports from `@prisma/client` to `@/generated/prisma` in `src/` using `sed`.
- Refactored `scripts/seed-invoice-presets.ts` to use `mariadb` adapter and `tsx`.
- Refactored `scripts/reset-admin-password.sh` to use `npx tsx` and `mariadb` adapter for its embedded scripts.
- Renamed `scripts/seed-docs-screenshots.cjs` to `.ts`, refactored for Prisma 7, and updated `package.json`.
- Updated `scripts/prepare-test-db.cjs` to remove deprecated `--skip-generate` flag.
- Added `tsx` to `devDependencies`.
- Added `src/generated/prisma/` to `.gitignore`.
- Phase 6 Complete.

## [2026-03-02] Phase 7: Database & Migration Compatibility
- Starting Phase 7: Database & Migration Compatibility.
- Successfully ran `npx prisma migrate dev`. Database already in sync.
- Phase 7 Complete.

## [2026-03-02] Phase 8: Verification & Testing
- Starting Phase 8: Verification & Testing.
- Ran `npm run typecheck`. Fixed missing `index.ts` in generated directory and updated imports to use `/client` suffix.
- Fixed `src/lib/db.ts` and scripts to pass `connectionString` directly to `PrismaMariaDb` adapter.
- Fixed 3 test failures in `tests/admin-customers.test.ts`, `tests/admin-invoice-reminders.test.ts`, and `tests/admin-manual-booking-customer-match.test.ts` (uncovered bugs or data mismatches).
- All Vitest integration tests passed (82/82).
- Successfully ran `npm run build`. Next.js production build confirmed compatible with Wasm-based Prisma client.
- Verified `npx prisma studio` starts correctly.
- Phase 8 Complete.

## [2026-03-02] Phase 9: Cleanup
- Updated `.gitignore` to include `src/generated/prisma/`.
- Project Complete.

## [2026-03-02] Phase 10: Deployment Script Enhancements
- Starting Phase 10: Add `update_prisma` section to `deploy/deploy.sh`.
- Created `update_prisma()` helper function in `deploy/deploy.sh`.
- Moved `run_migrations()` to the helper section.
- Integrated `update_prisma()` into the main deployment flow.
- Added 'D' action to the interactive TUI for manual Prisma updates.
- Verified script syntax and logic.
- Phase 10 Complete.

## [2026-03-02] Phase 11: Conditional Prisma Updates
- Starting Phase 11: Implement conditional execution for `update_prisma`.
- Implemented `needs_update` logic using `src/generated/prisma` existence check and `git diff` against `prisma/` and `package.json`.
- Ensured `DB_PUSH` and manual TUI actions still trigger the update.
- Phase 11 Complete.

## [2026-03-02] Phase 12: Update Script Enhancements
- Starting Phase 12: Add Prisma update support to `deploy/update.sh`.
- Added `--update-prisma` flag to `deploy/deploy.sh` for targeted ORM updates.
- Implemented `update_prisma_from_update` delegate in `deploy/update.sh`.
- Added 'D' action to `update.sh` TUI for manual Prisma updates.
- Verified cross-script delegation logic.
- Phase 12 Complete.
