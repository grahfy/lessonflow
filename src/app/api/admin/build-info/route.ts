import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { getAdminBuildInfo } from "@/lib/build-info";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      buildInfo: await getAdminBuildInfo()
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to load build information.");
  }
}
