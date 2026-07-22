import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { listChordCharts } from "@/lib/chords/chord-charts";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

/**
 * Read-only chord chart list for the student chord browser (AC-1..AC-3,
 * AC-11). `listChordCharts()` already scopes to `isArchived: false` by
 * default, matching every non-archived chart being visible to every
 * authenticated student. GET-only by design: no write handler exists here.
 *
 * The list is title/description only (no items) — full chart contents,
 * including diagrams, come from GET /chord-charts/{id}.
 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const charts = await listChordCharts();
    return NextResponse.json({
      ok: true,
      charts: charts.map((chart) => ({ id: chart.id, title: chart.title, description: chart.description }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load chord charts.");
  }
}
