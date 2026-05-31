import { InvoiceStatus } from "@/generated/prisma/client";

import { type InvoiceReminderPolicy } from "@/lib/email/notification-settings";
import { APP_TIMEZONE, toDateKey } from "@/lib/time";

export type InvoiceAgingBucket = "current" | "overdue_1_30" | "overdue_31_plus";

/**
 * Resolves an instant to its APP_TIMEZONE calendar day as a UTC-midnight epoch,
 * so whole-day differences are computed against the business timezone rather
 * than the server process timezone.
 */
function atLocalDayStart(date: Date): number {
  const key = toDateKey(date, APP_TIMEZONE); // YYYY-MM-DD in business timezone
  return Date.parse(`${key}T00:00:00.000Z`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculates overdue day count for an invoice relative to now.
 */
export function getInvoiceOverdueDays(dueAt: Date, now: Date = new Date()): number {
  const diff = atLocalDayStart(now) - atLocalDayStart(dueAt);
  if (diff <= 0) {
    return 0;
  }
  return Math.round(diff / DAY_MS);
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
