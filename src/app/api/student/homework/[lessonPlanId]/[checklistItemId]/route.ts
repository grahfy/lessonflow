import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { toggleHomeworkCompletion } from "@/lib/homework-completions";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

type Params = { params: Promise<{ lessonPlanId: string; checklistItemId: string }> };

/**
 * POST /api/student/homework/[lessonPlanId]/[checklistItemId]
 *
 * Toggles a homework checklist item completion for the authenticated student.
 * If already completed, marks it as uncompleted. If not, marks as completed.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lessonPlanId, checklistItemId } = await params;
    const result = await toggleHomeworkCompletion(
      student.id,
      lessonPlanId,
      checklistItemId
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to toggle homework completion.");
  }
}
