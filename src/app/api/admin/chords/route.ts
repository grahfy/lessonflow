import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest, requireOwnerFromRequest } from "@/lib/admin-route";
import { createChordInputSchema } from "@/lib/chords/chord-contract";
import { listChords, createChord } from "@/lib/chords/chords";


/**
 * Returns all chords in the library. Available to all admin roles
 * so teachers can pick chords for lesson plans.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const chords = await listChords();
  return NextResponse.json({ ok: true, chords });
}

/**
 * Creates a new chord in the library. Owner-only.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = createChordInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid chord data.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const chord = await createChord(parsed.data, admin.id);
    return NextResponse.json({ ok: true, chord });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create chord.");
  }
}
