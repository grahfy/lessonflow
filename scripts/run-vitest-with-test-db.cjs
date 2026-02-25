#!/usr/bin/env node

/**
 * Runs Vitest with DATABASE_URL pointed at the test database URL so Prisma-based
 * tests do not accidentally connect to the app's default .env database.
 */

const { spawnSync } = require("node:child_process");

const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  console.error("Missing TEST_DATABASE_URL (or DATABASE_URL) for Vitest run.");
  process.exit(1);
}

const args = process.argv.slice(2);

const result = spawnSync("npx", ["vitest", ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl
  }
});

if (result.error) {
  console.error("Failed to run Vitest:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

