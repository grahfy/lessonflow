#!/usr/bin/env node

/**
 * Prepares the test database for Vitest runs using the current Prisma schema.
 *
 * The schema provider is MySQL, so tests need a real MySQL-compatible database.
 * We intentionally do not auto-start Docker here because CI/local environments vary.
 * Instead, this script accepts an externally provided test DB URL and runs Prisma
 * migrations against it with a clear error message when configuration is missing.
 */

const { spawnSync } = require("node:child_process");

/**
 * Prints a short setup guide that works without installing MySQL directly on the host.
 */
function printSetupHelp() {
  console.error("");
  console.error("Test DB setup required: provide a MySQL test database URL.");
  console.error("");
  console.error("Recommended (Docker, no host MySQL install):");
  console.error("  docker run --name mgs-test-mysql \\");
  console.error("    -e MYSQL_ROOT_PASSWORD=root \\");
  console.error("    -e MYSQL_DATABASE=mgs_test \\");
  console.error("    -p 3307:3306 -d mysql:8");
  console.error("");
  console.error("  export TEST_DATABASE_URL='mysql://root:root@127.0.0.1:3307/mgs_test'");
  console.error("  npm run test:prepare");
  console.error("");
  console.error("You can also point TEST_DATABASE_URL to a remote/dev MySQL instance.");
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  printSetupHelp();
  process.exit(1);
}

if (!/^mysql:\/\//i.test(testDatabaseUrl)) {
  console.error("Invalid test DB URL: Prisma schema provider is MySQL, so the URL must start with mysql://");
  console.error("Received:", testDatabaseUrl);
  process.exit(1);
}

if (!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL) {
  console.warn("Warning: using DATABASE_URL for tests. Prefer TEST_DATABASE_URL to avoid targeting the wrong database.");
}

const prismaEnv = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl
};

/**
 * Runs a Prisma CLI command with the test DB URL injected.
 * Returns the spawn result for status/error handling.
 */
function runPrisma(args) {
  return spawnSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    env: prismaEnv
  });
}

const generateResult = runPrisma(["generate"]);
if (generateResult.error) {
  console.error("Failed to run Prisma generate:", generateResult.error.message);
  process.exit(1);
}
if (generateResult.status !== 0) {
  process.exit(generateResult.status ?? 1);
}

const migrateResult = runPrisma(["migrate", "deploy"]);

if (migrateResult.error) {
  console.error("Failed to run Prisma migrate deploy:", migrateResult.error.message);
  process.exit(1);
}

if (migrateResult.status === 0) {
  process.exit(0);
}

const allowDbPushFallback = process.env.TEST_DB_PREPARE_ALLOW_DB_PUSH_FALLBACK !== "0";
if (!allowDbPushFallback) {
  process.exit(migrateResult.status ?? 1);
}

console.warn("");
console.warn("test:prepare fallback: prisma migrate deploy failed for the test database.");
console.warn("Attempting `prisma db push` for ephemeral test DB bootstrap.");
console.warn("Set TEST_DB_PREPARE_ALLOW_DB_PUSH_FALLBACK=0 to disable this fallback.");
console.warn("");

const dbPushResult = runPrisma(["db", "push"]);
if (dbPushResult.error) {
  console.error("Failed to run Prisma db push fallback:", dbPushResult.error.message);
  process.exit(1);
}

process.exit(dbPushResult.status ?? 1);
