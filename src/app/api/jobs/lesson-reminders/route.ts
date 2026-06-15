/**
 * Pre-Lesson Reminder Batch Job
 *
 * Automates pre-lesson reminder emails for upcoming confirmed bookings.
 *
 * DESIGN RATIONALE:
 * - Idempotency: The runner selects bookings with `reminderSentAt` null and
 *   persists `reminderSentAt` before sending, so a reminder isn't sent twice.
 * - Protection: Secured by an `x-cron-secret` header to prevent unauthorized trigger.
 * - Accountability: Reminders are attributed to the primary admin owner for the
 *   BookingAuditLog trail.
 * - Batching: Defaults to a safe number of emails to avoid SMTP rate limits.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPrimaryActiveAdmin } from "@/lib/admin-auth";
import { runLessonReminderBatch } from "@/lib/bookings/lesson-reminder-runner";
import { verifyCronSecret } from "@/lib/cron-auth";
import { hasCronSecret } from "@/lib/env";

const sendLessonRemindersSchema = z.object({
  dryRun: z.boolean().optional(),
  maxBookings: z.coerce.number().int().min(1).max(1000).optional()
});

/**
 * POST: Triggers a reminder run for upcoming lessons.
 *
 * SECURITY:
 * 1. Checks for existence of CRON_SECRET in environment.
 * 2. Compares incoming 'x-cron-secret' header against local secret.
 *
 * JOB FLOW:
 * 1. Validates the request body using Zod schema (supports dry-runs and limits).
 * 2. Fetches the primary active admin identity to attribute the automated actions.
 * 3. Calls the `runLessonReminderBatch` service to perform the logic.
 *
 * @param request - JSON payload (maxBookings, dryRun)
 * @returns Summary of reminder actions performed
 */
export async function POST(request: NextRequest) {
  // Guard: Ensure environment is configured for automated jobs.
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }

  // Guard: Verify secret caller.
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = sendLessonRemindersSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reminder payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  /**
   * NOTE: We attribute system-generated emails to the primary administrator
   * to maintain a clear audit trail in the database.
   */
  const ownerAdmin = await getPrimaryActiveAdmin();
  if (!ownerAdmin) {
    return NextResponse.json({ error: "Setup incomplete. Create an admin account before running reminders." }, { status: 409 });
  }

  const result = await runLessonReminderBatch({
    actorId: ownerAdmin.id,
    dryRun: parsed.data.dryRun,
    maxBookings: parsed.data.maxBookings
  });

  return NextResponse.json({
    ok: true,
    ...result
  });
}
