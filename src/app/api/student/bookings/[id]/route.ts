import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/observability";
import { studentPortalCancelBookingResponseSchema } from "@/lib/student-portal/contracts";
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
  try {
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

    // Keep the status transition and audit trail atomic so the portal does not
    // claim a cancellation failed after the booking was already changed.
    const cancelled = await prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: {
          id: booking.id
        },
        data: {
          status: "cancelled",
          cancelledAt: new Date()
        }
      });

      await tx.bookingAuditLog.create({
        data: {
          bookingId: booking.id,
          action: "cancelled",
          details: `Cancelled by student portal (${student.id}).`
        }
      });

      return updatedBooking;
    });

    logEvent("student_portal.booking.cancelled", {
      bookingId: cancelled.id,
      customerId: student.id,
      startAt: cancelled.startAt.toISOString()
    });

    const payload = studentPortalCancelBookingResponseSchema.parse({
      booking: {
        id: cancelled.id,
        status: cancelled.status,
        cancelledAt: cancelled.cancelledAt?.toISOString() || null
      }
    });

    return NextResponse.json(payload);
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to cancel booking.");
  }
}
