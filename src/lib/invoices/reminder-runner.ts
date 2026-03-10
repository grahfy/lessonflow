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
import { getInvoiceReminderEligibility, sendInvoiceReminder } from "@/lib/invoices/reminders";

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
  stage?: 7 | 14 | 30;
};

/** High-level summary of the batch operation results. */
export type InvoiceReminderRunResult = {
  dryRun: boolean;
  candidateCount: number;
  eligibleCount: number;
  sentCount: number;
  failedCount: number;
  sent: Array<{ id: string; invoiceNumber: string; overdueDays: number; stage: 7 | 14 | 30 }>;
  failed: Array<{ id: string; invoiceNumber: string; error: string }>;
  invoices?: Array<{ id: string; invoiceNumber: string; overdueDays: number; stage: 7 | 14 | 30 }>;
};

/**
 * Main execution loop for invoice reminders.
 * 
 * RATIONALE: We process oldest-due first to prioritize recovery of 
 * stale debt.
 */
export async function runInvoiceReminderBatch(input: RunInvoiceReminderBatchInput): Promise<InvoiceReminderRunResult> {
  const now = new Date();
  
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
      const eligibility = getInvoiceReminderEligibility(invoice, now);
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
      sentCount: 0,
      failedCount: 0,
      sent: [],
      failed: [],
      invoices: eligible.map(({ invoice, eligibility }) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        overdueDays: eligibility.overdueDays,
        stage: eligibility.stage as 7 | 14 | 30
      }))
    };
  }

  const sent: Array<{ id: string; invoiceNumber: string; overdueDays: number; stage: 7 | 14 | 30 }> = [];
  const failed: Array<{ id: string; invoiceNumber: string; error: string }> = [];

  // 4. Dispatch Loop
  for (const entry of eligible) {
    const { invoice, eligibility } = entry;
    if (!eligibility.stage) continue;

    try {
      // Dispatch email via SMTP/Gmail
      const reminder = await sendInvoiceReminder(invoice, eligibility.overdueDays, eligibility.stage);
      
      // Update metadata to prevent duplicate sends until the next escalation stage
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
      
      sent.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        overdueDays: eligibility.overdueDays,
        stage: eligibility.stage
      });
    } catch (error) {
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
    sentCount: sent.length,
    failedCount: failed.length,
    sent,
    failed
  };
}
