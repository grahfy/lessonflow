import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { getChordChart } from "@/lib/chords/chord-charts";
import { generateChordChartPdf } from "@/lib/chords/chord-chart-pdf";
import type { ChordDiagramData } from "@/lib/chords/chord-types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Exports a chord chart as a PDF. Owner-only.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const chart = await getChordChart(id);
    if (!chart) {
      return NextResponse.json({ ok: false, error: "Chart not found." }, { status: 404 });
    }

    const pdfBuffer = await generateChordChartPdf(
      chart.title,
      chart.description,
      chart.items.map((item) => ({
        diagram: item.chord.diagram as unknown as ChordDiagramData,
        annotation: item.annotation,
      }))
    );

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${chart.title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")}.pdf"`,
      },
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to export chord chart.");
  }
}
