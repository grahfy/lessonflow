import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { getHomeworkCompletions } from "@/lib/homework-completions";
import { requireStudentFromRequest } from "@/lib/student-portal/session";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ lessonPlanId: string }> };

/**
 * GET /api/student/homework/[lessonPlanId]
 *
 * Returns all homework completions for a lesson plan belonging to the
 * authenticated student.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lessonPlanId } = await params;

    // Verify the lesson plan belongs to the student's booking.
    const plan = await prisma.lessonPlan.findUnique({
      where: { id: lessonPlanId },
      select: {
        id: true,
        booking: { select: { customerId: true } }
      }
    });

    if (!plan || plan.booking.customerId !== student.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const completions = await getHomeworkCompletions(lessonPlanId);
    return NextResponse.json({ ok: true, completions });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to fetch homework completions.");
  }
}
