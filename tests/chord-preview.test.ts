import { describe, expect, it } from "vitest";

import { createEmptyChordDiagram } from "@/lib/chords/chord-types";
import { getPlayableChordNotes, midiToScientificPitch } from "@/lib/chords/chord-preview";

describe("chord preview note derivation", () => {
  it("converts midi values to scientific pitch notation", () => {
    expect(midiToScientificPitch(40)).toBe("E2");
    expect(midiToScientificPitch(61)).toBe("C#4");
  });

  it("returns sounding notes for an open-position chord", () => {
    const diagram = {
      ...createEmptyChordDiagram(),
      fingering: {
        ...createEmptyChordDiagram().fingering,
        strings: [-1, 3, 2, 0, 1, 0] as [number, number, number, number, number, number],
      },
    };

    expect(getPlayableChordNotes(diagram).map((note) => note.note)).toEqual([
      "C3",
      "E3",
      "G3",
      "C4",
      "E4",
    ]);
  });

  it("applies start fret offsets for higher-position shapes", () => {
    const diagram = {
      ...createEmptyChordDiagram(),
      fingering: {
        ...createEmptyChordDiagram().fingering,
        strings: [-1, -1, 1, 3, 4, 3] as [number, number, number, number, number, number],
        startFret: 5,
      },
    };

    expect(getPlayableChordNotes(diagram).map((note) => note.note)).toEqual([
      "G3",
      "D4",
      "G4",
      "B4",
    ]);
  });

  it("keeps playback order stable even when the diagram is left-handed", () => {
    const rightHanded = {
      ...createEmptyChordDiagram(),
      fingering: {
        ...createEmptyChordDiagram().fingering,
        strings: [3, 2, 0, 0, 0, 3] as [number, number, number, number, number, number],
      },
      isLeftHanded: false,
    };
    const leftHanded = {
      ...rightHanded,
      isLeftHanded: true,
    };

    expect(getPlayableChordNotes(leftHanded)).toEqual(getPlayableChordNotes(rightHanded));
  });

  it("returns no notes when every string is muted", () => {
    const diagram = {
      ...createEmptyChordDiagram(),
      fingering: {
        ...createEmptyChordDiagram().fingering,
        strings: [-1, -1, -1, -1, -1, -1] as [number, number, number, number, number, number],
      },
    };

    expect(getPlayableChordNotes(diagram)).toEqual([]);
  });
});
