import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwnerMock = vi.fn();

vi.mock("@/lib/admin/server-auth", () => ({
  requireOwner: requireOwnerMock
}));

vi.mock("@/components/admin/layout/admin-shell", () => ({
  AdminShell: ({ title, children }: { title: string; children: React.ReactNode }) =>
    React.createElement("section", { "data-title": title }, children)
}));

vi.mock("@/app/admin/updates/progress/update-progress-client", () => ({
  UpdateProgressClient: () => React.createElement("div", null, "Update Progress")
}));

describe("admin-update-progress-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerMock.mockResolvedValue(true);
  });

  it("requires owner auth before rendering the update progress shell", async () => {
    const { default: UpdateProgressPage } = await import("@/app/admin/updates/progress/page");

    const element = await UpdateProgressPage();
    const html = renderToStaticMarkup(element);

    expect(requireOwnerMock).toHaveBeenCalled();
    expect(html).toContain("System Update in Progress");
    expect(html).toContain("Update Progress");
  });
});
