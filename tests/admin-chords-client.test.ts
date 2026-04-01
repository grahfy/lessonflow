import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/layout/admin-shell", () => ({
  AdminShell: ({
    title,
    className,
    children,
  }: {
    title: string;
    className?: string;
    children: React.ReactNode;
  }) => React.createElement("section", { "data-title": title, "data-class": className }, children)
}));

vi.mock("@/components/admin/ui/admin-card", () => ({
  AdminCard: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("div", { className }, children)
}));

vi.mock("@/components/admin/ui/admin-tab-bar", () => ({
  AdminTabBar: ({
    items,
    activeTab,
  }: {
    items: Array<{ key: string; label: string }>;
    activeTab: string;
  }) =>
    React.createElement(
      "nav",
      { "data-active-tab": activeTab },
      items.map((item) => React.createElement("span", { key: item.key }, item.label))
    )
}));

vi.mock("@/components/admin/chords/chord-builder", () => ({
  ChordBuilder: () => null
}));

vi.mock("@/components/admin/chords/chord-chart-editor", () => ({
  ChordChartEditor: () => null
}));

describe("admin-chords-client", () => {
  it("renders inside the shared admin shell with the chords workspace header", async () => {
    const { AdminChordsClient } = await import("@/components/admin/chords/chords-client");

    const html = renderToStaticMarkup(React.createElement(AdminChordsClient));

    expect(html).toContain("data-title=\"Chords\"");
    expect(html).toContain("data-class=\"admin-shell-chords\"");
    expect(html).toContain("Chord Console");
    expect(html).toContain("Chord library and voicing management");
    expect(html).toContain("New Chord");
    expect(html).toContain("Loading chord library...");
    expect(html).toContain("Library");
    expect(html).toContain("Charts");
  });
});
