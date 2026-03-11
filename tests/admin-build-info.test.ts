import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getBuildInfoRoute } from "@/app/api/admin/build-info/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as buildInfo from "@/lib/build-info";

vi.mock("@/lib/build-info");

async function clearData() {
  await prisma.adminUser.deleteMany();
}

describe("admin-build-info-api", () => {
  beforeEach(async () => {
    await clearData();
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized requests", async () => {
    const request = new NextRequest("http://localhost/api/admin/build-info");
    const response = await getBuildInfoRoute(request);

    expect(response.status).toBe(401);
  });

  it("returns build metadata for an authenticated admin", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    vi.spyOn(buildInfo, "getAdminBuildInfo").mockResolvedValue({
      versionText: "v1.0 · d338e15",
      releaseLabel: "v1.0",
      shortCommit: "d338e15",
      packageVersion: "0.1.0",
      source: "git",
      developedYear: "2026",
      createdBy: "Dean Thomson",
      repositoryUrl: "https://gitlab.com/grahfmusic/lessonflow.git",
      wikiUrl: "https://gitlab.com/grahfmusic/lessonflow/-/wikis/home",
      contactEmail: "contact@grahfmusic.com"
    });

    const request = new NextRequest("http://localhost/api/admin/build-info", {
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await getBuildInfoRoute(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.buildInfo.versionText).toBe("v1.0 · d338e15");
    expect(data.buildInfo.createdBy).toBe("Dean Thomson");
  });
});
