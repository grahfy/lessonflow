// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChordDiagramData, ChordFingering } from "@/lib/chords/chord-types";
import { createEmptyChordDiagram } from "@/lib/chords/chord-types";

const lookupChordVoicingsMock = vi.fn<(root: string, quality: string, bassNote?: string) => ChordFingering[]>();

vi.mock("@/components/admin/ui/admin-dialog", () => ({
  AdminDialog: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => React.createElement("section", null, children, footer),
}));

vi.mock("@/components/admin/chords/chord-builder-fretboard", () => ({
  ChordBuilderFretboard: ({ diagram }: { diagram: ChordDiagramData }) =>
    React.createElement("div", {
      "data-testid": "fretboard",
      "data-strings": JSON.stringify(diagram.fingering.strings),
    }),
}));

vi.mock("@/components/admin/chords/chord-builder-finger-selector", () => ({
  ChordBuilderFingerSelector: () => React.createElement("div", null, "Finger Selector"),
}));

vi.mock("@/components/admin/chords/chord-builder-alternatives", () => ({
  ChordBuilderAlternatives: () => React.createElement("div", null, "Alternatives"),
}));

vi.mock("@/components/admin/chords/use-chord-preview", () => ({
  useChordPreview: () => ({
    canPreview: false,
    isLoading: false,
    previewError: "",
    previewMessage: "",
    playBlockPreview: () => undefined,
    playStrumPreview: () => undefined,
  }),
}));

vi.mock("@/lib/chords/chord-lookup", () => ({
  lookupChordVoicings: (root: string, quality: string, bassNote?: string) =>
    lookupChordVoicingsMock(root, quality, bassNote),
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

describe("chord-builder selector voicing sync", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    lookupChordVoicingsMock.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not overwrite the initial fingering on first open", async () => {
    lookupChordVoicingsMock.mockReturnValue([
      {
        strings: [-1, -1, 0, 2, 3, 2],
        fingers: [0, 0, 0, 1, 3, 2],
        barres: [],
        startFret: 1,
        fretCount: 5,
      },
    ]);

    const { ChordBuilder } = await import("@/components/admin/chords/chord-builder");

    await act(async () => {
      root.render(
        React.createElement(ChordBuilder, {
          isOpen: true,
          onClose: () => undefined,
          initial: makeResolvedDiagram(),
        })
      );
    });

    const fretboard = container.querySelector("[data-testid='fretboard']");
    expect(fretboard?.getAttribute("data-strings")).toBe(JSON.stringify([-1, 3, 2, 0, 1, 0]));
    expect(lookupChordVoicingsMock).not.toHaveBeenCalled();
  });

  it("loads the first matching voicing when root changes", async () => {
    lookupChordVoicingsMock.mockImplementation((root, quality) => {
      if (root === "D" && quality === "major") {
        return [{
          strings: [-1, -1, 0, 2, 3, 2],
          fingers: [0, 0, 0, 1, 3, 2],
          barres: [],
          startFret: 1,
          fretCount: 5,
        }];
      }

      return [];
    });

    const { ChordBuilder } = await import("@/components/admin/chords/chord-builder");

    await act(async () => {
      root.render(
        React.createElement(ChordBuilder, {
          isOpen: true,
          onClose: () => undefined,
          initial: makeResolvedDiagram(),
        })
      );
    });

    const selects = container.querySelectorAll("select");
    await act(async () => {
      selects[0].value = "D";
      selects[0].dispatchEvent(new Event("change", { bubbles: true }));
    });

    const fretboard = container.querySelector("[data-testid='fretboard']");
    expect(lookupChordVoicingsMock).toHaveBeenCalledWith("D", "major", undefined);
    expect(fretboard?.getAttribute("data-strings")).toBe(JSON.stringify([-1, -1, 0, 2, 3, 2]));
  });

  it("keeps the current fingering and shows a warning when no bundled voicing exists", async () => {
    lookupChordVoicingsMock.mockReturnValue([]);

    const { ChordBuilder } = await import("@/components/admin/chords/chord-builder");

    await act(async () => {
      root.render(
        React.createElement(ChordBuilder, {
          isOpen: true,
          onClose: () => undefined,
          initial: makeResolvedDiagram(),
        })
      );
    });

    const selects = container.querySelectorAll("select");
    await act(async () => {
      selects[1].value = "aug";
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });

    const fretboard = container.querySelector("[data-testid='fretboard']");
    expect(lookupChordVoicingsMock).toHaveBeenCalledWith("C", "aug", undefined);
    expect(fretboard?.getAttribute("data-strings")).toBe(JSON.stringify([-1, 3, 2, 0, 1, 0]));
    expect(container.textContent).toContain("No bundled voicing found for Caug.");
  });
});
