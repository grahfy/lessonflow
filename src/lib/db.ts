/**
 * Primary Database Client - Prisma Singleton
 *
 * Provides a unified Prisma client instance and keeps it stable across
 * development hot reloads to avoid exhausting MySQL connections.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Persists the client across hot-reloads in development.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 300;

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildMariaDbAdapter(databaseUrl: string) {
  const parsedUrl = new URL(databaseUrl);
  if (parsedUrl.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// protocol.");
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  const connectTimeoutSeconds = parsePositiveInteger(parsedUrl.searchParams.get("connect_timeout"));
  const acquireTimeoutSeconds = parsePositiveInteger(parsedUrl.searchParams.get("pool_timeout"));
  const idleTimeoutSeconds = parsePositiveInteger(parsedUrl.searchParams.get("max_idle_connection_lifetime"));
  const connectionLimit = parsePositiveInteger(parsedUrl.searchParams.get("connection_limit"));

  return new PrismaMariaDb({
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : 3306,
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: databaseName,
    connectTimeout: connectTimeoutSeconds ? connectTimeoutSeconds * 1_000 : DEFAULT_CONNECT_TIMEOUT_MS,
    acquireTimeout: acquireTimeoutSeconds ? acquireTimeoutSeconds * 1_000 : DEFAULT_ACQUIRE_TIMEOUT_MS,
    idleTimeout: idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS,
    ...(connectionLimit ? { connectionLimit } : {})
  });
}

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set. Check your .env file.");
}

/**
 * The system-wide Prisma instance.
 * RATIONALE: Prisma ORM v7 relational clients require a driver adapter. We
 * explicitly translate Prisma v6-style MySQL URL tuning into the MariaDB
 * driver config so production keeps the previous connection timeout behavior.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter: buildMariaDbAdapter(connectionString)
});

/**
 * Development-mode persistence logic.
 */
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
