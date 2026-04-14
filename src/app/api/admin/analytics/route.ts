/**
 * Admin Analytics API Route
 *
 * Returns page view analytics dashboard data for the admin console.
 * Owner-only access. Mirrors the pattern in admin/reports/route.ts.
 */

import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { getAnalyticsDashboard } from "@/lib/analytics-dashboard";
import { jsonUnexpectedError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dashboard = await getAnalyticsDashboard(new Date());

    return NextResponse.json(dashboard, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load analytics dashboard.");
  }
}
