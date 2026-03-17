import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const useSafeFetchMock = vi.fn();

vi.mock("@/lib/admin/use-safe-fetch", () => ({
  useSafeFetch: useSafeFetchMock
}));

vi.mock("@/components/admin/ui/admin-notice", () => ({
  AdminNotice: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children)
}));

vi.mock("@/components/admin/updates/pending-changes-modal", () => ({
  PendingChangesModal: () => React.createElement("div", null, "Pending Changes")
}));

describe("admin-update-notification-banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSafeFetchMock.mockReturnValue({
      safeFetch: vi.fn(),
      handleApiError: vi.fn()
    });
  });

  it("does not render for teacher admins", async () => {
    const { UpdateNotificationBanner } = await import("@/components/admin/updates/update-notification-banner");
    const html = renderToStaticMarkup(
      React.createElement(UpdateNotificationBanner, {
        admin: {
          id: "teacher-1",
          email: "teacher@example.com",
          role: "teacher",
          firstName: "Teacher",
          lastName: "Admin",
          displayName: "Teacher Admin"
        }
      })
    );

    expect(html).toBe("");
  });
});
