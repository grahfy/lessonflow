/**
 * Auto-invoicing on booking approval
 *
 * When an owner approves a booking request and the
 * `NotificationSettings.autoCreateInvoiceOnApproval` toggle is enabled, we
 * generate a DRAFT invoice for each newly created booking. This is a
 * convenience step only: drafts are never auto-sent, and the helper is invoked
 * AFTER the approval transaction commits so a pricing gap or any other failure
 * here can never roll back or block the approval itself (see the caller's
 * best-effort try/catch).
 *
 * RECURRING SERIES: A recurring approval creates one booking row per generated
 * start date. We create one DRAFT invoice per booking row (mirroring the
 * existing manual per-booking invoice flow) rather than a single consolidated
 * invoice. This keeps each draft independently editable/voidable and reuses the
 * one-booking-link-per-invoice model the rest of the system already enforces.
 */

import { prisma } from "@/lib/db";
import { getDurationMinutes } from "@/lib/booking-rules";
import { describeGroupedLessonLine, findActiveInvoiceLinksForBookingIds } from "@/lib/invoices/booking-links";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { createInvoiceRecord, getDefaultDueAt } from "@/lib/invoices/persistence";
import { customerSnapshotFromBooking } from "@/lib/invoices/snapshots";
import { getInvoiceCurrency } from "@/lib/invoices/tax-profile";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";
import { getActiveLessonPricingMap } from "@/lib/lesson-pricing";
import { logError, logEvent } from "@/lib/observability";

/** Minimal booking shape needed to build a draft invoice from lesson pricing. */
type AutoInvoiceBooking = {
  id: string;
  customerId: string | null;
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  address: string;
};

/**
 * Best-effort creation of DRAFT invoices for the bookings produced by an
 * approval. Never throws: every failure path is logged and swallowed so the
 * caller's approval response is unaffected.
 *
 * @returns the number of draft invoices created.
 */
export async function autoCreateDraftInvoicesForApproval(input: {
  bookings: AutoInvoiceBooking[];
  adminId: string;
  requestId: string;
}): Promise<number> {
  const { bookings, adminId, requestId } = input;

  if (bookings.length === 0) {
    return 0;
  }

  let created = 0;

  try {
    const lessonPricingMap = await getActiveLessonPricingMap();

    for (const booking of bookings) {
      try {
        if (!booking.customerId) {
          // Without a customer we cannot attach a meaningful invoice; skip.
          logEvent("auto_invoice.skipped_no_customer", { requestId, bookingId: booking.id });
          continue;
        }

        const durationMinutes = getDurationMinutes(booking.lessonDuration, booking.customDurationMinutes);
        const price = lessonPricingMap.get(durationMinutes);
        if (!price) {
          // No active price configured for this duration; skip this booking but
          // continue with the rest. The unbilled badge surfaces the gap to the admin.
          logEvent("auto_invoice.skipped_no_pricing", {
            requestId,
            bookingId: booking.id,
            durationMinutes
          });
          continue;
        }

        // Idempotency / dedupe: never create a second draft for a booking that
        // already has an active (non-void, non-deleted) invoice link.
        const activeLinks = await prisma.$transaction((tx) =>
          findActiveInvoiceLinksForBookingIds(tx, [booking.id])
        );
        if (activeLinks.length > 0) {
          continue;
        }

        const currency = getInvoiceCurrency();
        const taxMode = getDefaultInvoiceTaxModeForCurrencyValue(currency);
        const lineItem: InvoiceLineItemDraft = {
          description: describeGroupedLessonLine(durationMinutes, 1),
          quantity: 1,
          unitPriceCents: price.priceCents,
          taxMode,
          kind: "lesson_fee",
          sortOrder: 0,
          discountKind: null,
          discountValue: null
        };

        const issuedAt = new Date();
        const dueAt = getDefaultDueAt(issuedAt);

        await prisma.$transaction((tx) =>
          createInvoiceRecord({
            tx,
            adminId,
            status: "draft",
            currency,
            taxMode,
            customerId: booking.customerId,
            bookingId: booking.id,
            bookingIds: [booking.id],
            customerSnapshot: customerSnapshotFromBooking(booking),
            lineItems: [lineItem],
            issuedAt,
            dueAt
          })
        );

        created += 1;
      } catch (bookingError) {
        // Isolate per-booking failures so one bad row doesn't abort the batch.
        logError("auto_invoice.create_failed", bookingError, {
          requestId,
          bookingId: booking.id
        });
      }
    }
  } catch (error) {
    logError("auto_invoice.batch_failed", error, { requestId });
  }

  return created;
}
