import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { getPopup, getPopupDayStats, requireOwnerAdminOrResponse } from "@/lib/popups/popups";

type Params = { params: Promise<{ id: string }> };

/**
 * AC-44 — per-day popup stats for the admin detail view. Owner-only (AC-26).
 * Fixed 30-day lookback, zero-filled — see getPopupDayStats's doc comment.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireOwnerAdminOrResponse(request);
    if ("response" in guard) {
      return guard.response;
    }

    const { id } = await params;
    const popup = await getPopup(id);
    if (!popup) {
      return NextResponse.json({ error: "Popup not found." }, { status: 404 });
    }

    const days = await getPopupDayStats(id);
    return NextResponse.json({ ok: true, days });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load popup stats.");
  }
}
