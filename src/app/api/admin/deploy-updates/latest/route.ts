import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { readLatestDeployUpdate } from "@/lib/deploy-updates";
import { prisma } from "@/lib/db";

/**
 * Returns the latest deployed commit metadata from the database,
 * falling back to the JSON file written by deploy.sh for admin update notices.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Try database first
    const latestDb = await prisma.deployUpdate.findFirst({
      orderBy: { appliedAt: "desc" },
      include: {
        commits: {
          orderBy: { authoredAt: "desc" }
        }
      }
    });

    if (latestDb) {
      return NextResponse.json({
        app: "lessonflow",
        branch: latestDb.branch,
        release: latestDb.release,
        appliedAt: latestDb.appliedAt.toISOString(),
        commit: latestDb.commit,
        shortCommit: latestDb.shortCommit,
        previousCommit: latestDb.previousCommit,
        commits: latestDb.commits.map(c => ({
          hash: c.hash,
          shortHash: c.shortHash,
          authorName: c.authorName,
          authoredAt: c.authoredAt.toISOString(),
          subject: c.subject,
          body: c.body || ""
        }))
      }, {
        headers: { "cache-control": "no-store" }
      });
    }

    // Fallback to JSON file
    const latestJson = await readLatestDeployUpdate();
    if (!latestJson) {
      return NextResponse.json({ error: "No deployment update metadata available yet." }, { status: 404 });
    }

    return NextResponse.json(latestJson, {
      headers: {
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load deployment updates.");
  }
}
