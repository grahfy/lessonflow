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

// Vitest/test helpers usually read DATABASE_URL, so map the explicit test URL to
// that variable only for the child process instead of mutating the parent shell.
const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vitest", ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    // The geo/country tests simulate an edge-fronted (Vercel) deployment by
    // sending x-vercel-ip-country headers. Production no longer trusts those
    // headers unless TRUST_EDGE_GEO is set, so enable it for the suite here.
    TRUST_EDGE_GEO: process.env.TRUST_EDGE_GEO ?? "vercel"
  }
});

if (result.error) {
  console.error("Failed to run Vitest:", result.error.message);
  process.exit(1);
}

// Preserve Vitest's exit code so CI/local shells reflect test pass/fail status.
process.exit(result.status ?? 1);
