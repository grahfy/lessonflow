import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";

/**
 * Returns the last 100 deployment updates from the database.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const history = await prisma.deployUpdate.findMany({
      orderBy: { appliedAt: "desc" },
      take: 100,
      include: {
        commits: {
          orderBy: { authoredAt: "desc" }
        }
      }
    });

    return NextResponse.json({
      updates: history.map(update => ({
        branch: update.branch,
        release: update.release,
        appliedAt: update.appliedAt.toISOString(),
        commit: update.commit,
        shortCommit: update.shortCommit,
        previousCommit: update.previousCommit,
        commits: update.commits.map(c => ({
          hash: c.hash,
          shortHash: c.shortHash,
          authorName: c.authorName,
          authoredAt: c.authoredAt.toISOString(),
          subject: c.subject,
          body: c.body || ""
        }))
      }))
    }, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load deployment history.");
  }
}
