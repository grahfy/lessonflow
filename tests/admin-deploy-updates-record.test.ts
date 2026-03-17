import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/admin/deploy-updates/record/route";
import { prisma } from "@/lib/db";

function deployRecordRequest(body: Record<string, unknown>, secret: string) {
  return new NextRequest("http://localhost/api/admin/deploy-updates/record", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json"
    }
  });
}

describe("admin-deploy-updates-record", () => {
  beforeEach(async () => {
    process.env.CRON_SECRET = "deploy-secret";
    await prisma.deployCommit.deleteMany();
    await prisma.deployUpdate.deleteMany();
  });

  it("records deployment updates and their commits", async () => {
    const response = await POST(
      deployRecordRequest(
        {
          branch: "main",
          release: "1.2.3",
          commit: "abc123",
          shortCommit: "abc123",
          previousCommit: "prev123",
          appliedAt: "2026-03-18T09:00:00.000Z",
          commits: [
            {
              hash: "abc123",
              shortHash: "abc123",
              authorName: "Deploy Bot",
              authoredAt: "2026-03-18T08:59:00.000Z",
              subject: "Release build",
              body: "Deploy body"
            }
          ]
        },
        "deploy-secret"
      )
    );

    expect(response.status).toBe(200);

    const update = await prisma.deployUpdate.findUniqueOrThrow({
      where: { commit: "abc123" },
      include: { commits: true }
    });
    expect(update.branch).toBe("main");
    expect(update.commits).toHaveLength(1);
    expect(update.commits[0]?.subject).toBe("Release build");
  });

  it("preserves existing commit history when replacement commits are invalid", async () => {
    await POST(
      deployRecordRequest(
        {
          branch: "main",
          release: "1.2.3",
          commit: "same-commit",
          shortCommit: "same",
          appliedAt: "2026-03-18T09:00:00.000Z",
          commits: [
            {
              hash: "good-hash",
              shortHash: "good",
              authorName: "Deploy Bot",
              authoredAt: "2026-03-18T08:59:00.000Z",
              subject: "Existing commit"
            }
          ]
        },
        "deploy-secret"
      )
    );

    const failedResponse = await POST(
      deployRecordRequest(
        {
          branch: "main",
          release: "1.2.4",
          commit: "same-commit",
          shortCommit: "same",
          appliedAt: "2026-03-18T10:00:00.000Z",
          commits: [
            {
              hash: "bad-hash",
              shortHash: "bad",
              authorName: "Deploy Bot",
              authoredAt: "not-a-date",
              subject: "Broken commit"
            }
          ]
        },
        "deploy-secret"
      )
    );

    expect(failedResponse.status).toBe(500);

    const update = await prisma.deployUpdate.findUniqueOrThrow({
      where: { commit: "same-commit" },
      include: { commits: { orderBy: { authoredAt: "asc" } } }
    });
    expect(update.release).toBe("1.2.3");
    expect(update.commits).toHaveLength(1);
    expect(update.commits[0]?.hash).toBe("good-hash");
  });
});
