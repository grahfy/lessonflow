/**
 * @fileoverview Structured logging utilities for application observability
 * @description Provides centralized logging functions with consistent formatting,
 * timestamps, and metadata serialization. Used throughout the application for
 * debugging, monitoring, and audit trails.
 * 
 * @security - Error logging includes stack traces for debugging but care should
 * be taken not to log sensitive customer data (PII is logged at customer-match stage)
 * @logic - All logs use ISO timestamps for chronological ordering in log aggregators
 */

type LogLevel = "info" | "warn" | "error";

/**
 * Serializes metadata object to JSON string for log output.
 * @param meta - Optional metadata object to serialize
 * @returns JSON string or empty string if meta is undefined/null
 * @security - Uses try/catch to prevent logging failures from crashing the app
 * @logic - Returns placeholder if serialization fails (e.g., circular references)
 */
function stringifyMeta(meta?: Record<string, unknown>) {
  if (!meta) {
    return "";
  }
  try {
    return JSON.stringify(meta);
  } catch {
    return "[unserializable-meta]";
  }
}

/**
 * Logs an informational event with optional metadata.
 * @param event - Human-readable event description
 * @param meta - Optional context data (e.g., { bookingId: "123", action: "created" })
 * @ui - Used for tracking user flows and business operations in monitoring dashboards
 */
export function logEvent(event: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [info] ${event} ${stringifyMeta(meta)}`;
  console.info(line);
}

/**
 * Logs an error event with error object and optional metadata.
 * @param event - Human-readable error description
 * @param error - The error object (Error instance or other value)
 * @param meta - Optional context data for debugging
 * @security - Includes full stack trace for debugging but avoid logging PII
 * @logic - Handles both Error instances and non-Error values gracefully
 */
export function logError(event: string, error: unknown, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [error] ${event} ${stringifyMeta(meta)}`;
  console.error(line);
  if (error instanceof Error) {
    console.error(error.stack || error.message);
  } else {
    console.error(error);
  }
}

/**
 * Generic logging function with level selection.
 * @param level - Log severity level (info, warn, error)
 * @param event - Human-readable event description
 * @param meta - Optional context data
 * @logic - Error level delegates to logError; warn uses console.warn
 */
export function log(level: LogLevel, event: string, meta?: Record<string, unknown>) {
  if (level === "error") {
    logError(event, null, meta);
    return;
  }
  const line = `[${new Date().toISOString()}] [${level}] ${event} ${stringifyMeta(meta)}`;
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}
