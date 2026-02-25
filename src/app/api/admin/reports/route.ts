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

    const dashboard = await getAdminReportsDashboard();
    return NextResponse.json(dashboard, {
      headers: {
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load admin reports.");
  }
}
