import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { upsertQuickCaptureNotes } from "@/lib/lesson-plans";

type Params = { params: Promise<{ id: string }> };

const quickCaptureSchema = z.object({
  notes: z.string().max(10_000),
});

/**
 * PUT /api/admin/bookings/[id]/lesson-plan/quick-capture
 *
 * Saves or updates quick-capture bullet notes for a booking's lesson plan.
 * Creates a draft lesson plan if none exists yet.
 */
export async function PUT(request: NextRequest, { params }: Params) {
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

    const body = await request.json();
    const parsed = quickCaptureSchema.parse(body);

    const lessonPlan = await upsertQuickCaptureNotes(
      { id: admin.id, role: admin.role },
      bookingId,
      parsed.notes
    );

    return NextResponse.json({ ok: true, lessonPlan });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save quick capture notes.");
  }
}
