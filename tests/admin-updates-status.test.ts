import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as getUpdateStatusRoute } from "@/app/api/admin/updates/status/route";
import * as updatesService from "@/lib/services/updates-service";
import fs from "node:fs";

const requireAdminFromRequestMock = vi.fn();

vi.mock("@/lib/services/updates-service");
vi.mock("@/lib/admin-route", () => ({
  requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequestMock(...args)
}));
vi.mock("@/lib/admin-auth", () => ({
  isOwnerAdmin: (admin: { role?: string } | null | undefined) => admin?.role === "owner"
}));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs") as typeof import("node:fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn()
    }
  };
});

describe("admin-updates-status-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("UPDATES_DEPLOY_USER", "deploy");
    vi.stubEnv("UPDATES_GIT_REPO_PATH", "/srv/lessonflow-repo");
  });

  it("returns 401 for unauthorized requests", async () => {
    requireAdminFromRequestMock.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/admin/updates/status");
    const response = await getUpdateStatusRoute(request);

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-owner admins", async () => {
    requireAdminFromRequestMock.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      role: "teacher"
    });

    const request = new NextRequest("http://localhost/api/admin/updates/status");
    const response = await getUpdateStatusRoute(request);

    expect(response.status).toBe(403);
  });

  it("returns update status for authorized owner admin", async () => {
    requireAdminFromRequestMock.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      role: "owner"
    });

    const mockStatus = {
      updateAvailable: true,
      localSha: "local",
      remoteSha: "remote",
      lastChecked: new Date()
    };
    const mockCommits = [{ sha: "remote", author: "A", date: "D", message: "M" }];

    (fs.existsSync as any).mockImplementation((target: string) => {
      if (target === "/srv/lessonflow-repo/.git") return true;
      if (target === "/etc/systemd/system/lessonflow-web-update.service") return true;
      return false;
    });

    vi.spyOn(updatesService, "getUpdateStatus").mockResolvedValue(mockStatus);
    vi.spyOn(updatesService, "getPendingCommits").mockResolvedValue(mockCommits);

    const request = new NextRequest("http://localhost/api/admin/updates/status");

    const response = await getUpdateStatusRoute(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.updateAvailable).toBe(true);
    expect(data.pendingCommits).toHaveLength(1);
    expect(data.webTriggerConfigured).toBe(true);
    expect(data.webTriggerMessage).toBeNull();
  });
});
