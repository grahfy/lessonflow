import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { getDefaultInvoiceTaxMode } from "@/lib/invoices/gst-policy";
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
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const taxMode = parsed.data.taxMode ?? getDefaultInvoiceTaxMode();
  const lineItems: InvoiceLineItemDraft[] = [
    {
      description: "Lesson fee",
      quantity: 1,
      unitPriceCents: parsed.data.lessonPriceCents,
      taxMode,
      kind: "lesson_fee",
      sortOrder: 0
    }
  ];

  if (parsed.data.includeEducationalBooks && parsed.data.educationalBooksPriceCents !== undefined) {
    lineItems.push({
      description: "Educational books",
      quantity: 1,
      unitPriceCents: parsed.data.educationalBooksPriceCents,
      taxMode,
      kind: "educational_books",
      sortOrder: lineItems.length
    });
  }

  if (parsed.data.includeDigitalGuitarLessons && parsed.data.digitalGuitarLessonsPriceCents !== undefined) {
    lineItems.push({
      description: "Digital guitar lessons",
      quantity: 1,
      unitPriceCents: parsed.data.digitalGuitarLessonsPriceCents,
      taxMode,
      kind: "digital_guitar_lessons",
      sortOrder: lineItems.length
    });
  }

  if (parsed.data.includeCustomCharge && parsed.data.customChargeDescription && parsed.data.customChargePriceCents !== undefined) {
    lineItems.push({
      description: parsed.data.customChargeDescription,
      quantity: 1,
      unitPriceCents: parsed.data.customChargePriceCents,
      taxMode,
      kind: "custom",
      sortOrder: lineItems.length
    });
  }

  const issuedAt = new Date();
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : getDefaultDueAt(issuedAt);
  const invoice = await prisma.$transaction((tx) =>
    createInvoiceRecord({
      tx,
      adminId: admin.id,
      taxMode,
      customerId: booking.customerId,
      bookingId: booking.id,
      customerSnapshot: customerSnapshotFromBooking(booking),
      lineItems,
      notes: parsed.data.notes,
      issuedAt,
      dueAt
    })
  );

  return NextResponse.json({ invoice }, { status: 201 });
}
