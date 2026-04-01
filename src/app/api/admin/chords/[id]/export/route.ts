import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { getChord } from "@/lib/chords/chords";
import { chordToPng } from "@/lib/chords/chord-export";
import type { ChordDiagramData } from "@/lib/chords/chord-types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Exports a chord diagram as a PNG image. Available to all admin roles.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const chord = await getChord(id);
    if (!chord) {
      return NextResponse.json({ ok: false, error: "Chord not found." }, { status: 404 });
    }

    const png = await chordToPng(chord.diagram as unknown as ChordDiagramData);

    return new NextResponse(png as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${chord.name.replace(/[^a-zA-Z0-9]/g, "_")}.png"`,
      },
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to export chord.");
  }
}
