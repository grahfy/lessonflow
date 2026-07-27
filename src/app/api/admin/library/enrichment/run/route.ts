import { NextRequest, NextResponse } from "next/server";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { processNextLibraryEnrichmentRun } from "@/lib/library/library-enrichment";

/**
 * Authenticated, bounded queue runner. A scheduler may call this endpoint, and
 * staff can safely invoke it during review; only one job is handled per request
 * to respect provider pacing on low-power deployments.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageLibrary(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(await processNextLibraryEnrichmentRun());
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to run library enrichment.");
  }
}
