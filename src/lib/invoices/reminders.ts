import { Invoice, InvoiceLineItem } from "@prisma/client";

import { sendCustomerInvoiceReminderEmail } from "@/lib/invoice-events";
import { getInvoiceOverdueDays, getReminderStage } from "@/lib/invoices/aging";

export type InvoiceWithLines = Invoice & {
  lineItems: InvoiceLineItem[];
};

/**
 * Determines whether an invoice is currently eligible for reminder email sending.
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

/**
 * Sends a reminder email and returns persistence fields for reminder tracking.
 */
export async function sendInvoiceReminder(invoice: InvoiceWithLines, overdueDays: number, stage: 7 | 14 | 30) {
  await sendCustomerInvoiceReminderEmail(invoice, overdueDays);

  return {
    lastReminderSentAt: new Date(),
    lastReminderStage: stage,
    details: `Overdue reminder sent at ${stage}-day stage (${overdueDays} days overdue)`
  };
}
