import { NextRequest, NextResponse } from "next/server";

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

    // Series removal is modeled as status cancellation on future bookings rather than hard delete.
    await prisma.booking.updateMany({
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

    await prisma.bookingSeries.update({
      where: { id },
      data: {
        isActive: false
      }
    });

    await prisma.bookingAuditLog.create({
      data: {
        actorId: admin.id,
        action: "series_removed",
        details: `Series ${id} removed from ${now.toISOString()}`
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to remove booking series.");
  }
}
