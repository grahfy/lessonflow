import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const DEFAULT_CONNECT_TIMEOUT_SECONDS = 5;
const DEFAULT_ACQUIRE_TIMEOUT_SECONDS = 10;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 300;
const DEFAULT_CONNECTION_LIMIT = 25;
const DEFAULT_ALLOW_PUBLIC_KEY_RETRIEVAL = "true";

function ensurePositiveIntegerParam(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0;
}

/**
 * Validates and normalizes the Prisma/MySQL connection string used by the
 * MariaDB adapter while preserving any MariaDB-specific URL options that the
 * driver already understands, such as SSL or Unix socket settings.
 */
export function normalizePrismaMariaDbConnectionString(databaseUrl: string): string {
  const trimmed = databaseUrl.trim();
  if (!trimmed) {
    throw new Error("DATABASE_URL environment variable is not set. Check your .env file.");
  }

  const parsedUrl = new URL(trimmed);
  if (parsedUrl.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// protocol.");
  }

  const databaseName = parsedUrl.pathname.replace(/^\/+/, "");
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  if (!ensurePositiveIntegerParam(parsedUrl.searchParams.get("connect_timeout"))) {
    parsedUrl.searchParams.set("connect_timeout", String(DEFAULT_CONNECT_TIMEOUT_SECONDS));
  }

  if (!ensurePositiveIntegerParam(parsedUrl.searchParams.get("pool_timeout"))) {
    parsedUrl.searchParams.set("pool_timeout", String(DEFAULT_ACQUIRE_TIMEOUT_SECONDS));
  }

  if (!ensurePositiveIntegerParam(parsedUrl.searchParams.get("max_idle_connection_lifetime"))) {
    parsedUrl.searchParams.set("max_idle_connection_lifetime", String(DEFAULT_IDLE_TIMEOUT_SECONDS));
  }

  // RATIONALE: Increase pool limit from default (10) to handle higher concurrency
  // for background synchronization tasks and multiple admin sessions.
  // We set both Prisma-style and MariaDB-driver-style parameters.
  if (!ensurePositiveIntegerParam(parsedUrl.searchParams.get("connection_limit"))) {
    parsedUrl.searchParams.set("connection_limit", String(DEFAULT_CONNECTION_LIMIT));
  }

  if (!ensurePositiveIntegerParam(parsedUrl.searchParams.get("connectionLimit"))) {
    parsedUrl.searchParams.set("connectionLimit", String(DEFAULT_CONNECTION_LIMIT));
  }

  // RATIONALE: MySQL 8 defaults users to the `caching_sha2_password` auth
  // plugin. After a MySQL restart flushes the server-side auth cache, a fresh
  // connection must complete *full* authentication, which over a non-TLS TCP
  // socket requires fetching the server's RSA public key. The MariaDB driver
  // refuses to do this unless `allowPublicKeyRetrieval` is enabled, so without
  // it every connection attempt hangs until the acquire timeout and the app
  // reports "pool timeout (active=0 idle=0)" with the database unreachable
  // (observed in production after a MySQL restart; the app could not reconnect
  // until the process was restarted). Default it on so the pool re-establishes
  // automatically after a database restart. Callers can still override it via
  // DATABASE_URL, and it has no effect when SSL or a Unix socket is used.
  if (!parsedUrl.searchParams.has("allowPublicKeyRetrieval")) {
    parsedUrl.searchParams.set("allowPublicKeyRetrieval", DEFAULT_ALLOW_PUBLIC_KEY_RETRIEVAL);
  }

  return parsedUrl.toString();
}

/**
 * Returns a validated connection string from the current process environment.
 */
export function getRequiredDatabaseUrl(): string {
  return normalizePrismaMariaDbConnectionString(process.env.DATABASE_URL ?? "");
}

/**
 * Shared Prisma MariaDB adapter factory for app runtime and standalone scripts.
 */
export function createPrismaMariaDbAdapter(databaseUrl: string) {
  return new PrismaMariaDb(normalizePrismaMariaDbConnectionString(databaseUrl));
}
