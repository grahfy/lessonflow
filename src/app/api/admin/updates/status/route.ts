import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { getUpdateStatus, getPendingCommits, type CommitMetadata } from "@/lib/services/updates-service";
import { jsonUnexpectedError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const forceFetch = searchParams.get("force") === "true";

    const status = await getUpdateStatus(forceFetch);
    
    let pendingCommits: CommitMetadata[] = [];
    if (status.updateAvailable) {
      pendingCommits = await getPendingCommits(status.localSha, status.remoteSha);
    }

    return NextResponse.json({
      ok: true,
      ...status,
      pendingCommits
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to retrieve update status.");
  }
}
