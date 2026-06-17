import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const getSetupCompletionStateMock = vi.fn();
const getCurrentAdminMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("next/link", () => ({
  default: ({ href, className, children, title }: { href: string; className?: string; children: React.ReactNode; title?: string }) =>
    React.createElement("a", { href, className, title }, children)
}));

vi.mock("@/lib/setup", () => ({
  getSetupCompletionState: getSetupCompletionStateMock
}));

vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  getCurrentAdmin: getCurrentAdminMock
}));

vi.mock("@/components/admin/layout/admin-shell", () => ({
  AdminShell: ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) =>
    React.createElement("section", { "data-title": title, className }, children)
}));

vi.mock("@/components/admin/ui/admin-card", () => ({
  AdminCard: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("div", { className }, children)
}));

describe("admin-index-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to setup when the application is not configured", async () => {
    getSetupCompletionStateMock.mockResolvedValue({ status: "incomplete", adminCount: 0 });

    const { default: AdminIndexPage } = await import("@/app/admin/page");

    await expect(AdminIndexPage()).rejects.toThrow("REDIRECT:/setup");
    expect(getCurrentAdminMock).not.toHaveBeenCalled();
  });

  it("redirects signed-out visitors straight to the admin login page", async () => {
    getSetupCompletionStateMock.mockResolvedValue({ status: "complete", adminCount: 1 });
    getCurrentAdminMock.mockResolvedValue(null);

    const { default: AdminIndexPage } = await import("@/app/admin/page");

    await expect(AdminIndexPage()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("redirects to the admin login page when the database is temporarily unavailable", async () => {
    getSetupCompletionStateMock.mockResolvedValue({
      status: "unavailable",
      errorCode: "DB_UNAVAILABLE",
      message: "The admin service cannot reach the database right now. Restore database connectivity and try again."
    });

    const { default: AdminIndexPage } = await import("@/app/admin/page");

    await expect(AdminIndexPage()).rejects.toThrow("REDIRECT:/admin/login");
    expect(getCurrentAdminMock).not.toHaveBeenCalled();
  });

  it("renders a grouped admin dashboard for authenticated admins", async () => {
    getSetupCompletionStateMock.mockResolvedValue({ status: "complete", adminCount: 1 });
    getCurrentAdminMock.mockResolvedValue({ id: "admin_1", role: "owner" });

    const { default: AdminIndexPage } = await import("@/app/admin/page");
    const element = await AdminIndexPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Admin Home");
    expect(html).toContain("Choose an area to continue working.");
    expect(html).toContain("Business");
    expect(html).toContain("Education");
    expect(html).toContain("System");
    expect(html).toContain("Use Business for daily studio operations");
    expect(html).toContain("Use Education for teaching workflows");
    expect(html).toContain("Use System for owner-level administration");
    expect(html).toContain("href=\"/admin/bookings\"");
    expect(html).toContain("href=\"/admin/lesson-plans\"");
    expect(html).toContain("href=\"/admin/settings\"");
  });
});
