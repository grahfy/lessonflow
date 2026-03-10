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

    // Upsert the deployment record
    const deployUpdate = await prisma.deployUpdate.upsert({
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

    // Replace commits for this deployment if it's an update, or create them for a new record.
    // We delete and recreate to ensure the commit list matches what was sent.
    await prisma.deployCommit.deleteMany({
      where: { deployUpdateId: deployUpdate.id },
    });

    if (Array.isArray(commits) && commits.length > 0) {
      await prisma.deployCommit.createMany({
        data: commits.map((c: { hash: string; shortHash: string; authorName: string; authoredAt: string | Date; subject: string; body?: string | null }) => ({
          deployUpdateId: deployUpdate.id,
          hash: c.hash,
          shortHash: c.shortHash,
          authorName: c.authorName,
          authoredAt: new Date(c.authoredAt),
          subject: c.subject,
          body: c.body || null,
        })),
      });
    }

    return NextResponse.json({ success: true, id: deployUpdate.id });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to record deployment update.");
  }
}
