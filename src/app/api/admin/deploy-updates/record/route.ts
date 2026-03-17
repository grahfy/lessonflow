import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCronSecret } from "@/lib/env";
import { jsonUnexpectedError } from "@/lib/api-errors";

/**
 * Records a new deployment update in the database.
 * This is called by deploy/deploy.sh after a successful deployment.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = getCronSecret();

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { branch, release, commit, shortCommit, previousCommit, appliedAt, commits } = body;

    if (!commit || !branch) {
      return NextResponse.json({ error: "Missing required fields: commit and branch" }, { status: 400 });
    }

    // Keep the deploy record and commit-list replacement atomic so malformed
    // commit payloads cannot wipe an existing deployment history entry.
    const deployUpdate = await prisma.$transaction(async (tx) => {
      const savedDeployUpdate = await tx.deployUpdate.upsert({
        where: { commit },
        update: {
          branch,
          release: release || "",
          appliedAt: appliedAt ? new Date(appliedAt) : new Date(),
          shortCommit,
          previousCommit: previousCommit || null,
        },
        create: {
          branch,
          release: release || "",
          appliedAt: appliedAt ? new Date(appliedAt) : new Date(),
          commit,
          shortCommit,
          previousCommit: previousCommit || null,
        },
      });

      await tx.deployCommit.deleteMany({
        where: { deployUpdateId: savedDeployUpdate.id },
      });

      if (Array.isArray(commits) && commits.length > 0) {
        await tx.deployCommit.createMany({
          data: commits.map((c: { hash: string; shortHash: string; authorName: string; authoredAt: string | Date; subject: string; body?: string | null }) => ({
            deployUpdateId: savedDeployUpdate.id,
            hash: c.hash,
            shortHash: c.shortHash,
            authorName: c.authorName,
            authoredAt: new Date(c.authoredAt),
            subject: c.subject,
            body: c.body || null,
          })),
        });
      }

      return savedDeployUpdate;
    });

    return NextResponse.json({ success: true, id: deployUpdate.id });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to record deployment update.");
  }
}
