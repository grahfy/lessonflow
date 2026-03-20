import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { createBookingInvoiceSchema } from "@/lib/invoices/schema";
import { getDefaultDueAt, createInvoiceRecord } from "@/lib/invoices/persistence";
import { customerSnapshotFromBooking } from "@/lib/invoices/snapshots";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Creates a draft invoice from a selected booking dialog action.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const booking = await prisma.booking.findUnique({
      where: { id }
    });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createBookingInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invoice payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const taxMode = parsed.data.taxMode ?? getDefaultInvoiceTaxModeForCurrencyValue(parsed.data.currency);
    const lineItems: InvoiceLineItemDraft[] = parsed.data.lineItems.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      taxMode: item.taxMode || taxMode,
      kind: item.kind,
      sortOrder: item.sortOrder ?? index,
      discountKind: item.discountKind ?? null,
      discountValue: item.discountValue ?? null
    }));

    const issuedAt = new Date();
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : getDefaultDueAt(issuedAt);
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceRecord({
        tx,
        adminId: admin.id,
        currency: parsed.data.currency,
        taxMode,
        customerId: booking.customerId,
        bookingId: booking.id,
        customerSnapshot: customerSnapshotFromBooking(booking),
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
