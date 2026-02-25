import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { getInvoiceAgingBucket, getInvoiceOverdueDays } from "@/lib/invoices/aging";
import { createInvoiceSchema, listInvoicesQuerySchema } from "@/lib/invoices/schema";
import { createInvoiceRecord } from "@/lib/invoices/persistence";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";

/**
 * Lists invoices using query filters designed for admin search and outstanding views.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = listInvoicesQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      agingBucket: request.nextUrl.searchParams.get("agingBucket") ?? undefined,
      customerId: request.nextUrl.searchParams.get("customerId") ?? undefined,
      outstanding: request.nextUrl.searchParams.get("outstanding") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    // Build the filter incrementally so the admin UI can combine search + status + aging filters
    // without exploding route branches for every permutation.
    const where: Prisma.InvoiceWhereInput = {
      isDeleted: false
    };

    if (parsed.data.status) {
      where.status = parsed.data.status;
    }
    if (parsed.data.customerId) {
      where.customerId = parsed.data.customerId;
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
        where.dueAt = {
          lt: now,
          gte: thirtyDaysAgo
        };
      } else {
        where.dueAt = {
          lt: thirtyDaysAgo
        };
      }
    }

    const skip = (parsed.data.page - 1) * parsed.data.pageSize;
    // Fetch rows and total count in one transaction so pagination metadata matches the same filter snapshot.
    const [invoices, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
        include: {
          lineItems: {
            orderBy: {
              sortOrder: "asc"
            }
          }
        },
        skip,
        take: parsed.data.pageSize
      }),
      prisma.invoice.count({ where })
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
      totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load invoices.");
  }
}

/**
 * Creates an invoice from direct payload values, preserving snapshots and line-item totals.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invoice payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId } });
      if (!customer || customer.isArchived) {
        return NextResponse.json({ error: "Selected customer does not exist." }, { status: 400 });
      }
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
      if (parsed.data.customerId && booking.customerId && booking.customerId !== parsed.data.customerId) {
        return NextResponse.json({ error: "Selected booking does not belong to selected customer." }, { status: 400 });
      }
    }

    // Normalize request payload into the persistence-layer draft shape before transactional create.
    const lineItems: InvoiceLineItemDraft[] = parsed.data.lineItems.map((lineItem) => ({
      description: lineItem.description,
      quantity: lineItem.quantity,
      unitPriceCents: lineItem.unitPriceCents,
      taxMode: lineItem.taxMode,
      kind: lineItem.kind,
      sortOrder: lineItem.sortOrder
    }));

    const issuedAt = parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : new Date();
    const dueAt = new Date(parsed.data.dueAt);
    // Numbering, totals, line items, and audit logs must be committed atomically.
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceRecord({
        tx,
        adminId: admin.id,
        taxMode: parsed.data.taxMode,
        customerId: parsed.data.customerId ?? null,
        bookingId: parsed.data.bookingId ?? null,
        customerSnapshot: {
          customerName: parsed.data.customerName,
          customerEmail: parsed.data.customerEmail,
          customerPhone: parsed.data.customerPhone,
          customerAddress: parsed.data.customerAddress
        },
        lineItems,
        notes: parsed.data.notes,
        issuedAt,
        dueAt
      })
    );

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create invoice.");
  }
}
