import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { sitePopupInputSchema } from "@/lib/popups/popup-contract";
import { deletePopup, getPopup, requireOwnerAdminOrResponse, updatePopup } from "@/lib/popups/popups";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Returns a single popup. Owner-only (AC-26).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const guard = await requireOwnerAdminOrResponse(request);
  if ("response" in guard) {
    return guard.response;
  }

  const { id } = await params;
  const popup = await getPopup(id);
  if (!popup) {
    return NextResponse.json({ ok: false, error: "Popup not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, popup });
}

/**
 * Updates a popup. Owner-only (AC-26). Takes the full payload, same schema
 * as create — see sitePopupInputSchema's doc comment for why this isn't a
 * `.partial()` update.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const guard = await requireOwnerAdminOrResponse(request);
    if ("response" in guard) {
      return guard.response;
    }

    const { id } = await params;
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

    const popup = await updatePopup(id, parsed.data);
    return NextResponse.json({ ok: true, popup });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update popup.");
  }
}

/**
 * Deletes a popup. Owner-only (AC-26). Real delete — see deletePopup's doc
 * comment for why there's no archive/soft-delete path here.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const guard = await requireOwnerAdminOrResponse(request);
    if ("response" in guard) {
      return guard.response;
    }

    const { id } = await params;
    await deletePopup(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete popup.");
  }
}
