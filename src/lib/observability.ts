/**
 * Application Observability & Structured Logging
 * 
 * Central telemetry service for the LessonFlow platform. Provides unified 
 * logging with both real-time stdout visibility and historical DB persistence.
 * 
 * DESIGN RATIONALE:
 * 1. Hybrid Storage: Logs are emitted to `stdout/stderr` (captured by VPS 
 *    process managers like PM2 or Systemd) AND written to the `SystemLog` 
 *    database table. This ensures logs are available even if the DB is down 
 *    (via CLI) while still providing a searchable UI for administrators.
 * 2. Non-Blocking Persistence: Database logging is "fire-and-forget" 
 *    (asynchronous and not awaited). This prevents slow database writes from 
 *    increasing the request latency for critical API paths.
 * 3. Structured Metadata: Supports standard JSON objects for deep event 
 *    inspection (e.g. logging the specific Booking ID and User Agent).
 * 4. Error Stack Preservation: Automatically captures and flattens stack 
 *    traces into the message field for easy debugging in the Admin UI.
 */

import { prisma } from "./db";
import { Prisma } from "@/generated/prisma/client";

/** Supported severity levels for the observability stack. */
type LogLevel = "info" | "warn" | "error";

/**
 * Persists a log entry to the database SystemLog table.
 * 
 * @internal - Called by public log methods.
 * RATIONALE: We use a catch-all to prevent observability failures from 
 * crashing the main application flow.
 */
function persistLog(level: LogLevel, event: string, message: string, meta?: Record<string, unknown>) {
  // RATIONALE: We do NOT await this promise to avoid blocking the Event Loop.
  prisma.systemLog.create({
    data: {
      level,
      event,
      message,
      meta: meta ? (meta as Prisma.InputJsonValue) : Prisma.JsonNull,
    }
  }).catch(err => {
    // Fallback to console if DB write fails.
    console.error(`[observability] DB Persistence Failure for event "${event}":`, err.message);
  });
}

/**
 * Ensures metadata can be cleanly stringified for console output.
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
 * Logs a standard business event.
 * 
 * @param event - Logical descriptor (e.g. "invoice.issued")
 * @param meta - Contextual data (e.g. { invoiceId: "..." })
 */
export function logEvent(event: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [info] ${event} ${stringifyMeta(meta)}`;
  console.info(line);
  persistLog("info", event, line, meta);
}

/**
 * Detailed error logger.
 * 
 * RATIONALE: Captures full stack traces into the DB record to allow 
 * developers to trace bugs without needing server SSH access.
 * 
 * @param event - High-level context (e.g. "email.dispatch.failed")
 * @param error - The error instance caught in the handle
 * @param meta - Local variables at the point of failure
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

  persistLog("error", event, `${line}\n${errorMessage}`, meta);
}

/**
 * Generic logging bridge.
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
