import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminFromRequestMock = vi.fn();

vi.mock("@/lib/admin-route", () => ({
  requireAdminFromRequest: requireAdminFromRequestMock
}));

describe("admin-session-route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns DB_UNAVAILABLE when session lookup cannot reach the database", async () => {
    requireAdminFromRequestMock.mockRejectedValue(
      new Error("DriverAdapterError: pool timeout: failed to retrieve a connection from pool after 10000ms")
    );

    const { GET } = await import("@/app/api/admin/session/route");
    const response = await GET(new Request("http://localhost/api/admin/session") as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DB_UNAVAILABLE"
    });
  });
});
