/**
 * Admin Invoices API Route
 * 
 * Provides financial document management (Invoices and Credit Notes).
 * Handles sophisticated filtering (search, status, aging) and atomic creation.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { getInvoiceAgingBucket, getInvoiceOverdueDays } from "@/lib/invoices/aging";
import { createInvoiceSchema, listInvoicesQuerySchema } from "@/lib/invoices/schema";
import { createInvoiceRecord } from "@/lib/invoices/persistence";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";

/**
 * GET: Lists invoices using complex query filters for admin dashboard views.
 * 
 * FILTER CAPABILITIES:
 * 1. Text Search: Fuzzy match on invoice number, customer name, and email.
 * 2. Status: Filter by 'draft', 'issued', 'paid', 'void'.
 * 3. Outstanding: One-click filter for unpaid items past their due date.
 * 4. Aging: Group by 'current' (not due), 'overdue 1-30 days', 'overdue 30+ days'.
 * 
 * DESIGN RATIONALE: We build the 'where' clause incrementally to allow 
 * multi-axis filtering (e.g., Search for "John" AND Status "Paid").
 * 
 * @param request - Filter/Sort/Page params
 * @returns Sorted and paged array of enriched invoice objects
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = listInvoicesQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      sortBy: request.nextUrl.searchParams.get("sortBy") ?? undefined,
      sortDir: request.nextUrl.searchParams.get("sortDir") ?? undefined,
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

    // Incremental Filter Builder
    const where: Prisma.InvoiceWhereInput = {
      isDeleted: false
    };

    if (parsed.data.status) {
      where.status = parsed.data.status;
    }
    if (parsed.data.customerId) {
      where.customerId = parsed.data.customerId;
    }

    // LOGIC: "Outstanding" is a composite filter (Not Paid/Void AND Passed Due Date)
    if (parsed.data.outstanding === "true") {
      const now = new Date();
      // Snap to UTC start of day for stable filtering
      const nowUtcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const overdueCutoff = new Date(nowUtcDayStart.getTime() - 24 * 60 * 60 * 1000);
      
      where.status = { notIn: ["paid", "void"] };
      where.documentType = "invoice";
      where.dueAt = { lt: overdueCutoff };
    }

    if (parsed.data.q) {
      where.OR = [
        { invoiceNumber: { contains: parsed.data.q } },
        { customerName: { contains: parsed.data.q } },
        { customerEmail: { contains: parsed.data.q } }
      ];
    }

    // LOGIC: Aging Buckets help admins prioritize collection efforts.
    if (parsed.data.agingBucket) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      where.status = { notIn: ["paid", "void"] };

      if (parsed.data.agingBucket === "current") {
        where.dueAt = { gte: now };
      } else if (parsed.data.agingBucket === "overdue_1_30") {
        where.dueAt = { lt: now, gte: thirtyDaysAgo };
      } else {
        where.dueAt = { lt: thirtyDaysAgo };
      }
    }

    // Dynamic Sort Order Builder
    const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = (() => {
      const { sortBy, sortDir } = parsed.data;
      if (sortBy === "customer_last_name") {
        return [{ customerLastName: sortDir }, { customerFirstName: sortDir }, { customerName: sortDir }, { invoiceNumber: "desc" }];
      }
      if (sortBy === "status") {
        return [{ status: sortDir }, { dueAt: "asc" }, { invoiceNumber: "desc" }];
      }
      if (sortBy === "total") {
        return [{ totalCents: sortDir }, { invoiceNumber: "desc" }];
      }
      if (sortBy === "due_date") {
        return [{ dueAt: sortDir }, { invoiceNumber: "desc" }];
      }
      return [{ invoiceNumber: sortDir }];
    })();

    const skip = (parsed.data.page - 1) * parsed.data.pageSize;

    // Execute in transaction for consistency
    const [invoices, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        orderBy,
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } }
        },
        skip,
        take: parsed.data.pageSize
      }),
      prisma.invoice.count({ where })
    ]);

    // Enriched Response (Add dynamic fields like overdueDays)
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
 * POST: Atomic creation of an invoice.
 * 
 * ARCHITECTURE:
 * 1. Validates input schema (Zod).
 * 2. Checks entity integrity (customer and booking existence).
 * 3. Normalizes line items.
 * 4. HANDS OFF to `createInvoiceRecord` inside a PRISMA TRANSACTION.
 * 
 * RATIONALE: Numbering, total recalculation, and audit logging MUST 
 * succeed or fail as a single unit to maintain financial integrity.
 * 
 * @param request - Validated invoice payload
 * @returns Completed invoice record with generated number and totals
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invoice payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    // Entity verification
    if (parsed.data.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId } });
      if (!customer || customer.isArchived) {
        return NextResponse.json({ error: "Selected customer does not exist." }, { status: 400 });
      }
    }

    if (parsed.data.bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: parsed.data.bookingId },
        select: { id: true, customerId: true }
      });
      if (!booking) {
        return NextResponse.json({ error: "Selected booking does not exist." }, { status: 400 });
      }
      if (parsed.data.customerId && booking.customerId && booking.customerId !== parsed.data.customerId) {
        return NextResponse.json({ error: "Selected booking does not belong to selected customer." }, { status: 400 });
      }
    }

    // Mapping Draft Line Items
    const lineItems: InvoiceLineItemDraft[] = parsed.data.lineItems.map((lineItem) => ({
      description: lineItem.description,
      quantity: lineItem.quantity,
      unitPriceCents: lineItem.unitPriceCents,
      taxMode: lineItem.taxMode,
      kind: lineItem.kind,
      sortOrder: lineItem.sortOrder,
      discountKind: lineItem.discountKind ?? null,
      discountValue: lineItem.discountValue ?? null
    }));

    const issuedAt = parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : new Date();
    const dueAt = new Date(parsed.data.dueAt);

    // CRITICAL: Everything happens inside this transaction
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceRecord({
        tx,
        adminId: admin.id,
        taxMode: parsed.data.taxMode,
        customerId: parsed.data.customerId ?? null,
        bookingId: parsed.data.bookingId ?? null,
        customerSnapshot: {
          customerFirstName: parsed.data.customerFirstName,
          customerLastName: parsed.data.customerLastName,
          customerName: parsed.data.customerName,
          customerEmail: parsed.data.customerEmail,
          customerPhone: parsed.data.customerPhone,
          customerAddress: parsed.data.customerAddress
        },
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
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create invoice.");
  }
}
