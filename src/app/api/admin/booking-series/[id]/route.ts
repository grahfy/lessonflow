import { NextRequest, NextResponse } from "next/server";

import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Cancels upcoming bookings in a recurring series and marks the series inactive.
 *
 * Existing past bookings are preserved for history/invoicing; only upcoming bookings are cancelled.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const now = new Date();
    const series = await prisma.bookingSeries.findUnique({
      where: { id },
      select: {
        id: true,
        assignedTeacherId: true
      }
    });
    if (!series) {
      return NextResponse.json({ error: "Booking series not found." }, { status: 404 });
    }
    if (!canManageAssignedTeacher(admin, series.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Keep future-booking cancellation, series deactivation, and audit logging
    // atomic so the UI never sees a partial series removal.
    await prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: {
          seriesId: id,
          startAt: {
            gte: now
          }
        },
        data: {
          status: "cancelled",
          cancelledAt: now,
          modifiedById: admin.id
        }
      });

      await tx.bookingSeries.update({
        where: { id },
        data: {
          isActive: false
        }
      });

      await tx.bookingAuditLog.create({
        data: {
          actorId: admin.id,
          action: "series_removed",
          details: `Series ${id} removed from ${now.toISOString()}`
        }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to remove booking series.");
  }
}
