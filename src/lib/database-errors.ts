import { AppError } from "@/lib/errors";

/**
 * Stable machine-readable code used when the app cannot talk to the configured
 * database server.
 */
export const DATABASE_UNAVAILABLE_CODE = "DB_UNAVAILABLE";

/**
 * Shared user-facing copy for database connectivity failures.
 */
export const DATABASE_UNAVAILABLE_MESSAGE =
  "The admin service cannot reach the database right now. Restore database connectivity and try again.";

/**
 * Heuristic matcher for the adapter/runtime errors Prisma emits when MariaDB is
 * unavailable or the pool cannot create a usable connection.
 *
 * RATIONALE: The MariaDB adapter currently throws generic Error-like objects in
 * some failure modes, so we cannot rely on one Prisma class alone.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.code === DATABASE_UNAVAILABLE_CODE;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const haystack = `${error.name} ${error.message}`.toLowerCase();
  return (
    haystack.includes("driveradaptererror")
    || haystack.includes("failed to retrieve a connection from pool")
    || haystack.includes("pool timeout")
    || haystack.includes("can't reach database server")
    || haystack.includes("cannot reach database server")
    || haystack.includes("connect econnrefused")
    || haystack.includes("getaddrinfo enotfound")
    || haystack.includes("connection refused")
  );
}

/**
 * Normalizes raw DB connectivity failures into the app's structured error
 * contract so admin APIs can consistently return `503/DB_UNAVAILABLE`.
 */
export function createDatabaseUnavailableError(
  message: string = DATABASE_UNAVAILABLE_MESSAGE
): AppError {
  return new AppError(message, DATABASE_UNAVAILABLE_CODE, 503);
}
