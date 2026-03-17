import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { getInvoiceAgingBucket, getInvoiceOverdueDays } from "@/lib/invoices/aging";
import { getDefaultInvoiceTaxMode } from "@/lib/invoices/gst-policy";
import { createCustomerInvoiceSchema, listInvoicesQuerySchema } from "@/lib/invoices/schema";
import { createInvoiceRecord, getDefaultDueAt } from "@/lib/invoices/persistence";
import { customerSnapshotFromCustomer } from "@/lib/invoices/snapshots";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

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
            customerId: id
          },
          orderBy: {
            startAt: "desc"
          },
          take: 80,
          select: {
            id: true,
            status: true,
            startAt: true,
            lessonMode: true,
            lessonDuration: true,
            customDurationMinutes: true
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
            customDurationMinutes: true
          }
        })
  ]);

  return NextResponse.json({
    invoices: invoices.map((invoice) => ({
      ...invoice,
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

  if (parsed.data.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: parsed.data.bookingId },
      select: {
        id: true,
        customerId: true
      }
    });
    if (!booking) {
      return NextResponse.json({ error: "Selected booking does not exist." }, { status: 400 });
    }
    if (booking.customerId !== customer.id) {
      return NextResponse.json({ error: "Selected booking does not belong to this customer." }, { status: 400 });
    }
  }

  const taxMode = parsed.data.taxMode ?? getDefaultInvoiceTaxMode();
  // Normalize request payload into the persistence-layer draft shape before transactional create.
  const lineItems: InvoiceLineItemDraft[] = parsed.data.lineItems.map((lineItem, index) => ({
    description: lineItem.description,
    quantity: lineItem.quantity,
    unitPriceCents: lineItem.unitPriceCents,
    taxMode: lineItem.taxMode ?? taxMode,
    kind: lineItem.kind,
    sortOrder: lineItem.sortOrder ?? index,
    discountKind: lineItem.discountKind ?? null,
    discountValue: lineItem.discountValue ?? null
  }));

  const issuedAt = new Date();
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : getDefaultDueAt(issuedAt);
  // Customer-linked invoice creation is transactional so numbering + line items + audit trail stay aligned.
  const invoice = await prisma.$transaction((tx) =>
    createInvoiceRecord({
      tx,
      adminId: admin.id,
      taxMode,
      customerId: customer.id,
      bookingId: parsed.data.bookingId ?? null,
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

  return NextResponse.json({ invoice }, { status: 201 });
}
