import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const DEFAULT_CONNECT_TIMEOUT_SECONDS = 5;
const DEFAULT_ACQUIRE_TIMEOUT_SECONDS = 10;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 300;

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
