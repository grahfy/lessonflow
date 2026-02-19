import { NextRequest, NextResponse } from "next/server";

import { getBookingEnd } from "@/lib/booking-rules";
import { sendCustomerBookingStatusEmail } from "@/lib/booking-events";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  const { id } = await params;

  const existing = await prisma.booking.findUnique({
    where: { id }
  });
  if (!existing) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (action === "cancel") {
    const booking = await prisma.booking.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        modifiedById: admin.id
      }
    });

    await prisma.bookingAuditLog.create({
      data: {
        bookingId: id,
        actorId: admin.id,
        action: "cancelled"
      }
    });

    await sendCustomerBookingStatusEmail({
      email: booking.email,
      name: booking.name,
      status: "cancelled",
      when: booking.startAt
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "move") {
    const newStart = new Date(String(body?.newStartAt || ""));
    if (Number.isNaN(newStart.getTime())) {
      return NextResponse.json({ error: "Invalid new start date." }, { status: 400 });
    }
    await prisma.booking.update({
      where: { id },
      data: {
        startAt: newStart,
        endAt: getBookingEnd(newStart, existing.lessonDuration),
        modifiedById: admin.id
      }
    });

    await prisma.bookingAuditLog.create({
      data: {
        bookingId: id,
        actorId: admin.id,
        action: "moved",
        details: `Moved to ${newStart.toISOString()}`
      }
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "edit") {
    const notes = typeof body?.notes === "string" ? body.notes : existing.notes;
    await prisma.booking.update({
      where: { id },
      data: {
        notes,
        modifiedById: admin.id
      }
    });
    await prisma.bookingAuditLog.create({
      data: {
        bookingId: id,
        actorId: admin.id,
        action: "edited"
      }
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
