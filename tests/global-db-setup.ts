/**
 * Vitest global setup/teardown — runs ONCE around the entire DB-backed suite.
 *
 * Wired via `globalSetup` in vitest.config.ts. Vitest invokes the exported
 * `setup` before any test file and `teardown` after the whole run finishes.
 *
 * Safety net for the shared single-runner test database (see tests/AGENTS.md:
 * `fileParallelism` is false and DB suites must run under one runner). The job
 * here is narrow and non-destructive:
 *   1. Refuse to operate unless the target looks like a dedicated test database,
 *      so this never runs against a real environment by accident.
 *   2. Close the shared Prisma connection pool in `teardown` so lingering
 *      connections from individual suites don't accumulate and cause cross-file
 *      pool-timeout flakiness on the next run.
 *
 * It intentionally does NOT delete data: each suite owns its own per-test
 * cleanup (beforeEach/afterEach), and a blanket wipe here would be unsafe while
 * other runners may share the same DB host.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";

/** Heuristic guard: the configured database name must look like a test DB. */
function assertLooksLikeTestDatabase(databaseUrl: string): void {
  let name = "";
  try {
    name = new URL(databaseUrl).pathname.replace(/^\/+/, "");
  } catch {
    name = "";
  }
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run test setup against database "${name || databaseUrl}": ` +
        "the database name must contain 'test'. Point TEST_DATABASE_URL/DATABASE_URL at a dedicated test DB."
    );
  }
}

export async function setup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  // No DB configured (e.g. a pure-unit run) — nothing to guard.
  if (!databaseUrl) {
    return;
  }
  // Fail fast and loudly if pointed anywhere that doesn't look like a test DB.
  assertLooksLikeTestDatabase(databaseUrl);
}

export async function teardown(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    return;
  }

  assertLooksLikeTestDatabase(databaseUrl);

  // Open a short-lived client purely to flush/close the pool cleanly. This
  // ensures the adapter's pooled connections are released so the process can
  // exit without dangling handles after a long DB-backed run.
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
  await prisma.$disconnect();
}
