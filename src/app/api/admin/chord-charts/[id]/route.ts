import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { updateChordChartInputSchema } from "@/lib/chords/chord-contract";
import { getChordChart, updateChordChart, archiveChordChart } from "@/lib/chords/chord-charts";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const chart = await getChordChart(id);
  if (!chart) {
    return NextResponse.json({ ok: false, error: "Chart not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, chart });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsed = updateChordChartInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid chart data.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const chart = await updateChordChart(id, parsed.data);
    return NextResponse.json({ ok: true, chart });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update chord chart.");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await archiveChordChart(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to archive chord chart.");
  }
}
