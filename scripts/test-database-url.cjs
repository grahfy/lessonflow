/**
 * Resolves the test database URL, optionally per-agent via TEST_DB_SUFFIX.
 *
 * WHY: several agents sharing one `mgs_test` produce phantom failures — two
 * concurrent runs `deleteMany()` each other's fixtures mid-test, which surfaced
 * once as 31 failures across 17 unrelated files and cost a full debugging cycle.
 * `fileParallelism: false` only serialises files inside ONE run, so it does not
 * help. Setting TEST_DB_SUFFIX gives a run its own database and removes the
 * contention entirely; unset, behaviour is unchanged.
 *
 * Both `test:prepare` and the Vitest runner resolve through here so they cannot
 * disagree about which database is being migrated versus tested.
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Loads the repo's test env files so a checkout that already has
 * `.env.test.local` does not additionally require exporting TEST_DATABASE_URL
 * by hand. Without this the setup help fires while the answer is sitting in a
 * committed-by-convention file two lines away, which reads as "the test DB is
 * broken" rather than "the variable is not exported".
 *
 * `override: false` (dotenv's default, stated explicitly because it is the whole
 * point) keeps an exported TEST_DATABASE_URL — and therefore TEST_DB_SUFFIX
 * per-agent runs — authoritative over the file.
 */
let envFilesLoaded = false;
function loadTestEnvFiles() {
  if (envFilesLoaded) {
    return;
  }
  envFilesLoaded = true;

  for (const file of [".env.test.local", ".env.test"]) {
    const fullPath = path.resolve(__dirname, "..", file);
    if (fs.existsSync(fullPath)) {
      require("dotenv").config({ path: fullPath, override: false });
    }
  }
}

function resolveTestDatabaseUrl() {
  loadTestEnvFiles();
  const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  // Anything outside [A-Za-z0-9_] is dropped rather than escaped — this lands in
  // a database name, so a bad value should fail obviously, not creatively.
  const suffix = (process.env.TEST_DB_SUFFIX || "").replace(/[^A-Za-z0-9_]/g, "");
  if (!base || !suffix) {
    return base;
  }

  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}_${suffix}`;
  return url.toString();
}

module.exports = { resolveTestDatabaseUrl };
