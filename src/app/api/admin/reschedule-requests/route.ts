import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { isOwner } from "@/lib/admin/permissions";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

/**
 * Lists pending student-initiated reschedule requests for the admin surface.
 *
 * Teachers see only requests against their own bookings (assignedTeacherId === me);
 * owners see all. Mirrors the role-scoping used elsewhere in the admin API.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requests = await prisma.bookingRescheduleRequest.findMany({
      where: {
        status: "pending",
        ...(isOwner(admin) ? {} : { booking: { assignedTeacherId: admin.id } })
      },
      include: {
        booking: {
          select: {
            id: true,
            name: true,
            email: true,
            startAt: true,
            endAt: true,
            lessonMode: true,
            lessonDuration: true,
            customDurationMinutes: true,
            assignedTeacherId: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    const payload = requests.map((requestRow) => ({
      id: requestRow.id,
      requestedStartAt: requestRow.requestedStartAt.toISOString(),
      reason: requestRow.reason,
      createdAt: requestRow.createdAt.toISOString(),
      booking: {
        id: requestRow.booking.id,
        name: requestRow.booking.name,
        email: requestRow.booking.email,
        startAt: requestRow.booking.startAt.toISOString(),
        endAt: requestRow.booking.endAt.toISOString(),
        lessonMode: requestRow.booking.lessonMode,
        lessonDuration: requestRow.booking.lessonDuration,
        customDurationMinutes: requestRow.booking.customDurationMinutes,
        assignedTeacherId: requestRow.booking.assignedTeacherId
      }
    }));

    return NextResponse.json({ rescheduleRequests: payload });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load reschedule requests.");
  }
}
