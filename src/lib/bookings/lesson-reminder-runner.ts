/**
 * Pre-Lesson Reminder Batch Processor
 *
 * Orchestrates the automated dispatch of pre-lesson reminders for upcoming
 * confirmed bookings. Designed to be invoked by a scheduled CRON job (mirrors
 * the invoice-reminder runner).
 *
 * DESIGN RATIONALE:
 * 1. Eligibility Window: Candidates are approved bookings starting within the
 *    next `lessonReminderHoursBefore` hours that have not yet been reminded
 *    (`reminderSentAt` null) and have a customer email on file.
 * 2. Idempotency: `reminderSentAt` is persisted BEFORE the customer-side email
 *    side effect so a crash after delivery cannot fan out duplicate reminders.
 * 3. Error Isolation: Each booking is processed in its own try/catch block so a
 *    single bad email does not halt the entire batch.
 * 4. Dry-Run Support: Lets admins preview eligible bookings without sending.
 * 5. Gating: Suppressed entirely unless global automated email AND the
 *    `lessonReminderEnabled` flag are on in NotificationSettings.
 */

import { prisma } from "@/lib/db";
import { getNotificationSettingsState } from "@/lib/email/notification-settings";
import { sendEmail } from "@/lib/email/service";
import { customerLessonReminderTemplate } from "@/lib/email/templates";
import { getStudentPortalLoginUrl } from "@/lib/env";
import { logError } from "@/lib/observability";

type RunLessonReminderBatchInput = {
  /** The Admin (or SYSTEM_USER) ID triggering the batch, recorded on the audit log. */
  actorId: string;
  /** If true, returns the eligible list without sending emails or mutating state. */
  dryRun?: boolean;
  /** Limits batch size to prevent SMTP rate-limiting or timeouts. */
  maxBookings?: number;
};

/** High-level summary of the batch operation results. */
export type LessonReminderRunResult = {
  dryRun: boolean;
  candidateCount: number;
  sentCount: number;
  failedCount: number;
  suppressed: boolean;
  suppressionReason?: string;
  sent: Array<{ id: string; name: string; startAt: string }>;
  failed: Array<{ id: string; name: string; error: string }>;
  bookings?: Array<{ id: string; name: string; startAt: string }>;
};

/**
 * Main execution loop for pre-lesson reminders.
 *
 * RATIONALE: We process soonest-first so the most time-sensitive lessons are
 * reminded before any batch limit is reached.
 */
export async function runLessonReminderBatch(
  input: RunLessonReminderBatchInput
): Promise<LessonReminderRunResult> {
  const now = new Date();
  const settings = await getNotificationSettingsState();

  // 1. Gate: global automated email + the lesson-reminder flag must both be on.
  //    Evaluated BEFORE the candidate scan so a dry-run also respects the disabled
  //    flag rather than previewing a list that could never be dispatched.
  if (!settings.globalAutomatedEmailEnabled || !settings.lessonReminderEnabled) {
    return {
      dryRun: input.dryRun ?? false,
      candidateCount: 0,
      sentCount: 0,
      failedCount: 0,
      suppressed: true,
      suppressionReason: settings.globalAutomatedEmailEnabled
        ? "Pre-lesson reminders are disabled in notification settings."
        : "Automated email notifications are disabled in notification settings.",
      sent: [],
      failed: []
    };
  }

  // Window upper bound: lessons starting within the configured lead time.
  const windowEnd = new Date(now.getTime() + settings.lessonReminderHoursBefore * 60 * 60 * 1000);

  // 2. Fetch candidates: approved, starting in [now, windowEnd), not yet reminded,
  //    with a deliverable email address.
  const candidates = await prisma.booking.findMany({
    where: {
      status: "approved",
      reminderSentAt: null,
      startAt: {
        gte: now,
        lt: windowEnd
      },
      email: { not: "" }
    },
    include: {
      assignedTeacher: true
    },
    orderBy: { startAt: "asc" },
    take: input.maxBookings ?? 200
  });

  // 3. Early exit for Dry Run.
  if (input.dryRun) {
    return {
      dryRun: true,
      candidateCount: candidates.length,
      sentCount: 0,
      failedCount: 0,
      suppressed: false,
      sent: [],
      failed: [],
      bookings: candidates.map((booking) => ({
        id: booking.id,
        name: booking.name,
        startAt: booking.startAt.toISOString()
      }))
    };
  }

  const portalLoginUrl = getStudentPortalLoginUrl();
  const sent: Array<{ id: string; name: string; startAt: string }> = [];
  const failed: Array<{ id: string; name: string; error: string }> = [];

  // 4. Dispatch Loop.
  for (const booking of candidates) {
    try {
      // Persist reminder state before the customer-side side effect so retries do
      // not fan out duplicate reminders if the process dies after delivery.
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          reminderSentAt: now,
          auditLogs: {
            create: {
              action: "reminder_sent",
              actorId: input.actorId,
              details: `Pre-lesson reminder sent for lesson at ${booking.startAt.toISOString()}.`
            }
          }
        }
      });

      const template = customerLessonReminderTemplate({
        name: booking.name,
        when: booking.startAt,
        lessonMode: booking.lessonMode,
        teacherName: booking.assignedTeacher?.displayName ?? null,
        portalLoginUrl
      });

      const deliveryResult = await sendEmail({
        to: booking.email,
        subject: template.subject,
        html: template.html,
        // Our explicit lessonReminderEnabled gate above is authoritative; skip the
        // category policy check so reminders are not double-gated by category prefs.
        notification: {
          triggerMode: "automated",
          category: "customer_booking_updates"
        },
        skipNotificationPolicyCheck: true
      });

      if (deliveryResult.status === "failed") {
        failed.push({
          id: booking.id,
          name: booking.name,
          error: deliveryResult.error || "Reminder email could not be delivered."
        });
        continue;
      }

      if (deliveryResult.status === "queued_no_smtp") {
        failed.push({
          id: booking.id,
          name: booking.name,
          error: "Reminder state was saved, but no live email provider is configured for customer delivery."
        });
        continue;
      }

      if (deliveryResult.status === "suppressed") {
        failed.push({
          id: booking.id,
          name: booking.name,
          error: deliveryResult.error || "Reminder was suppressed by notification settings."
        });
        continue;
      }

      sent.push({
        id: booking.id,
        name: booking.name,
        startAt: booking.startAt.toISOString()
      });
    } catch (error) {
      logError("booking.lesson_reminder_batch_item_failed", error, {
        bookingId: booking.id
      });
      // RATIONALE: Keep going to process other bookings even if one fails.
      failed.push({
        id: booking.id,
        name: booking.name,
        error: error instanceof Error ? error.message : "Unknown reminder error"
      });
    }
  }

  return {
    dryRun: false,
    candidateCount: candidates.length,
    sentCount: sent.length,
    failedCount: failed.length,
    suppressed: false,
    sent,
    failed
  };
}
