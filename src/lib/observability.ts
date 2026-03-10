/**
 * Application Observability & Structured Logging
 * 
 * Provides centralized logging with both Console output (for real-time 
 * monitoring) and Database persistence (for historical audit and 
 * admin dashboarding).
 * 
 * DESIGN RATIONALE:
 * 1. Hybrid Storage: Logs are emitted to `stdout/stderr` (captured by VPS 
 *    process managers like PM2 or Systemd) AND written to the `SystemLog` 
 *    table. This ensures logs are available even if the DB is down, 
 *    while still providing a searchable UI for admins.
 * 2. Non-Blocking Persistence: Database logging is "fire-and-forget" 
 *    (not awaited). This prevents slow DB writes from increasing 
 *    latency for end-users or critical API flows.
 * 3. Structured Metadata: Supports JSON metadata for deep inspection 
 *    of events (e.g. logging the specific Booking ID involved in an error).
 */

import { prisma } from "./db";
import { Prisma } from "@/generated/prisma/client";

/** Supported severity levels for the observability stack. */
type LogLevel = "info" | "warn" | "error";

/**
 * Persists a log entry to the database SystemLog table.
 * 
 * @internal - This is called internally by logger functions. 
 * RATIONALE: We use a separate .catch block to prevent logging failures 
 * from causing infinite recursion or crashing the parent process.
 */
function persistLog(level: LogLevel, event: string, message: string, meta?: Record<string, unknown>) {
  // Fire-and-forget: we do NOT await this to keep the application fast.
  prisma.systemLog.create({
    data: {
      level,
      event,
      message,
      meta: meta ? (meta as Prisma.InputJsonValue) : Prisma.JsonNull,
    }
  }).catch(err => {
    // Fallback to console only if DB persistence fails.
    console.error("[observability] Persistence failure:", err.message);
  });
}

/**
 * Safely stringifies metadata for console output.
 * RATIONALE: Prevents "Circular Reference" errors from crashing the logger.
 */
function stringifyMeta(meta?: Record<string, unknown>) {
  if (!meta) return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return "[unserializable-meta]";
  }
}

/**
 * Logs a successful business event.
 * Use this for high-level tracking like "Booking Approved" or "Invoice Sent".
 * 
 * @param event - Short, searchable string (e.g. "auth.login.success")
 * @param meta - Additional context (e.g. { userId: "..." })
 */
export function logEvent(event: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [info] ${event} ${stringifyMeta(meta)}`;
  console.info(line);
  persistLog("info", event, line, meta);
}

/**
 * Detailed error logger with stack trace capturing.
 * 
 * @param event - Context of where the error occurred (e.g. "api.booking.create.failed")
 * @param error - The actual error object caught in the try/catch
 * @param meta - Local variables at the time of failure
 */
export function logError(event: string, error: unknown, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [error] ${event} ${stringifyMeta(meta)}`;
  console.error(line);
  
  let errorMessage = "";
  if (error instanceof Error) {
    errorMessage = error.stack || error.message;
    console.error(errorMessage);
  } else {
    errorMessage = String(error);
    console.error(error);
  }

  // Persists the full stack trace to the DB for admin debugging.
  persistLog("error", event, `${line}\n${errorMessage}`, meta);
}

/**
 * Generic logging bridge for arbitrary levels.
 */
export function log(level: LogLevel, event: string, meta?: Record<string, unknown>) {
  if (level === "error") {
    logError(event, null, meta);
    return;
  }
  
  const line = `[${new Date().toISOString()}] [${level}] ${event} ${stringifyMeta(meta)}`;
  
  if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
  
  persistLog(level, event, line, meta);
}
