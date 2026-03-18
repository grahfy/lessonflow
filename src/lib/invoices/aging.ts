import { InvoiceStatus } from "@/generated/prisma/client";

import { type InvoiceReminderPolicy } from "@/lib/email/notification-settings";

export type InvoiceAgingBucket = "current" | "overdue_1_30" | "overdue_31_plus";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizes a date to UTC midnight so day-difference calculations remain deterministic.
 */
function atUtcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Calculates overdue day count for an invoice relative to now.
 */
export function getInvoiceOverdueDays(dueAt: Date, now: Date = new Date()): number {
  const diff = atUtcDayStart(now) - atUtcDayStart(dueAt);
  if (diff <= 0) {
    return 0;
  }
  return Math.floor(diff / DAY_MS);
}

/**
 * Classifies an invoice into aging buckets used by admin filters.
 */
export function getInvoiceAgingBucket(input: {
  dueAt: Date;
  status: InvoiceStatus;
  isDeleted?: boolean;
  now?: Date;
}): InvoiceAgingBucket {
  if (input.isDeleted || input.status === "paid" || input.status === "void") {
    return "current";
  }

  const overdueDays = getInvoiceOverdueDays(input.dueAt, input.now);
  if (overdueDays >= 31) {
    return "overdue_31_plus";
  }
  if (overdueDays >= 1) {
    return "overdue_1_30";
  }
  return "current";
}

/**
 * Returns the highest configured reminder threshold that the invoice has reached.
 */
export function getReminderStage(
  overdueDays: number,
  policy: Pick<InvoiceReminderPolicy, "stages">
): number | null {
  for (let index = policy.stages.length - 1; index >= 0; index -= 1) {
    const stage = policy.stages[index];
    if (overdueDays >= stage) {
      return stage;
    }
  }
  return null;
}
