import { prisma } from "@/lib/db";
import { getInvoiceReminderEligibility, sendInvoiceReminder } from "@/lib/invoices/reminders";

type RunInvoiceReminderBatchInput = {
  actorId: string;
  dryRun?: boolean;
  maxInvoices?: number;
  customerId?: string;
  stage?: 7 | 14 | 30;
};

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
 * Runs a reminder batch for overdue sent invoices.
 *
 * This centralizes reminder execution for both manual admin triggering and
 * scheduled cron jobs so reminder-stage behavior remains consistent.
 */
export async function runInvoiceReminderBatch(input: RunInvoiceReminderBatchInput): Promise<InvoiceReminderRunResult> {
  const now = new Date();
  const candidates = await prisma.invoice.findMany({
    where: {
      isDeleted: false,
      documentType: "invoice",
      status: "sent",
      dueAt: {
        lt: now
      },
      customerId: input.customerId ?? undefined
    },
    include: {
      lineItems: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: input.maxInvoices ?? 100
  });

  const eligible = candidates
    .map((invoice) => {
      const eligibility = getInvoiceReminderEligibility(invoice, now);
      return {
        invoice,
        eligibility
      };
    })
    .filter(({ eligibility }) => {
      if (!eligibility.isEligible || !eligibility.stage) {
        return false;
      }
      if (input.stage && eligibility.stage !== input.stage) {
        return false;
      }
      return true;
    });

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

  for (const entry of eligible) {
    const { invoice, eligibility } = entry;
    if (!eligibility.stage) {
      continue;
    }

    try {
      const reminder = await sendInvoiceReminder(invoice, eligibility.overdueDays, eligibility.stage);
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
