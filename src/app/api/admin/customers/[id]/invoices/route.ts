import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { getDurationMinutes } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { getInvoiceAgingBucket, getInvoiceOverdueDays } from "@/lib/invoices/aging";
import { describeGroupedLessonLine, findActiveInvoiceLinksForBookingIds } from "@/lib/invoices/booking-links";
import { assertPackageLinesAreValid } from "@/lib/credits/lesson-credits";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { withResolvedInvoicePaymentDetails } from "@/lib/invoices/payment-details";
import { createCustomerInvoiceSchema, listInvoicesQuerySchema } from "@/lib/invoices/schema";
import { createInvoiceRecord, getDefaultDueAt } from "@/lib/invoices/persistence";
import { customerSnapshotFromCustomer } from "@/lib/invoices/snapshots";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";
import { getActiveLessonPricingMap } from "@/lib/lesson-pricing";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type InvoiceIneligibilityReason = "already_invoiced" | "missing_lesson_price" | "invalid_status";

function getDateFilterBounds(rawFrom: string | null, rawTo: string | null) {
  const from = rawFrom?.trim() ? new Date(`${rawFrom.trim()}T00:00:00.000Z`) : null;
  const to = rawTo?.trim() ? new Date(`${rawTo.trim()}T23:59:59.999Z`) : null;

  return {
    from: from && !Number.isNaN(from.getTime()) ? from : null,
    to: to && !Number.isNaN(to.getTime()) ? to : null
  };
}

function buildBookingStartAtFilter(rawFrom: string | null, rawTo: string | null) {
  const bounds = getDateFilterBounds(rawFrom, rawTo);
  if (!bounds.from && !bounds.to) {
    return undefined;
  }

  return {
    ...(bounds.from ? { gte: bounds.from } : {}),
    ...(bounds.to ? { lte: bounds.to } : {})
  };
}

