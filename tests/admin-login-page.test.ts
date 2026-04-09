import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const getSetupCompletionStateMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/setup", () => ({
  getSetupCompletionState: getSetupCompletionStateMock
}));

vi.mock("@/components/admin/admin-database-unavailable-state", () => ({
  AdminDatabaseUnavailableState: () => React.createElement("section", null, "Admin service unavailable")
}));

vi.mock("@/components/admin-auth-shell", () => ({
  AdminAuthShell: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children)
}));

vi.mock("@/components/admin-login-form", () => ({
  AdminLoginForm: () => React.createElement("form", null, "login form")
}));

describe("admin-login-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to setup when the database confirms no admin user exists yet", async () => {
    getSetupCompletionStateMock.mockResolvedValue({ status: "incomplete", adminCount: 0 });

    const { default: AdminLoginPage } = await import("@/app/admin/login/page");

    await expect(AdminLoginPage()).rejects.toThrow("REDIRECT:/setup");
  });

  it("renders a dedicated maintenance state when the database is unavailable", async () => {
    getSetupCompletionStateMock.mockResolvedValue({
      status: "unavailable",
      errorCode: "DB_UNAVAILABLE",
      message: "The admin service cannot reach the database right now. Restore database connectivity and try again."
    });

    const { default: AdminLoginPage } = await import("@/app/admin/login/page");
    const element = await AdminLoginPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Admin service unavailable");
  });

  it("renders the login form once setup is complete and the database is reachable", async () => {
    getSetupCompletionStateMock.mockResolvedValue({ status: "complete", adminCount: 1 });

    const { default: AdminLoginPage } = await import("@/app/admin/login/page");
    const element = await AdminLoginPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Booking Console Login");
    expect(html).toContain("login form");
  });
});
