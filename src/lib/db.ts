/**
 * Primary Database Client - Prisma Singleton
 * 
 * Provides a unified connection instance for the MariaDB database. 
 * Managed as a singleton to prevent connection exhaustion.
 * 
 * DESIGN RATIONALE:
 * 1. Connection Singleton: In development, Next.js performs hot module 
 *    replacement (HMR), which can clear local variables and trigger 
 *    the creation of dozens of Prisma clients. We use the `globalThis` 
 *    pattern to persist the client across reloads.
 * 2. Prisma 7 Adapters: We explicitly utilize the `PrismaMariaDb` adapter 
 *    for direct connections, ensuring high-performance native communication 
 *    with the database server.
 * 3. Centralized Lifecycle: All application logic imports from this file, 
 *    ensuring consistent timeout and middleware settings (if added).
 */

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Persists the client across hot-reloads in development.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set. Check your .env file.");
}

/**
 * The system-wide Prisma instance.
 * RATIONALE: Lazy-instantiated on first import.
 */
export const prisma = globalForPrisma.prisma ?? (() => {
  const adapter = new PrismaMariaDb(connectionString);
  return new PrismaClient({ adapter });
})();

/**
 * Development-mode persistence logic.
 */
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
