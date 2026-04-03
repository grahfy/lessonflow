import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/admin/deploy-updates/latest/route";

const requireAdminFromRequestMock = vi.fn();
const readLatestDeployUpdateMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock("@/lib/admin-route", () => ({
  requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequestMock(...args)
}));

vi.mock("@/lib/admin-auth", () => ({
  isOwnerAdmin: (admin: { role?: string } | null | undefined) => admin?.role === "owner"
}));

vi.mock("@/lib/deploy-updates", () => ({
  readLatestDeployUpdate: (...args: unknown[]) => readLatestDeployUpdateMock(...args)
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deployUpdate: {
      findFirst: (...args: unknown[]) => findFirstMock(...args)
    }
  }
}));

describe("admin-deploy-updates-latest-route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204 when no deployment metadata exists yet", async () => {
    requireAdminFromRequestMock.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      role: "owner"
    });
    findFirstMock.mockResolvedValue(null);
    readLatestDeployUpdateMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/admin/deploy-updates/latest"));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns json payload when fallback deploy metadata exists", async () => {
    requireAdminFromRequestMock.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      role: "owner"
    });
    findFirstMock.mockResolvedValue(null);
    readLatestDeployUpdateMock.mockResolvedValue({
      app: "lessonflow",
      branch: "main",
      release: "1.2.3",
      appliedAt: "2026-04-03T00:00:00.000Z",
      commit: "abcdef1234567",
      shortCommit: "abcdef1",
      previousCommit: "1234567",
      commits: []
    });

    const response = await GET(new NextRequest("http://localhost/api/admin/deploy-updates/latest"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commit).toBe("abcdef1234567");
    expect(body.shortCommit).toBe("abcdef1");
  });
});
