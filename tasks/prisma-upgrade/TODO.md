# TODO: Prisma Upgrade (6.19.2 -> 7.4.2)

## 1. Preparation
- [x] Identify all files importing from `@prisma/client` `[backend]` [parallel]
- [x] Identify all files instantiating `new PrismaClient()` `[backend]` [parallel]
- [x] Verify local MySQL environment accessibility `[database]`

## 2. Dependency Update `[infra]`
- [x] Update `prisma` to `7.4.2` in `devDependencies`
- [x] Update `@prisma/client` to `7.4.2` in `dependencies`
- [x] Install `@prisma/adapter-mariadb` and `mariadb` as `dependencies`
- [x] Run `npm install`

## 3. Schema & Configuration `[database]`
- [x] Update `prisma/schema.prisma`
  - [x] Change `generator client` provider to `"prisma-client"`
  - [x] Add `output = "../src/generated/prisma"`
- [x] Create `prisma.config.ts` in project root
  - [x] Configure `defineConfig` with schema path and datasource URL

## 4. Core Refactoring - Database Singleton `[backend]`
- [x] Refactor `src/lib/db.ts`
  - [x] Set up `mariadb` connection pool
  - [x] Configure `PrismaMariaDb` adapter
  - [x] Update `PrismaClient` instantiation to use the adapter
  - [x] Update imports to point to `../generated/prisma`

## 5. Client Generation `[database]`
- [x] Run `npx prisma generate`

## 6. Global Code Migration `[backend]`
- [x] Update application imports from `@prisma/client` to `@/generated/prisma`
- [x] Update utility scripts `[scripts]` [parallel]
  - [x] Update `scripts/seed-invoice-presets.ts`
  - [x] Update `scripts/reset-admin-password.sh`
  - [x] Update `scripts/seed-docs-screenshots.ts` (renamed from .cjs)
  - [x] Update `scripts/prepare-test-db.cjs` (remove deprecated CLI flags)

## 7. Database & Migration Compatibility `[database]`
- [x] Run `npx prisma migrate dev`

## 8. Verification & Testing `[test]`
- [x] Run `npm run typecheck`
- [x] Run `npm test` (Vitest integration tests)
- [x] Run `npm run build` (Next.js production build)
- [x] Verify `npx prisma studio` functionality

## 9. Cleanup `[infra]`
- [x] Remove any temporary files
- [x] Update `.gitignore` to handle `src/generated/prisma` if necessary

## 10. Deployment Script Enhancements `[infra]`
- [x] Add `update_prisma` section to `deploy/deploy.sh`
  - [x] Consolidate generate and migrate logic
  - [x] Add TUI action for manual Prisma updates
- [x] Implement conditional execution for `update_prisma`
  - [x] Skip if no schema/migration/dependency changes detected
  - [x] Use git diff for detection
- [x] Add Prisma update support to `deploy/update.sh`
  - [x] Add `update_prisma` delegate helper
  - [x] Add TUI action for manual Prisma updates
