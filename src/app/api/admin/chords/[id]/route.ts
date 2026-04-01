import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest, requireOwnerFromRequest } from "@/lib/admin-route";
import { updateChordInputSchema } from "@/lib/chords/chord-contract";
import { getChord, updateChord, archiveChord } from "@/lib/chords/chords";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Returns a single chord. Available to all admin roles.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const chord = await getChord(id);
  if (!chord) {
    return NextResponse.json({ ok: false, error: "Chord not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, chord });
}

/**
 * Updates a chord. Owner-only.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsed = updateChordInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid chord data.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const chord = await updateChord(id, parsed.data);
    return NextResponse.json({ ok: true, chord });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update chord.");
  }
}

/**
 * Archives a chord (soft delete). Owner-only.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await archiveChord(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to archive chord.");
  }
}
