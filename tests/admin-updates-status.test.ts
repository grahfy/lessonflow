import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as getUpdateStatusRoute } from "@/app/api/admin/updates/status/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as updatesService from "@/lib/services/updates-service";

vi.mock("@/lib/services/updates-service");

async function clearData() {
  await prisma.adminUser.deleteMany();
}

describe("admin-updates-status-api", () => {
  beforeEach(async () => {
    await clearData();
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized requests", async () => {
    const request = new NextRequest("http://localhost/api/admin/updates/status");
    const response = await getUpdateStatusRoute(request);
    expect(response.status).toBe(401);
  });

  it("returns update status for authorized admin", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const mockStatus = {
      updateAvailable: true,
      localSha: "local",
      remoteSha: "remote",
      lastChecked: new Date()
    };
    const mockCommits = [{ sha: "remote", author: "A", date: "D", message: "M" }];

    vi.spyOn(updatesService, "getUpdateStatus").mockResolvedValue(mockStatus);
    vi.spyOn(updatesService, "getPendingCommits").mockResolvedValue(mockCommits);

    const request = new NextRequest("http://localhost/api/admin/updates/status", {
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await getUpdateStatusRoute(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.updateAvailable).toBe(true);
    expect(data.pendingCommits).toHaveLength(1);
  });
});
