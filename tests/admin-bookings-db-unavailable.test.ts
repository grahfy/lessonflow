import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminFromRequestMock = vi.fn();

vi.mock("@/lib/admin-route", () => ({
  requireAdminFromRequest: requireAdminFromRequestMock
}));

describe("admin-bookings db unavailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns DB_UNAVAILABLE when booking reads fail during admin session resolution", async () => {
    requireAdminFromRequestMock.mockRejectedValue(
      new Error("DriverAdapterError: pool timeout: failed to retrieve a connection from pool after 10000ms")
    );

    const { GET } = await import("@/app/api/admin/bookings/route");
    const response = await GET(new Request("http://localhost/api/admin/bookings?view=week&date=2026-04-14") as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DB_UNAVAILABLE"
    });
  });
});
