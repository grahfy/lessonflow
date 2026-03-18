/**
 * Invoice Reminder Batch Processor
 * 
 * Orchestrates the automated dispatch of overdue notices for outstanding 
 * invoices. This service is designed to be invoked by both Scheduled CRON 
 * jobs and manual Admin triggers.
 * 
 * DESIGN RATIONALE:
 * 1. Eligibility Segregation: Candidate selection is broad (all sent/overdue), 
 *    but actual dispatch is gated by `getInvoiceReminderEligibility`. This 
 *    ensures idempotency—reminders won't be sent multiple times for 
 *    the same 'stage' (7, 14, 30 days).
 * 2. Error Isolation: Each invoice is processed in its own try/catch block. 
 *    A failure in one (e.g., bad customer email) does not halt the entire 
 *    batch, ensuring maximum system throughput.
 * 3. Dry-Run Support: Allows admins to preview who will receive a notice 
 *    without actually firing emails or updating the DB.
 * 4. Audit Trail: Every sent reminder is logged to the `InvoiceAuditLog` 
 *    for accountability and timeline tracking.
 */

import { prisma } from "@/lib/db";
import {
  getInvoiceReminderPolicy,
  getNotificationSettingsState,
  isAutomatedNotificationEnabled
} from "@/lib/email/notification-settings";
import { logError } from "@/lib/observability";
import { sendCustomerInvoiceReminderEmail } from "@/lib/invoice-events";
import { buildInvoiceReminderPersistence, getInvoiceReminderEligibility } from "@/lib/invoices/reminders";

type RunInvoiceReminderBatchInput = {
  /** The Admin (or SYSTEM_USER) ID triggering the batch. */
  actorId: string;
  /** If true, returns candidate list without sending emails. */
  dryRun?: boolean;
  /** Limits batch size to prevent SMTP rate-limiting or timeouts. */
  maxInvoices?: number;
  /** Filter to a single customer (useful for targeted manual recovery). */
  customerId?: string;
  /** Force-limit to a specific escalation stage. */
  stage?: number;
};

/** High-level summary of the batch operation results. */
export type InvoiceReminderRunResult = {
  dryRun: boolean;
  candidateCount: number;
  eligibleCount: number;
  suppressedCount: number;
  sentCount: number;
  failedCount: number;
  suppressed: boolean;
  suppressionReason?: string;
  sent: Array<{ id: string; invoiceNumber: string; overdueDays: number; stage: number }>;
  failed: Array<{ id: string; invoiceNumber: string; error: string }>;
  invoices?: Array<{ id: string; invoiceNumber: string; overdueDays: number; stage: number }>;
};

/**
 * Main execution loop for invoice reminders.
 * 
 * RATIONALE: We process oldest-due first to prioritize recovery of 
 * stale debt.
 */
export async function runInvoiceReminderBatch(input: RunInvoiceReminderBatchInput): Promise<InvoiceReminderRunResult> {
  const now = new Date();
  const notificationSettings = await getNotificationSettingsState();
  const reminderPolicy = getInvoiceReminderPolicy(notificationSettings);
  
  // 1. Fetch search candidates (overdue & currently sent)
  const candidates = await prisma.invoice.findMany({
    where: {
      isDeleted: false,
      documentType: "invoice",
      status: "sent",
      dueAt: { lt: now },
      customerId: input.customerId ?? undefined
    },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } }
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: input.maxInvoices ?? 100
  });

  // 2. Filter by business logic eligibility (Escalated stages: 7, 14, 30 days)
  const eligible = candidates
    .map((invoice) => {
      const eligibility = getInvoiceReminderEligibility(invoice, reminderPolicy, now);
      return { invoice, eligibility };
    })
    .filter(({ eligibility }) => {
      if (!eligibility.isEligible || !eligibility.stage) return false;
      if (input.stage && eligibility.stage !== input.stage) return false;
      return true;
    });

  // 3. Early exit if Dry Run requested
  if (input.dryRun) {
    return {
      dryRun: true,
      candidateCount: candidates.length,
      eligibleCount: eligible.length,
      suppressedCount: 0,
      sentCount: 0,
      failedCount: 0,
      suppressed: false,
      sent: [],
      failed: [],
      invoices: eligible.map(({ invoice, eligibility }) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        overdueDays: eligibility.overdueDays,
        stage: eligibility.stage as number
      }))
    };
  }

  if (!isAutomatedNotificationEnabled(notificationSettings, "automatic_invoice_reminders")) {
    return {
      dryRun: false,
      candidateCount: candidates.length,
      eligibleCount: eligible.length,
      suppressedCount: eligible.length,
      sentCount: 0,
      failedCount: 0,
      suppressed: true,
      suppressionReason: notificationSettings.globalAutomatedEmailEnabled
        ? "Automatic invoice reminders are disabled in notification settings."
        : "Automated email notifications are disabled in notification settings.",
      sent: [],
      failed: []
    };
  }

  const sent: Array<{ id: string; invoiceNumber: string; overdueDays: number; stage: number }> = [];
  const failed: Array<{ id: string; invoiceNumber: string; error: string }> = [];

  // 4. Dispatch Loop
  for (const entry of eligible) {
    const { invoice, eligibility } = entry;
    if (!eligibility.stage) continue;

    try {
      const reminder = buildInvoiceReminderPersistence(eligibility.overdueDays, eligibility.stage);

      // Persist reminder state before the customer-side side effect so retries do not
      // fan out duplicate overdue notices if the process dies after delivery.
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          lastReminderSentAt: reminder.lastReminderSentAt,
          lastReminderStage: reminder.lastReminderStage,
          updatedById: input.actorId,
          auditLogs: {
            create: {
              action: "reminder_sent",
              actorId: input.actorId,
              details: reminder.details
            }
          }
        }
      });

      const deliveryResult = await sendCustomerInvoiceReminderEmail(invoice, eligibility.overdueDays, {
        notification: {
          triggerMode: "automated",
          category: "automatic_invoice_reminders"
        },
        skipNotificationPolicyCheck: true
      });
      if (deliveryResult.status === "failed") {
        failed.push({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          error: deliveryResult.error || "Reminder email could not be delivered."
        });
        continue;
      }

      if (deliveryResult.status === "queued_no_smtp") {
        failed.push({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          error: "Reminder metadata was saved, but no live email provider is configured for customer delivery."
        });
        continue;
      }

      if (deliveryResult.status === "suppressed") {
        failed.push({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          error: deliveryResult.error || "Reminder was suppressed by notification settings."
        });
        continue;
      }

      sent.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        overdueDays: eligibility.overdueDays,
        stage: eligibility.stage
      });
    } catch (error) {
      logError("invoice.reminder_batch_item_failed", error, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber
      });
      // RATIONALE: Keep going to process other invoices even if one fails.
      failed.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        error: error instanceof Error ? error.message : "Unknown reminder error"
      });
    }
  }

  return {
    dryRun: false,
    candidateCount: candidates.length,
    eligibleCount: eligible.length,
    suppressedCount: 0,
    sentCount: sent.length,
    failedCount: failed.length,
    suppressed: false,
    sent,
    failed
  };
}
