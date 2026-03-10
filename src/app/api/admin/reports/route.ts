/**
 * Admin Reports API Route
 * 
 * Aggregates high-level business metrics for the admin dashboard.
 * Supports both rolling (last 30 days) and custom date ranges for analysis.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { getAdminReportsDashboard } from "@/lib/admin-reports";

/**
 * GET: Returns dashboard-ready reporting metrics and chart data.
 * 
 * PARAMS:
 * - start (optional): YYYY-MM-DD
 * - end (optional): YYYY-MM-DD
 * 
 * LOGIC:
 * 1. Verifies admin session.
 * 2. If start/end dates are provided, validates they are valid YYYY-MM-DD format 
 *    and logically consistent (start <= end).
 * 3. Hands off to the `getAdminReportsDashboard` service which performs the 
 *    complex aggregations and trend calculations.
 * 
 * @param request - Paged/Filtered query parameters
 * @returns Serialized reporting payload
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

    // Optional Custom Date Range Logic
    if (startParam || endParam) {
      if (!startParam || !endParam) {
        return NextResponse.json({ error: "Both start and end dates are required for custom ranges." }, { status: 400 });
      }

      // RATIONALE: Appending time ensures consistent local-day start for date range parsing.
      const parsedStart = new Date(`${startParam}T00:00:00`);
      const parsedEnd = new Date(`${endParam}T00:00:00`);

      if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid report date range format." }, { status: 400 });
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
