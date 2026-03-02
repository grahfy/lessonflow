import { InvoiceStatus } from "@/generated/prisma/client";

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
 * Returns reminder stage thresholds for 7/14/30-day overdue follow-up cadence.
 */
export function getReminderStage(overdueDays: number): 7 | 14 | 30 | null {
  if (overdueDays >= 30) {
    return 30;
  }
  if (overdueDays >= 14) {
    return 14;
  }
  if (overdueDays >= 7) {
    return 7;
  }
  return null;
}
