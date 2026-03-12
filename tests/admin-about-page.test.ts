import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const getAdminBuildInfoMock = vi.fn();

vi.mock("@/lib/admin/server-auth", () => ({
  requireAdmin: requireAdminMock
}));

vi.mock("@/lib/build-info", () => ({
  getAdminBuildInfo: getAdminBuildInfoMock
}));

vi.mock("@/components/admin/layout/admin-shell", () => ({
  AdminShell: ({ title, children }: { title: string; children: React.ReactNode }) =>
    React.createElement("section", { "data-title": title }, children)
}));

vi.mock("@/components/admin/ui/admin-card", () => ({
  AdminCard: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("div", { className }, children)
}));

describe("admin-about-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue(true);
    getAdminBuildInfoMock.mockResolvedValue({
      versionText: "v1.2.0 · d338e15",
      releaseLabel: "v1.2.0",
      shortCommit: "d338e15",
      packageVersion: "1.2.0",
      source: "git",
      developedYear: "2026",
      createdBy: "Dean Thomson",
      repositoryUrl: "https://gitlab.com/grahfmusic/lessonflow.git",
      wikiUrl: "https://gitlab.com/grahfmusic/lessonflow/-/wikis/home",
      contactEmail: "contact@grahfmusic.com"
    });
  });

  it("renders build metadata and project credits after auth", async () => {
    const { default: AdminAboutPage } = await import("@/app/admin/about/page");

    const element = await AdminAboutPage();
    const html = renderToStaticMarkup(element);

    expect(requireAdminMock).toHaveBeenCalled();
    expect(getAdminBuildInfoMock).toHaveBeenCalled();
    expect(html).toContain("About LessonFlow");
    expect(html).toContain("v1.2.0 · d338e15");
    expect(html).toContain("Dean Thomson");
    expect(html).toContain("contact@grahfmusic.com");
    expect(html).toContain("https://gitlab.com/grahfmusic/lessonflow/-/wikis/home");
  });
});
