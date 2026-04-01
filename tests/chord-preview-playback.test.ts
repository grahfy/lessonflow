import { describe, expect, it } from "vitest";

import { buildChordPreviewPlaybackPlan } from "@/components/admin/chords/use-chord-preview";
import { createEmptyChordDiagram } from "@/lib/chords/chord-types";
import { getPlayableChordNotes } from "@/lib/chords/chord-preview";

describe("chord preview playback plan", () => {
  it("keeps one near-simultaneous playback event per sounding string in block mode", () => {
    const diagram = {
      ...createEmptyChordDiagram(),
      fingering: {
        ...createEmptyChordDiagram().fingering,
        strings: [-1, 3, 2, 0, 1, 0] as [number, number, number, number, number, number],
      },
    };

    const events = buildChordPreviewPlaybackPlan(getPlayableChordNotes(diagram), "block");

    expect(events.map((event) => event.note)).toEqual([
      "C3",
      "E3",
      "G3",
      "C4",
      "E4",
    ]);
    expect(events.map((event) => event.timeOffsetSeconds)).toEqual([
      0,
      0.012,
      0.024,
      0.036000000000000004,
      0.048,
    ]);
  });

  it("stagger-strums from low to high string order", () => {
    const diagram = {
      ...createEmptyChordDiagram(),
      fingering: {
        ...createEmptyChordDiagram().fingering,
        strings: [3, 2, 0, 0, 0, 3] as [number, number, number, number, number, number],
      },
    };

    const events = buildChordPreviewPlaybackPlan(getPlayableChordNotes(diagram), "strum");

    expect(events.map((event) => event.note)).toEqual([
      "G2",
      "B2",
      "D3",
      "G3",
      "B3",
      "G4",
    ]);
    expect(events.map((event) => event.timeOffsetSeconds)).toEqual([
      0,
      0.075,
      0.15,
      0.22499999999999998,
      0.3,
      0.375,
    ]);
  });
});
