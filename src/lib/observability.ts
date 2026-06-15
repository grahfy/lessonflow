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
import { getOwnerEmail } from "./env";
import { consumeRateLimit } from "./rate-limit";

/**
 * Suppression is keyed on the vitest marker (so the test suite stays quiet
 * automatically) or an explicit OBSERVABILITY_SILENT opt-out. We deliberately
 * do NOT trigger on NODE_ENV: a misconfigured production job runner with
 * NODE_ENV unset (or "test") must still emit real logs and SystemLog rows.
 */
const isSilenced =
  process.env.VITEST != null ||
  process.env.OBSERVABILITY_SILENT === "1";

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
  if (isSilenced) return;
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
  if (isSilenced) return;
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
  if (isSilenced) return;
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
 * Maximum characters of any error stack/message included in an alert email.
 * RATIONALE: Alert bodies are operator-facing diagnostics, not full dumps.
 * Truncating bounds the email size and avoids accidentally mailing large
 * payloads (which could contain sensitive request bodies appended by callers).
 */
const ALERT_DETAIL_MAX_CHARS = 2000;

/**
 * Escapes user/error-derived text for safe inclusion in an HTML email body.
 * The alert body is owner-only, but errors can contain attacker-influenced
 * strings (e.g. a thrown message echoing request input), so we never inject
 * raw markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends a rate-limited owner alert email for a critical error.
 *
 * @internal - invoked fire-and-forget by {@link logCritical}.
 * RATIONALE: Isolated so logCritical stays synchronous/non-blocking; all of the
 * gating (errorAlertsEnabled), throttling (consumeRateLimit), and delivery live
 * behind one awaited helper whose rejections are swallowed by the caller.
 */
async function sendOwnerErrorAlert(event: string, errorDetail: string, meta?: Record<string, unknown>) {
  // Honour the explicit OBSERVABILITY_SILENT opt-out so the owner-alert path
  // respects the documented silencing flag. We deliberately do NOT gate on
  // VITEST here: VITEST only suppresses DB SystemLog rows (see isSilenced), while
  // the alert pipeline (sendEmail/rate-limit) is exercised by the observability
  // tests via mocks. Real sends in tests are inert (SMTP unconfigured) and the
  // caller swallows rejections.
  if (process.env.OBSERVABILITY_SILENT === "1") return;

  // Gate: respect the owner's NotificationSettings.errorAlertsEnabled toggle.
  // A missing settings row defaults to enabled (matches schema @default(true)).
  const settings = await prisma.notificationSettings.findUnique({
    where: { id: "default-notification-settings" },
    select: { errorAlertsEnabled: true }
  });
  if (settings && settings.errorAlertsEnabled === false) {
    return;
  }

  // Throttle: never send more than one alert per 5-minute window across all
  // critical events, so an error storm cannot flood the owner inbox.
  const limit = consumeRateLimit({ key: "error-alert", limit: 1, windowMs: 5 * 60 * 1000 });
  if (!limit.allowed) {
    return;
  }

  const truncatedDetail = errorDetail.slice(0, ALERT_DETAIL_MAX_CHARS);
  const metaText = stringifyMeta(meta).slice(0, ALERT_DETAIL_MAX_CHARS);
  const subject = `[LessonFlow] Critical error: ${event}`;
  const html = [
    `<p>A critical error was reported by the LessonFlow application.</p>`,
    `<p><strong>Event:</strong> ${escapeHtml(event)}</p>`,
    `<p><strong>Time:</strong> ${escapeHtml(new Date().toISOString())}</p>`,
    metaText ? `<p><strong>Context:</strong> ${escapeHtml(metaText)}</p>` : "",
    `<pre>${escapeHtml(truncatedDetail)}</pre>`,
    `<p>Review the System Logs in the admin console for full details.</p>`
  ]
    .filter(Boolean)
    .join("\n");

  // Dynamic import avoids a static import cycle: email/service.ts imports this
  // module (logEvent/logError). triggerMode "manual" intentionally bypasses the
  // automated-notification suppression so operational alerts always go out when
  // errorAlertsEnabled is on.
  const { sendEmail } = await import("./email/service");
  await sendEmail({
    to: getOwnerEmail(),
    subject,
    html,
    notification: { triggerMode: "manual" },
    skipAuditBcc: true
  });
}

/**
 * Logs a fatal/critical error AND notifies the owner by email.
 *
 * RATIONALE: For failures that need human attention (crashed jobs, process-level
 * unhandled rejections) we persist the error like {@link logError} and, when the
 * owner has error alerts enabled, send a rate-limited alert email. The email is
 * fire-and-forget so a slow/failed SMTP send never blocks or crashes the caller.
 *
 * @param event - High-level context (e.g. "job.gmail-sync.failed")
 * @param error - The error instance (or unknown) that triggered the alert
 * @param meta - Contextual data persisted with the log and summarized in the alert
 */
export function logCritical(event: string, error: unknown, meta?: Record<string, unknown>) {
  // Persist + console exactly like a normal error (respects VITEST silencing).
  logError(event, error, meta);

  let errorDetail: string;
  if (error instanceof Error) {
    errorDetail = error.stack || error.message;
  } else {
    errorDetail = String(error);
  }

  // Fire-and-forget: the alert pipeline must never block or throw into the
  // caller's request/job flow.
  void sendOwnerErrorAlert(event, errorDetail, meta).catch((err) => {
    console.error(`[observability] Failed to send owner error alert for "${event}":`, err);
  });
}

/**
 * Generic logging bridge.
 */
export function log(level: LogLevel, event: string, meta?: Record<string, unknown>) {
  if (isSilenced) return;
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
