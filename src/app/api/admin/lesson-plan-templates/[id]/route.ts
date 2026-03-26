import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { lessonPlanTemplateV2InputSchema } from "@/lib/lesson-plan-contract";
import { archiveLessonPlanTemplate, updateLessonPlanTemplateV2 } from "@/lib/lesson-plans";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function formatFieldErrors(issues: Array<{ path: Array<string | number>; message: string }>) {
  return Object.fromEntries(
    issues.map((issue) => [issue.path.join(".") || "template", issue.message])
  );
}

/**
 * Updates one reusable lesson-plan template.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = lessonPlanTemplateV2InputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid lesson-plan template payload.",
          fieldErrors: formatFieldErrors(parsed.error.issues)
        },
        { status: 400 }
      );
    }

    const { id } = await params;
    const template = await updateLessonPlanTemplateV2(admin, id, parsed.data);
    return NextResponse.json({
      ok: true,
      template
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update lesson-plan template.");
  }
}

/**
 * Archives one lesson-plan template without deleting historical booking links.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await archiveLessonPlanTemplate(admin, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to archive lesson-plan template.");
  }
}
