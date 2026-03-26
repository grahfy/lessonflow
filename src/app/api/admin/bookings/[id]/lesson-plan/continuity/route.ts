import { NextRequest, NextResponse } from "next/server";

import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { getLessonPlanContinuity } from "@/lib/lesson-plans";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/bookings/[id]/lesson-plan/continuity
 *
 * Returns the last 5 lesson plans for the same customer, ordered by
 * booking date descending. Used by the continuity sidebar to show
 * lesson history alongside the current plan editor.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id: bookingId } = await params;
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, assignedTeacherId: true },
    });
    if (!booking) {
      return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
    }
    if (!canManageAssignedTeacher(admin, booking.assignedTeacherId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const previousPlans = await getLessonPlanContinuity(bookingId);
    return NextResponse.json({ ok: true, previousPlans });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to fetch lesson plan continuity.");
  }
}