/**
 * Lists invoices linked to one customer with standard search/filter controls.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const parsed = listInvoicesQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    agingBucket: request.nextUrl.searchParams.get("agingBucket") ?? undefined,
    outstanding: request.nextUrl.searchParams.get("outstanding") ?? undefined,
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const includeBookingOptions = request.nextUrl.searchParams.get("bookingOptions") === "true";
  const bookingStartAtFilter = buildBookingStartAtFilter(
    request.nextUrl.searchParams.get("from"),
    request.nextUrl.searchParams.get("to")
  );
  const lessonPricingMap = includeBookingOptions ? await getActiveLessonPricingMap() : new Map();

  // Build the invoice filter incrementally so customer page filters mirror the global invoices UI.
  const where: Prisma.InvoiceWhereInput = {
    customerId: id,
    isDeleted: false
  };

  if (parsed.data.status) {
    where.status = parsed.data.status;
  }
  if (parsed.data.outstanding === "true") {
    where.status = {
      notIn: ["paid", "void"]
    };
    where.documentType = "invoice";
  }
  if (parsed.data.q) {
    where.OR = [
      { invoiceNumber: { contains: parsed.data.q } },
      { customerName: { contains: parsed.data.q } },
      { customerEmail: { contains: parsed.data.q } }
    ];
  }

  if (parsed.data.agingBucket) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    where.status = {
      notIn: ["paid", "void"]
    };
    if (parsed.data.agingBucket === "current") {
      where.dueAt = { gte: now };
    } else if (parsed.data.agingBucket === "overdue_1_30") {
      where.dueAt = { lt: now, gte: thirtyDaysAgo };
    } else {
      where.dueAt = { lt: thirtyDaysAgo };
    }
  }

  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  // Bundle list + count (+ optional booking options) in one transaction so UI pagination and
  // selector options reflect the same snapshot.
  const [invoices, total, bookingOptions] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: parsed.data.pageSize
    }),
    prisma.invoice.count({ where }),
    includeBookingOptions
      ? prisma.booking.findMany({
          where: {
            customerId: id,
            ...(bookingStartAtFilter ? { startAt: bookingStartAtFilter } : {})
          },
          orderBy: {
            startAt: "desc"
          },
          select: {
            id: true,
            status: true,
            startAt: true,
            lessonMode: true,
            lessonDuration: true,
            customDurationMinutes: true,
            invoiceLinks: {
              where: {
                invoice: {
                  documentType: "invoice",
                  isDeleted: false,
                  status: {
                    not: "void"
                  }
                }
              },
              select: {
                invoice: {
                  select: {
                    id: true
                  }
                }
              },
              take: 1
            },
            invoices: {
              where: {
                documentType: "invoice",
                isDeleted: false,
                status: {
                  not: "void"
                }
              },
              select: {
                id: true
              },
              take: 1
            }
          }
        })
      : prisma.booking.findMany({
          where: {
            customerId: id
          },
          take: 0,
          select: {
            id: true,
            status: true,
            startAt: true,
            lessonMode: true,
            lessonDuration: true,
            customDurationMinutes: true,
            invoices: {
              take: 0,
              select: {
                id: true
              }
            },
            invoiceLinks: {
              take: 0,
              select: {
                invoice: {
                  select: {
                    id: true
                  }
                }
              }
            }
          }
        })
  ]);

  return NextResponse.json({
    invoices: invoices.map((invoice) => ({
      ...withResolvedInvoicePaymentDetails(invoice),
      overdueDays: getInvoiceOverdueDays(invoice.dueAt),
      agingBucket: getInvoiceAgingBucket({
        dueAt: invoice.dueAt,
        status: invoice.status,
        isDeleted: invoice.isDeleted
      })
    })),
    total,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
    bookingOptions: bookingOptions.map((booking) => ({
      ...(() => {
        const durationMinutes = getDurationMinutes(booking.lessonDuration, booking.customDurationMinutes);
        const linkedInvoiceId = booking.invoiceLinks[0]?.invoice.id ?? booking.invoices[0]?.id ?? null;
        const isApproved = booking.status === "approved";
        const hasPrice = lessonPricingMap.has(durationMinutes);
        const isInvoiceSelectable = isApproved && !linkedInvoiceId && hasPrice;
        let invoiceIneligibilityReason: InvoiceIneligibilityReason | null = null;
        if (linkedInvoiceId) {
          invoiceIneligibilityReason = "already_invoiced";
        } else if (!isApproved) {
          invoiceIneligibilityReason = "invalid_status";
        } else if (!hasPrice) {
          invoiceIneligibilityReason = "missing_lesson_price";
        }

        return {
          durationMinutes,
          linkedInvoiceId,
          isInvoiceSelectable,
          invoiceIneligibilityReason
        };
      })(),
      id: booking.id,
      status: booking.status,
      startAt: booking.startAt.toISOString(),
      lessonMode: booking.lessonMode,
      lessonDuration: booking.lessonDuration,
      customDurationMinutes: booking.customDurationMinutes
    }))
  });
}

/**
 * Creates an invoice directly from a selected customer profile.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || customer.isArchived) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createCustomerInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const taxMode = parsed.data.taxMode ?? getDefaultInvoiceTaxModeForCurrencyValue(parsed.data.currency);
  const selectedBookingIds = Array.from(
    new Set((parsed.data.bookingIds ?? []).map((bookingId) => bookingId.trim()).filter(Boolean))
  );
  let resolvedBookingId = parsed.data.bookingId ?? null;
  let resolvedBookingIds: string[] = [];
  const directLineItems = (parsed.data.lineItems ?? []).map((lineItem, index) => ({
    description: lineItem.description,
    quantity: lineItem.quantity,
    unitPriceCents: lineItem.unitPriceCents,
    taxMode: lineItem.taxMode ?? taxMode,
    kind: lineItem.kind,
    sortOrder: lineItem.sortOrder ?? index,
    discountKind: lineItem.discountKind ?? null,
    discountValue: lineItem.discountValue ?? null,
    packageId: lineItem.packageId ?? null
  }));

  // SECURITY: A client-supplied packageId controls whether paying this invoice
  // grants prepaid lesson credits, so every referenced package must exist and be
  // active. Reject unknown/inactive ids rather than silently dropping them.
  const packageError = await assertPackageLinesAreValid(directLineItems);
  if (packageError) {
    return NextResponse.json({ error: packageError }, { status: 400 });
  }
  let lessonLineItems: InvoiceLineItemDraft[] = [];
  let lineItems: InvoiceLineItemDraft[] = [];

  if (selectedBookingIds.length > 0) {
    const lessonPricingMap = await getActiveLessonPricingMap();
    const [bookings, activeLinks] = await prisma.$transaction(async (tx) => {
      const bookings = await tx.booking.findMany({
        where: {
          id: {
            in: selectedBookingIds
          }
        },
        select: {
          id: true,
          customerId: true,
          status: true,
          lessonDuration: true,
          customDurationMinutes: true
        }
      });

      const activeLinks = await findActiveInvoiceLinksForBookingIds(tx, selectedBookingIds);
      return [bookings, activeLinks] as const;
    });

    if (bookings.length !== selectedBookingIds.length) {
      return NextResponse.json({ error: "One or more selected bookings do not exist." }, { status: 400 });
    }

    const activeLinkByBookingId = new Map(activeLinks.map((link) => [link.bookingId, link.invoice.id]));
    const groupedBookings = new Map<number, number>();

    for (const bookingId of selectedBookingIds) {
      const booking = bookings.find((row) => row.id === bookingId);
      if (!booking) {
        return NextResponse.json({ error: "One or more selected bookings do not exist." }, { status: 400 });
      }
      if (booking.customerId !== customer.id) {
        return NextResponse.json({ error: "Selected booking does not belong to this customer." }, { status: 400 });
      }
      if (booking.status !== "approved") {
        return NextResponse.json({ error: "Only approved bookings can be invoiced." }, { status: 400 });
      }
      if (activeLinkByBookingId.has(booking.id)) {
        return NextResponse.json({ error: "One or more selected bookings are already linked to an active invoice." }, { status: 400 });
      }

      const durationMinutes = getDurationMinutes(booking.lessonDuration, booking.customDurationMinutes);
      if (!lessonPricingMap.has(durationMinutes)) {
        return NextResponse.json({ error: `No lesson price is configured for ${durationMinutes} minute lessons.` }, { status: 400 });
      }

      groupedBookings.set(durationMinutes, (groupedBookings.get(durationMinutes) ?? 0) + 1);
    }

    resolvedBookingIds = selectedBookingIds;
    resolvedBookingId = selectedBookingIds[0] ?? null;
    lessonLineItems = Array.from(groupedBookings.entries())
      .sort(([a], [b]) => a - b)
      .map(([durationMinutes, quantity], index) => {
        const price = lessonPricingMap.get(durationMinutes);
        return {
          description: describeGroupedLessonLine(durationMinutes, quantity),
          quantity,
          unitPriceCents: price?.priceCents ?? 0,
          taxMode,
          kind: "lesson_fee",
          sortOrder: index,
          discountKind: null,
          discountValue: null
        } satisfies InvoiceLineItemDraft;
      });
  } else {
    if (parsed.data.bookingId) {
      const selectedBookingId = parsed.data.bookingId;
      const [booking, activeLinks] = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: selectedBookingId },
          select: {
            id: true,
            customerId: true
          }
        });
        const activeLinks = await findActiveInvoiceLinksForBookingIds(tx, [selectedBookingId]);
        return [booking, activeLinks] as const;
      });
      if (!booking) {
        return NextResponse.json({ error: "Selected booking does not exist." }, { status: 400 });
      }
      if (booking.customerId !== customer.id) {
        return NextResponse.json({ error: "Selected booking does not belong to this customer." }, { status: 400 });
      }
      if (activeLinks.length > 0) {
        return NextResponse.json({ error: "Selected booking is already linked to an active invoice." }, { status: 400 });
      }
      resolvedBookingIds = [selectedBookingId];
    }

    lessonLineItems = [];
  }

  lineItems = [
    ...lessonLineItems,
    ...directLineItems
  ].map((lineItem, index) => ({
    ...lineItem,
    sortOrder: index
  }));

  const issuedAt = new Date();
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : getDefaultDueAt(issuedAt);
  // Customer-linked invoice creation is transactional so numbering + line items + audit trail stay aligned.
  const invoice = await prisma.$transaction((tx) =>
    createInvoiceRecord({
      tx,
      adminId: admin.id,
      currency: parsed.data.currency,
      taxMode,
      customerId: customer.id,
      bookingId: resolvedBookingId,
      bookingIds: resolvedBookingIds,
      customerSnapshot: customerSnapshotFromCustomer(customer),
      invoiceDiscount: {
        discountKind: parsed.data.discountKind ?? null,
        discountValue: parsed.data.discountValue ?? null
      },
      lineItems,
      notes: parsed.data.notes,
      issuedAt,
      dueAt
    })
  );

  return NextResponse.json({ invoice: withResolvedInvoicePaymentDetails(invoice) }, { status: 201 });
}
