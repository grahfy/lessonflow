import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { createChordChartInputSchema } from "@/lib/chords/chord-contract";
import { listChordCharts, createChordChart } from "@/lib/chords/chord-charts";

/**
 * Returns all chord charts. Owner-only.
 */
export async function GET(request: NextRequest) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const charts = await listChordCharts();
  return NextResponse.json({ ok: true, charts });
}

/**
 * Creates a new chord chart. Owner-only.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = createChordChartInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid chart data.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const chart = await createChordChart(parsed.data, admin.id);
    return NextResponse.json({ ok: true, chart });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create chord chart.");
  }
}
