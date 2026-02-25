import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { readLatestDeployUpdate } from "@/lib/deploy-updates";

/**
 * Returns the latest deployed commit metadata written by deploy.sh for admin update notices.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const latest = await readLatestDeployUpdate();
    if (!latest) {
      return NextResponse.json({ error: "No deployment update metadata available yet." }, { status: 404 });
    }

    return NextResponse.json(latest, {
      headers: {
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load deployment updates.");
  }
}
