import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  getLessonPricingSettingsState,
  saveLessonPricingSettings
} from "@/lib/lesson-pricing";
import { lessonPricingSettingsInputSchema } from "@/lib/lesson-pricing-contract";

function formatFieldErrors(issues: Array<{ path: Array<string | number>; message: string }>) {
  return Object.fromEntries(
    issues.map((issue) => [issue.path.join(".") || "lessonPricingOptions", issue.message])
  );
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const lessonPricingSettings = await getLessonPricingSettingsState();
  return NextResponse.json({
    ok: true,
    lessonPricingSettings
  });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = lessonPricingSettingsInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid lesson pricing payload.",
          fieldErrors: formatFieldErrors(parsed.error.issues)
        },
        { status: 400 }
      );
    }

    const lessonPricingSettings = await saveLessonPricingSettings(parsed.data);
    return NextResponse.json({
      ok: true,
      lessonPricingSettings
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save lesson pricing settings.");
  }
}
