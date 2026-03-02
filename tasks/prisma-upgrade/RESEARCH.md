# Research: Prisma Upgrade (6.19.2 -> 7.4.2)

## Overview
Upgrading Prisma to version 7.4.2 involves a major architectural transition. The query engine has been rewritten from Rust to TypeScript/WebAssembly, resulting in smaller bundles but requiring significant configuration changes.

## Key Findings

### 1. Rust-Free Architecture
- Prisma 7 eliminates the Rust-based query engine binary.
- This reduces bundle size significantly (approx. 90% smaller).
- It improves compatibility with edge/serverless runtimes.

### 2. Mandatory Driver Adapters
- Prisma 7 **requires** explicit driver adapters for database connections in standard Node.js environments.
- **MySQL Requirements:**
    - `@prisma/adapter-mysql`
    - `mysql2`
- **Connection Pattern:**
    ```typescript
    import { mysql } from 'mysql2';
    import { PrismaMySQL } from '@prisma/adapter-mysql';
    import { PrismaClient } from '../generated/prisma';

    const pool = mysql.createPool(process.env.DATABASE_URL);
    const adapter = new PrismaMySQL(pool);
    const prisma = new PrismaClient({ adapter });
    ```

### 3. New Generator: `prisma-client`
- The old `prisma-client-js` provider is deprecated.
- The new `prisma-client` provider is required.
- **Explicit Output Path:** You must specify an `output` directory in `schema.prisma`. It no longer defaults to `node_modules`.
    ```prisma
    generator client {
      provider = "prisma-client"
      output   = "../src/generated/prisma"
    }
    ```

### 4. Configuration: `prisma.config.ts`
- Introduced a new centralized configuration file for the Prisma CLI.
- Prisma CLI no longer automatically loads `.env` files; this must be handled in `prisma.config.ts`.
- Recommended structure:
    ```typescript
    import { defineConfig } from 'prisma/config';

    export default defineConfig({
      schema: 'prisma/schema.prisma',
      datasource: {
        url: process.env.DATABASE_URL,
      },
    });
    ```

### 5. ESM Support
- Prisma 7 client is ESM-only.
- The project currently does not have `"type": "module"` in `package.json`.
- Next.js (App Router) can handle ESM imports from the generated client, but local scripts might need attention.

### 6. CLI Changes
- `--skip-generate` and `--skip-seed` flags have been removed from `prisma migrate dev`.
- This affects `scripts/prepare-test-db.cjs`.

### 7. Feature Removals
- `prisma.$use()` (Middleware) has been removed. (Codebase search confirms this is not used in this project).
- Metrics feature has been removed.

## Dependencies to Add
- `@prisma/adapter-mysql`
- `mysql2`

## Files to Modify
- `package.json`: Update `prisma`, `@prisma/client`, add new dependencies.
- `prisma/schema.prisma`: Update generator block.
- `src/lib/db.ts`: Refactor connection singleton.
- `scripts/prepare-test-db.cjs`: Remove deprecated CLI flags.
- **Global:** Update all imports from `@prisma/client` to `@/generated/prisma` (or relative path).

## Environment Requirements
- **Node.js:** 20.19.0+ (Currently v22.22.0 - OK)
- **TypeScript:** 5.4.0+ (Currently 5.9.3 - OK)
