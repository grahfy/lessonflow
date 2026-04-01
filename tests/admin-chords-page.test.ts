import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwnerMock = vi.fn();

vi.mock("@/lib/admin/server-auth", () => ({
  requireOwner: requireOwnerMock
}));

vi.mock("@/components/admin/chords/chords-client", () => ({
  AdminChordsClient: () => React.createElement("div", null, "Chord Console Client")
}));

describe("admin-chords-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerMock.mockResolvedValue(true);
  });

  it("requires owner auth before rendering the chords console", async () => {
    const { default: AdminChordsPage } = await import("@/app/admin/chords/page");

    const element = await AdminChordsPage();
    const html = renderToStaticMarkup(element);

    expect(requireOwnerMock).toHaveBeenCalled();
    expect(html).toContain("Chord Console Client");
  });
});
