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

function resolveTestDatabaseUrl() {
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
