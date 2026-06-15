import { Prisma } from "@/generated/prisma/client";

import { getDurationMinutes } from "@/lib/booking-rules";
import { excludeDeleted } from "@/lib/db/soft-delete";

type BookingDurationInput = {
  lessonDuration: "min30" | "min60";
  customDurationMinutes?: number | null;
};

export function getBookingDurationMinutes(input: BookingDurationInput): number {
  return getDurationMinutes(input.lessonDuration, input.customDurationMinutes);
}

export function describeGroupedLessonLine(durationMinutes: number, quantity: number): string {
  return `${quantity} x ${durationMinutes} minute lesson${quantity === 1 ? "" : "s"}`;
}

export async function findActiveInvoiceLinksForBookingIds(
  tx: Prisma.TransactionClient,
  bookingIds: string[],
  options?: { excludeInvoiceId?: string | null }
) {
  if (bookingIds.length === 0) {
    return [];
  }

  const invoiceWhere = {
    documentType: "invoice" as const,
    ...excludeDeleted(),
    status: {
      not: "void" as const
    },
    ...(options?.excludeInvoiceId ? { id: { not: options.excludeInvoiceId } } : {})
  };

  const [linkedRows, legacyRows] = await Promise.all([
    tx.invoiceBookingLink.findMany({
      where: {
        bookingId: {
          in: bookingIds
        },
        invoice: invoiceWhere
      },
      include: {
        invoice: {
          select: {
            id: true,
            status: true,
            isDeleted: true,
            documentType: true
          }
        }
      }
    }),
    tx.invoice.findMany({
      where: {
        bookingId: {
          in: bookingIds
        },
        ...invoiceWhere
      },
      select: {
        id: true,
        bookingId: true,
        status: true,
        isDeleted: true,
        documentType: true
      }
    })
  ]);

  const merged = [
    ...linkedRows,
    ...legacyRows
      .filter((row): row is typeof row & { bookingId: string } => typeof row.bookingId === "string" && row.bookingId.length > 0)
      .map((row) => ({
        bookingId: row.bookingId,
        invoice: {
          id: row.id,
          status: row.status,
          isDeleted: row.isDeleted,
          documentType: row.documentType
        }
      }))
  ];

  const seen = new Set<string>();
  return merged.filter((row) => {
    const key = `${row.bookingId}:${row.invoice.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
