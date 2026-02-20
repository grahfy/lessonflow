import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/observability";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Cancels an upcoming booking owned by the authenticated student.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: {
      id
    }
  });
  if (!booking || booking.customerId !== student.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Booking is already cancelled." }, { status: 400 });
  }
  if (booking.startAt <= new Date()) {
    return NextResponse.json({ error: "Only upcoming bookings can be cancelled." }, { status: 400 });
  }

  const cancelled = await prisma.booking.update({
    where: {
      id: booking.id
    },
    data: {
      status: "cancelled",
      cancelledAt: new Date()
    }
  });

  await prisma.bookingAuditLog.create({
    data: {
      bookingId: booking.id,
      action: "cancelled",
      details: `Cancelled by student portal (${student.id}).`
    }
  });

  logEvent("student_portal.booking.cancelled", {
    bookingId: cancelled.id,
    customerId: student.id,
    startAt: cancelled.startAt.toISOString()
  });

  return NextResponse.json({
    booking: {
      id: cancelled.id,
      status: cancelled.status,
      cancelledAt: cancelled.cancelledAt?.toISOString() || null
    }
  });
}
