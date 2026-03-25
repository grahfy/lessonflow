import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { lessonPlanTemplateInputSchema } from "@/lib/lesson-plan-contract";
import { createLessonPlanTemplate, listLessonPlanTemplates } from "@/lib/lesson-plans";

function formatFieldErrors(issues: Array<{ path: Array<string | number>; message: string }>) {
  return Object.fromEntries(
    issues.map((issue) => [issue.path.join(".") || "template", issue.message])
  );
}

/**
 * Returns the active lesson-plan template library visible to the signed-in staff account.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const templates = await listLessonPlanTemplates();
  return NextResponse.json({
    ok: true,
    templates
  });
}

/**
 * Creates one reusable lesson-plan template for the current admin.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = lessonPlanTemplateInputSchema.safeParse(await request.json().catch(() => null));
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

    const template = await createLessonPlanTemplate(admin, parsed.data);
    return NextResponse.json({
      ok: true,
      template
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create lesson-plan template.");
  }
}
