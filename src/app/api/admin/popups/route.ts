import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { sitePopupInputSchema } from "@/lib/popups/popup-contract";
import { createPopup, listPopups, requireOwnerAdminOrResponse } from "@/lib/popups/popups";

/**
 * Lists every popup, newest first. Owner-only (AC-26).
 */
export async function GET(request: NextRequest) {
  const guard = await requireOwnerAdminOrResponse(request);
  if ("response" in guard) {
    return guard.response;
  }

  const popups = await listPopups();
  return NextResponse.json({ ok: true, popups });
}

/**
 * Creates a new popup. Owner-only (AC-26).
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireOwnerAdminOrResponse(request);
    if ("response" in guard) {
      return guard.response;
    }

    const parsed = sitePopupInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      // `details: flatten()` (not a top-level `fieldErrors`) matches the house
      // convention `readApiFieldErrors` (@/lib/admin/utils) actually reads —
      // see customers/route.ts, bookings/route.ts, etc.
      return NextResponse.json(
        { error: "Invalid popup data.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const popup = await createPopup(parsed.data, guard.admin.id);
    return NextResponse.json({ ok: true, popup });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create popup.");
  }
}
