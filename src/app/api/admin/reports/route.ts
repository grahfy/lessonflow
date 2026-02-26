import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { getAdminReportsDashboard } from "@/lib/admin-reports";

/**
 * Returns dashboard-ready reporting metrics/charts for the admin reports screen.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startParam = request.nextUrl.searchParams.get("start");
    const endParam = request.nextUrl.searchParams.get("end");

    let customRangeStart: Date | undefined;
    let customRangeEnd: Date | undefined;

    if (startParam || endParam) {
      if (!startParam || !endParam) {
        return NextResponse.json({ error: "Both start and end dates are required." }, { status: 400 });
      }

      const parsedStart = new Date(`${startParam}T00:00:00`);
      const parsedEnd = new Date(`${endParam}T00:00:00`);
      if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid report date range." }, { status: 400 });
      }
      if (parsedStart > parsedEnd) {
        return NextResponse.json({ error: "Start date must be on or before end date." }, { status: 400 });
      }

      customRangeStart = parsedStart;
      customRangeEnd = parsedEnd;
    }

    const dashboard = await getAdminReportsDashboard(new Date(), { customRangeStart, customRangeEnd });
    return NextResponse.json(dashboard, {
      headers: {
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load admin reports.");
  }
}
