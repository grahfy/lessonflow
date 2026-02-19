import { NextRequest, NextResponse } from "next/server";
import { Prisma, InvoiceTaxMode } from "@prisma/client";
import { z } from "zod";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { getInvoiceAgingBucket, getInvoiceOverdueDays } from "@/lib/invoices/aging";
import { getDefaultInvoiceTaxMode } from "@/lib/invoices/gst-policy";
import { listInvoicesQuerySchema, invoiceLineItemInputSchema } from "@/lib/invoices/schema";
import { createInvoiceRecord, getDefaultDueAt } from "@/lib/invoices/persistence";
import { customerSnapshotFromCustomer } from "@/lib/invoices/snapshots";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";

const createCustomerInvoiceSchema = z.object({
  lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100),
  dueAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
  taxMode: z.nativeEnum(InvoiceTaxMode).optional()
});

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
  const [invoices, total] = await prisma.$transaction([
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
}

/**
 * Creates an invoice directly from a selected customer profile.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const taxMode = parsed.data.taxMode ?? getDefaultInvoiceTaxMode();
  const lineItems: InvoiceLineItemDraft[] = parsed.data.lineItems.map((lineItem, index) => ({
    description: lineItem.description,
    quantity: lineItem.quantity,
    unitPriceCents: lineItem.unitPriceCents,
    taxMode: lineItem.taxMode ?? taxMode,
    kind: lineItem.kind,
    sortOrder: lineItem.sortOrder ?? index
  }));

  const issuedAt = new Date();
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : getDefaultDueAt(issuedAt);
  const invoice = await prisma.$transaction((tx) =>
    createInvoiceRecord({
      tx,
      adminId: admin.id,
      taxMode,
      customerId: customer.id,
      customerSnapshot: customerSnapshotFromCustomer(customer),
      lineItems,
      notes: parsed.data.notes,
      issuedAt,
      dueAt
    })
  );

  return NextResponse.json({ invoice }, { status: 201 });
}
