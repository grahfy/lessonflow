import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { chordDiagramDataSchema } from "@/lib/chords/chord-contract";
import { getChordChart } from "@/lib/chords/chord-charts";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Trims an admin-shaped chart row (creator names, raw diagram JSON) down to
 * what the read-only student chord browser needs.
 */
function serializeChartForStudent(chart: NonNullable<Awaited<ReturnType<typeof getChordChart>>>) {
  return {
    id: chart.id,
    title: chart.title,
    description: chart.description,
    items: chart.items.map((item) => ({
      chordId: item.chordId,
      sortOrder: item.sortOrder,
      annotation: item.annotation,
      chord: {
        id: item.chord.id,
        name: item.chord.name,
        root: item.chord.root,
        quality: item.chord.quality,
        diagram: chordDiagramDataSchema.parse(item.chord.diagram)
      }
    }))
  };
}

/**
 * Read-only single chord chart lookup for the student chord browser
 * (AC-1..AC-3, AC-11). `getChordChart()` does not itself filter archived rows
 * (the admin edit screen needs to load an archived chart to unarchive it), so
 * this route enforces the archived-is-invisible rule itself: an archived
 * chart 404s exactly like a missing one, since students must never see
 * archived chord data by design. GET-only: no write handler exists here.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const chart = await getChordChart(id);
    if (!chart || chart.isArchived) {
      return NextResponse.json({ error: "Chart not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, chart: serializeChartForStudent(chart) });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load chord chart.");
  }
}
