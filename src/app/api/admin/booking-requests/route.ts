import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

/**
 * Returns pending booking requests for compact admin list/triage views.
 *
 * The full calendar view uses `/api/admin/bookings`; this route is a narrower pending-only helper.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await prisma.bookingRequest.findMany({
      where: {
        status: "pending"
      },
      orderBy: {
        requestedStartAt: "asc"
      }
    });

    return NextResponse.json({ rows });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load booking requests.");
  }
}
