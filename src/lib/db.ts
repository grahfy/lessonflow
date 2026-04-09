/**
 * Primary Database Client - Prisma Singleton
 *
 * Provides a unified Prisma client instance and keeps it stable across
 * development hot reloads to avoid exhausting MySQL connections.
 */
import { PrismaClient } from "../generated/prisma/client";
import { createPrismaMariaDbAdapter, getRequiredDatabaseUrl } from "./prisma-mariadb";

/**
 * Persists the client across hot-reloads in development.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};
const connectionString = getRequiredDatabaseUrl();

/**
 * The system-wide Prisma instance.
 * RATIONALE: Prisma ORM v7 relational clients require a driver adapter. We
 * normalize the connection string once so runtime and standalone scripts share
 * the same timeout defaults while still preserving MariaDB URL options such as
 * SSL and Unix socket settings.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter: createPrismaMariaDbAdapter(connectionString)
});

/**
 * Development-mode persistence logic.
 */
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
