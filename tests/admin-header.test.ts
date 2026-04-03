// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminHeader } from "@/components/admin-header";
import type { AdminSessionSummary } from "@/lib/admin/use-admin-session";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const pathnameMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    push: pushMock
  })
}));

vi.mock("@/components/admin/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children)
}));

vi.mock("@/components/admin-deploy-updates-button", () => ({
  AdminDeployUpdatesButton: () => React.createElement("button", { type: "button" }, "Updates")
}));

vi.mock("@/lib/admin/customer-email-alerts", () => ({
  invalidateCustomerEmailAlertsSessionCache: () => undefined
}));

const ownerAdmin: AdminSessionSummary = {
  id: "owner-1",
  email: "owner@example.com",
  role: "owner",
  firstName: "System",
  lastName: "Admin",
  displayName: "System Admin"
};

const teacherAdmin: AdminSessionSummary = {
  id: "teacher-1",
  email: "teacher@example.com",
  role: "teacher",
  firstName: "Taylor",
  lastName: "Teacher",
  displayName: "Taylor Teacher"
};

describe("admin-header", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    pathnameMock.mockReset();
    pushMock.mockReset();
    pathnameMock.mockReturnValue("/admin/chords");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderHeader(admin: AdminSessionSummary | null = ownerAdmin) {
    await act(async () => {
      root.render(React.createElement(AdminHeader, { title: "Chords", admin }));
    });
  }

  it("renders grouped owner navigation with the active route and utility actions", async () => {
    await renderHeader(ownerAdmin);

    expect(container.textContent).toContain("Admin Console");
    expect(container.textContent).toContain("Chords");
    expect(container.textContent).toContain("System Admin");
    expect(container.textContent).toContain("Business");
    expect(container.textContent).toContain("Education");
    expect(container.textContent).toContain("System");
    expect(container.textContent).toContain("Updates");
    expect(container.textContent).toContain("Sign out");

    const activePageButton = Array.from(container.querySelectorAll(".admin-header-nav-primary .btn")).find(
      (button) => button.textContent?.trim() === "Chords"
    );
    expect(activePageButton?.className).toContain("btn-primary");
    expect(activePageButton?.getAttribute("aria-current")).toBe("page");

    const activeGroup = Array.from(container.querySelectorAll(".admin-header-nav-group")).find(
      (group) => group.getAttribute("aria-label") === "Education"
    );
    expect(activeGroup?.className).toContain("is-active");
  });

  it("routes through the app router when a nav button is clicked", async () => {
    await renderHeader(ownerAdmin);

    const bookingsButton = Array.from(container.querySelectorAll(".admin-header-nav-primary .btn")).find(
      (button) => button.textContent?.trim() === "Bookings"
    );
    expect(bookingsButton).toBeTruthy();

    await act(async () => {
      bookingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(pushMock).toHaveBeenCalledWith("/admin/bookings");
  });

  it("hides owner-only nav items and updates for teachers", async () => {
    pathnameMock.mockReturnValue("/admin/teachers");
    await renderHeader(teacherAdmin);

    expect(container.textContent).toContain("Teachers");
    expect(container.textContent).not.toContain("Updates");
    expect(container.textContent).toContain("Sign out");

    const navButtons = Array.from(container.querySelectorAll(".admin-header-nav-primary .btn"));
    expect(navButtons.some((button) => button.textContent?.trim() === "Chords")).toBe(false);
    expect(navButtons.some((button) => button.textContent?.trim() === "Invoices")).toBe(false);
    expect(navButtons.some((button) => button.textContent?.trim() === "Reports")).toBe(false);
    expect(navButtons.some((button) => button.textContent?.trim() === "Settings")).toBe(false);
  });

  it("toggles the menu panel open state from the menu button", async () => {
    await renderHeader(ownerAdmin);

    const navPanel = container.querySelector("#admin-header-menu-panel");
    const menuToggle = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Menu"
    );

    expect(navPanel?.className.trim()).toBe("admin-header-nav");
    expect(menuToggle?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      menuToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(navPanel?.className).toContain("is-open");
    expect(menuToggle?.getAttribute("aria-expanded")).toBe("true");
  });
});
