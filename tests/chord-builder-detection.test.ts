import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { createEmptyChordDiagram } from "@/lib/chords/chord-types";

vi.mock("@/components/ui/app-dialog", () => ({
  AppDialog: ({
    title,
    footer,
    children,
  }: {
    title: string;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }) => React.createElement("section", { "data-title": title }, children, footer)
}));

vi.mock("@/components/admin/chords/chord-builder-fretboard", () => ({
  ChordBuilderFretboard: () => React.createElement("div", null, "Fretboard")
}));

vi.mock("@/components/admin/chords/chord-builder-finger-selector", () => ({
  ChordBuilderFingerSelector: () => React.createElement("div", null, "Finger Selector")
}));

vi.mock("@/components/admin/chords/chord-builder-alternatives", () => ({
  ChordBuilderAlternatives: () => React.createElement("div", null, "Alternatives")
}));

function makeResolvedDiagram(): ChordDiagramData {
  return {
    ...createEmptyChordDiagram(),
    fingering: {
      ...createEmptyChordDiagram().fingering,
      strings: [-1, 3, 2, 0, 1, 0],
    },
  };
}

describe("chord-builder detection gating", () => {
  it("disables save and insert while the current fingering is unresolved", async () => {
    const { ChordBuilder } = await import("@/components/admin/chords/chord-builder");

    const html = renderToStaticMarkup(
      React.createElement(ChordBuilder, {
        isOpen: true,
        onClose: () => undefined,
        onSave: () => undefined,
        onInsert: () => undefined,
        initial: createEmptyChordDiagram(),
      })
    );

    expect(html).toContain("This fingering does not match a supported chord yet.");
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain("data-title=\"Chord Builder — Chord Builder\"");
    expect(html).toContain("Strum");
    expect(html).toContain("Play Notes");
  });

  it("renders the detected chord title once the fingering resolves", async () => {
    const { ChordBuilder } = await import("@/components/admin/chords/chord-builder");

    const html = renderToStaticMarkup(
      React.createElement(ChordBuilder, {
        isOpen: true,
        onClose: () => undefined,
        onSave: () => undefined,
        initial: makeResolvedDiagram(),
      })
    );

    expect(html).toContain("data-title=\"Chord Builder — C\"");
    expect(html).not.toContain("This fingering does not match a supported chord yet.");
  });
});
