import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const isSetupCompleteMock = vi.fn();
const getCurrentAdminMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/setup", () => ({
  isSetupComplete: isSetupCompleteMock
}));

vi.mock("@/lib/admin-auth", () => ({
  getCurrentAdmin: getCurrentAdminMock
}));

describe("admin-index-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to setup when the application is not configured", async () => {
    isSetupCompleteMock.mockResolvedValue(false);

    const { default: AdminIndexPage } = await import("@/app/admin/page");

    await expect(AdminIndexPage()).rejects.toThrow("REDIRECT:/setup");
    expect(getCurrentAdminMock).not.toHaveBeenCalled();
  });

  it("redirects signed-out visitors straight to the admin login page", async () => {
    isSetupCompleteMock.mockResolvedValue(true);
    getCurrentAdminMock.mockResolvedValue(null);

    const { default: AdminIndexPage } = await import("@/app/admin/page");

    await expect(AdminIndexPage()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("redirects authenticated admins to the bookings console", async () => {
    isSetupCompleteMock.mockResolvedValue(true);
    getCurrentAdminMock.mockResolvedValue({ id: "admin_1" });

    const { default: AdminIndexPage } = await import("@/app/admin/page");

    await expect(AdminIndexPage()).rejects.toThrow("REDIRECT:/admin/bookings");
  });
});
