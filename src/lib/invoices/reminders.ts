import { Invoice, InvoiceLineItem } from "@/generated/prisma/client";

import { sendCustomerInvoiceReminderEmail } from "@/lib/invoice-events";
import { getInvoiceOverdueDays, getReminderStage } from "@/lib/invoices/aging";

export type InvoiceWithLines = Invoice & {
  lineItems: InvoiceLineItem[];
};

/**
 * Determines whether an invoice is currently eligible for reminder email sending.
 *
 * Eligibility is intentionally stricter than "overdue":
 * - only invoice documents (not credit notes)
 * - only non-deleted, sent invoices
 * - only reminder stages that advance beyond `lastReminderStage`
 *
 * This makes repeated cron runs idempotent and prevents duplicate reminders for the same stage.
 */
export function getInvoiceReminderEligibility(invoice: InvoiceWithLines, now: Date = new Date()) {
  const overdueDays = getInvoiceOverdueDays(invoice.dueAt, now);
  const stage = getReminderStage(overdueDays);
  const nextStageEligible = stage !== null && (!invoice.lastReminderStage || stage > invoice.lastReminderStage);

  return {
    overdueDays,
    stage,
    isEligible:
      !invoice.isDeleted &&
      invoice.documentType === "invoice" &&
      invoice.status === "sent" &&
      overdueDays >= 1 &&
      stage !== null &&
      nextStageEligible
  };
}

export function buildInvoiceReminderPersistence(overdueDays: number, stage: 7 | 14 | 30) {
  return {
    lastReminderSentAt: new Date(),
    lastReminderStage: stage,
    details: `Overdue reminder sent at ${stage}-day stage (${overdueDays} days overdue)`
  };
}

/**
 * Sends a reminder email and returns persistence fields for reminder tracking.
 *
 * The caller persists the returned fields so reminder sending can be composed into a larger
 * transaction/audit-log update without this helper owning database writes.
 */
export async function sendInvoiceReminder(invoice: InvoiceWithLines, overdueDays: number, stage: 7 | 14 | 30) {
  const deliveryResult = await sendCustomerInvoiceReminderEmail(invoice, overdueDays);

  return {
    deliveryResult,
    ...buildInvoiceReminderPersistence(overdueDays, stage)
  };
}
