import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChordBuilderFretboard } from "@/components/admin/chords/chord-builder-fretboard";
import { applyBarreToFingering, removeBarreFromFingering } from "@/components/admin/chords/use-chord-builder";
import { createEmptyChordDiagram, createEmptyFingering } from "@/lib/chords/chord-types";

describe("chord builder barre helpers", () => {
  it("normalizes covered strings and stores a single barre per fret", () => {
    const fingering = {
      ...createEmptyFingering(),
      barres: [{ fret: 1, fromString: 2, toString: 4 }],
    };

    const next = applyBarreToFingering(
      fingering,
      { fret: 1, fromString: 5, toString: 0 },
      2
    );

    expect(next.strings).toEqual([1, 1, 1, 1, 1, 1]);
    expect(next.fingers).toEqual([2, 2, 2, 2, 2, 2]);
    expect(next.barres).toEqual([{ fret: 1, fromString: 0, toString: 5 }]);
  });

  it("removes only the barre metadata and preserves the fretted shape", () => {
    const fingering = {
      ...createEmptyFingering(),
      strings: [-1, 3, 3, 2, 1, 1] as [number, number, number, number, number, number],
      fingers: [0, 3, 4, 2, 1, 1] as [number, number, number, number, number, number],
      barres: [{ fret: 1, fromString: 1, toString: 5 }],
    };

    const next = removeBarreFromFingering(fingering, 1);

    expect(next.strings).toEqual(fingering.strings);
    expect(next.fingers).toEqual(fingering.fingers);
    expect(next.barres).toEqual([]);
  });
});

describe("chord builder barre affordance", () => {
  it("renders a removable barre control in the fretboard", () => {
    const diagram = {
      ...createEmptyChordDiagram(),
      fingering: {
        ...createEmptyChordDiagram().fingering,
        strings: [1, 1, 1, 1, 1, 1] as [number, number, number, number, number, number],
        fingers: [1, 1, 1, 1, 1, 1] as [number, number, number, number, number, number],
        barres: [{ fret: 1, fromString: 0, toString: 5 }],
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(ChordBuilderFretboard, {
        diagram,
        selectedFinger: 1,
        onPlaceDot: () => undefined,
        onRemoveDot: () => undefined,
        onCycleStringState: () => undefined,
        onAddBarre: () => undefined,
        onRemoveBarre: () => undefined,
      })
    );

    expect(html).toContain("aria-label=\"Remove barre on fret 1\"");
    expect(html).toContain("role=\"button\"");
    expect(html).toContain("tabindex=\"0\"");
  });
});
