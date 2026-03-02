# Plan: Upgrade Prisma from 6.19.2 to 7.4.2

Upgrade Prisma to version 7.4.2, adopting the new Rust-free architecture, the `prisma-client` generator, and the required MySQL driver adapter.

## 1. Preparation
- [ ] Create task directory `tasks/prisma-upgrade/`. (Completed)
- [ ] Identify all files importing from `@prisma/client`.
- [ ] Identify all files instantiating `new PrismaClient()`.
- [ ] Ensure local MySQL environment is available for testing.

## 2. Dependency Update
- [ ] Update `prisma` to `7.4.2` in `devDependencies`.
- [ ] Update `@prisma/client` to `7.4.2` in `dependencies`.
- [ ] Install `@prisma/adapter-mysql` and `mysql2` as `dependencies`.
- [ ] Run `npm install`.

## 3. Schema & Configuration
- [ ] Update `prisma/schema.prisma`:
    - [ ] Change `generator client` provider to `"prisma-client"`.
    - [ ] Add `output = "../src/generated/prisma"` to the generator block.
- [ ] Create `prisma.config.ts` in the project root to manage database connection settings for the Prisma CLI.

## 4. Code Refactoring
- [ ] Refactor `src/lib/db.ts`:
    - [ ] Import `PrismaClient` from `../generated/prisma`.
    - [ ] Import `PrismaMySQL` from `@prisma/adapter-mysql`.
    - [ ] Import `mysql` from `mysql2`.
    - [ ] Set up a `mysql2` connection pool.
    - [ ] Instantiate `PrismaClient` using the `PrismaMySQL` adapter.
    - [ ] Maintain the singleton pattern for development hot-reloads.
- [ ] Update all application files to import types and the Prisma singleton from `@src/generated/prisma` instead of `@prisma/client`.
- [ ] Update utility scripts to use the new connection pattern:
    - [ ] `scripts/seed-invoice-presets.ts`
    - [ ] `scripts/reset-admin-password.sh`
    - [ ] `scripts/seed-docs-screenshots.cjs`
- [ ] Update `scripts/prepare-test-db.cjs` to ensure it works with Prisma 7 CLI.

## 5. Client Generation & Database
- [ ] Run `npx prisma generate` to generate the new client in `src/generated/prisma`.
- [ ] Run `npx prisma migrate dev` to ensure the schema and migration tool are compatible.

## 6. Verification & Testing
- [ ] Run `npm run typecheck` to verify type safety across the project.
- [ ] Run `npm test` to run Vitest integration tests.
- [ ] Run `npm run build` to ensure the Wasm-based client works in the Next.js build pipeline.
- [ ] Verify `npx prisma studio` still functions correctly.

## 7. Cleanup
- [ ] Remove any temporary files.
- [ ] Ensure `src/generated/prisma` is properly handled (usually ignored by git if it's strictly generated, but since it's now in `src/`, check `.gitignore`).
