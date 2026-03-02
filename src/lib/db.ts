/**
 * Database Client - Prisma Singleton
 * 
 * This module provides a singleton instance of the Prisma ORM client for database
 * operations throughout the Melbourne Guitar School application.
 * 
 * STRUCTURE:
 * - Uses globalThis to maintain a single Prisma instance across hot reloads
 * - Prevents connection exhaustion in development mode
 * 
 * SECURITY:
 * - Database URL should be stored in environment variables, not committed
 * - Use connection pooling for production to handle concurrent requests
 * 
 * @see https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
 */

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Global type augmentation to store Prisma instance across module reloads.
 * This prevents creating multiple database connections during development
 * hot reloads, which could exhaust connection limits.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Database connection URL from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

/**
 * Main Prisma client instance.
 * 
 * In Prisma 7, we must provide an adapter for direct database connections.
 * In development: stored in global to survive hot reloads.
 */
export const prisma = globalForPrisma.prisma ?? (() => {
  const adapter = new PrismaMariaDb(connectionString);
  return new PrismaClient({ adapter });
})();

/**
 * Development-mode optimization:
 * Store Prisma instance in global to prevent connection exhaustion
 * when Next.js hot-reloads modules during development.
 */
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
