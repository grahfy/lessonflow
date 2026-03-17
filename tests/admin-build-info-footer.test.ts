import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) =>
    React.createElement("a", { href, className }, children)
}));

describe("admin-build-info-footer", () => {
  it("shows the About link for owners", async () => {
    const { AdminBuildInfoFooter } = await import("@/components/admin/layout/admin-build-info-footer");
    const html = renderToStaticMarkup(
      React.createElement(AdminBuildInfoFooter, {
        admin: {
          id: "owner-1",
          email: "owner@example.com",
          role: "owner",
          firstName: "Owner",
          lastName: "Admin",
          displayName: "Owner Admin"
        }
      })
    );

    expect(html).toContain("/admin/about");
  });

  it("hides the About link for teachers", async () => {
    const { AdminBuildInfoFooter } = await import("@/components/admin/layout/admin-build-info-footer");
    const html = renderToStaticMarkup(
      React.createElement(AdminBuildInfoFooter, {
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

    expect(html).not.toContain("/admin/about");
  });
});
