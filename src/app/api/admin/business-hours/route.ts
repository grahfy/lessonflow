import { NextRequest, NextResponse } from "next/server";

import { requireOwnerFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { businessHoursInputSchema, getBusinessHours, saveBusinessHours } from "@/lib/booking/business-hours";

/**
 * Builds `{ "weekdays.3.closeMinute": "..." }`-style field errors straight
 * from zod issues rather than `.flatten()`, which collapses every weekday's
 * failure under one "weekdays" key and drops which of the 7 rows it was.
 * Mirrors the same fix already used in `/api/admin/lesson-pricing`.
 */
function formatFieldErrors(issues: Array<{ path: Array<string | number>; message: string }>) {
  return Object.fromEntries(issues.map((issue) => [issue.path.join(".") || "weekdays", issue.message]));
}

export async function GET(request: NextRequest) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const businessHours = await getBusinessHours();
  return NextResponse.json({ ok: true, businessHours });
}

async function upsertBusinessHours(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = businessHoursInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid business hours payload.",
          fieldErrors: formatFieldErrors(parsed.error.issues)
        },
        { status: 400 }
      );
    }

    const businessHours = await saveBusinessHours(parsed.data);
    return NextResponse.json({ ok: true, businessHours });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save business hours.");
  }
}

// The editor may PUT or POST; both fully replace the singleton the same way.
export const POST = upsertBusinessHours;
export const PUT = upsertBusinessHours;
