# Prisma MariaDB Adapter Recovery and Upgrade Note

This note documents the production database-access failure observed on `melbourneguitarschool.com.au` on April 10, 2026 and the safest development-side response. It is intended for the technical owner maintaining the deployment and the application data layer.

## Scope

This note covers:

- the production symptom that was observed
- what was verified on the VPS without changing anything
- the most likely root cause
- the recommended development-side fix
- the separate Prisma upgrade path to evaluate after the service is stable

It does not cover routine admin operation or normal end-user support.

## Production Symptom

The deployed application repeatedly failed database work with Prisma driver-adapter pool-acquisition timeouts.

Representative journal output from `lessonflow.service` included:

- `DriverAdapterError: pool timeout: failed to retrieve a connection from pool after 10001ms`
- `(pool connections: active=0 idle=0 limit=10)`

The failures were visible both on general app requests and on the Gmail sync job path.

## What Was Verified

The production host was inspected in read-only mode. No config, service, or code changes were made during diagnosis.

Verified facts:

- `lessonflow.service` was active and serving from `/var/www/lessonflow/current`
- `mysql.service` was active
- the deployed shared environment file was `/var/www/lessonflow/shared/.env`
- the repository checkout on the VPS was `/opt/melbourne-guitar-school`
- the deployed `DATABASE_URL` pointed to the local MySQL service on port `3306`
- the application database credentials were valid
- a direct TCP MySQL login using the deployed app user succeeded
- `SELECT 1` succeeded against the production schema
- MySQL was not connection-saturated at the time of inspection

The important negative findings were:

- this was not a MySQL outage
- this was not a bad username or password
- this was not a missing database
- this was not an obvious `max_connections` or reachability problem

## Current Application Path

The application currently initializes Prisma through the MariaDB driver adapter in [src/lib/db.ts](../src/lib/db.ts):

```ts
import { PrismaClient } from "../generated/prisma/client";
import { createPrismaMariaDbAdapter, getRequiredDatabaseUrl } from "./prisma-mariadb";

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter: createPrismaMariaDbAdapter(getRequiredDatabaseUrl())
});
```

The repo is currently on the Prisma `7.7.0` line in [package.json](../package.json):

- `prisma`: `7.7.0`
- `@prisma/client`: `7.7.0`
- `@prisma/adapter-mariadb`: `7.7.0`

## Most Likely Root Cause

The evidence points at the Prisma MariaDB adapter configuration rather than at the database server itself.

Reasoning:

1. The app can reach MySQL on the expected host and port.
2. The deployed database user can authenticate successfully.
3. The database itself is not exhausted.
4. The failing layer is specifically reporting driver-adapter pool acquisition timeouts while showing zero active and zero idle connections.

This makes the Prisma v7 adapter timeout/configuration path the most likely fault domain.

## Recommended Fix

The safest first fix is to keep the supported Prisma v7 MariaDB adapter path, but explicitly configure it to preserve the older Prisma v6 MySQL timeout behavior before attempting a broader dependency upgrade.

### Recommended Development Changes

1. Keep the schema datasource provider in [prisma/schema.prisma](../prisma/schema.prisma) as plain MySQL:

```prisma
datasource db {
  provider = "mysql"
}
```

In this repo's Prisma 7 setup, the datasource URL is configured in [prisma.config.ts](../prisma.config.ts), not in the schema file:

```ts
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

2. Update the MariaDB adapter construction in [src/lib/db.ts](../src/lib/db.ts) so it normalizes `DATABASE_URL`, preserves MariaDB URL options such as SSL/socket settings, and sets explicit pool timeouts that match Prisma v6-style behavior:

```ts
import { PrismaClient } from "../generated/prisma/client";
import { createPrismaMariaDbAdapter, getRequiredDatabaseUrl } from "./prisma-mariadb";

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter: createPrismaMariaDbAdapter(getRequiredDatabaseUrl())
});
```

3. Preserve Prisma's CLI datasource config in [prisma.config.ts](../prisma.config.ts) so migrations and generate keep reading `DATABASE_URL`.

4. Regenerate the client:

```bash
npm run prisma:generate
```

5. Run the normal verification suite before deploy:

```bash
npm run lint
npm run typecheck
npm run test
```

6. Redeploy and verify:

- `systemctl status lessonflow`
- `journalctl -u lessonflow.service -n 100 --no-pager`
- load `/admin/login`
- load at least one DB-backed admin screen
- confirm Gmail sync no longer logs pool-acquisition failures

## Prisma Upgrade Note

As checked on April 10, 2026, Prisma `7.7.0` is the current line in the repo.

Observed latest versions at check time:

- `prisma`: `7.7.0`
- `@prisma/client`: `7.7.0`
- `@prisma/adapter-mariadb`: `7.7.0`

The repo is already aligned to that latest `7.7.0` release line.

### Recommended Upgrade Order

Do not combine the adapter timeout fix and the Prisma minor upgrade in one unverified production move unless there is a specific reason to do so.

Preferred order:

1. keep the MariaDB adapter path, but restore Prisma v6-style timeouts
2. verify the app is stable again under production load
3. then evaluate the next controlled Prisma update from the `7.7.0` baseline

### If You Still Want To Test Prisma 7.7.0

Update the Prisma packages together:

```bash
npm install prisma@7.7.0 @prisma/client@7.7.0
```

If the adapter path is still being used, update it in lockstep:

```bash
npm install @prisma/adapter-mariadb@7.7.0
```

Then run:

```bash
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
```

If the adapter path is kept during the upgrade test, that test should be treated as higher risk than the timeout-only recovery change.

## Recommended Decision

The recommended action is:

1. keep the Prisma v7 MariaDB adapter path
2. explicitly configure the adapter to match the earlier MySQL timeout behavior
3. restore production stability
4. only then test the Prisma `7.7.0` upgrade

This keeps the recovery change narrow and avoids mixing a connection-pool behavior fix with a dependency refresh in the same recovery step.
