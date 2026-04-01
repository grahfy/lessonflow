import type { ChordDiagramData, StringTuple, FingerValue, StringFretValue } from "@/lib/chords/chord-types";
import { DEFAULT_FRET_COUNT, STANDARD_TUNING, createEmptyChordDiagram } from "@/lib/chords/chord-types";
import { detectChordNameFromDiagram, syncDiagramNameWithDetection } from "@/lib/chords/chord-detection";
import { describe, expect, it } from "vitest";

function makeDiagram(
  strings: StringTuple<StringFretValue>,
  options?: {
    tuning?: StringTuple<string>;
    displayName?: string;
  }
): ChordDiagramData {
  return {
    name: {
      root: "Manual",
      quality: "manual",
      ...(options?.displayName ? { displayName: options.displayName } : {}),
    },
    fingering: {
      strings,
      fingers: [0, 0, 0, 0, 0, 0] as StringTuple<FingerValue>,
      barres: [],
      startFret: 1,
      fretCount: DEFAULT_FRET_COUNT,
    },
    tuning: options?.tuning ?? [...STANDARD_TUNING],
    isLeftHanded: false,
  };
}

describe("chord-detection", () => {
  it("detects a supported open-position major chord from the current fingering", () => {
    const diagram = makeDiagram([-1, 3, 2, 0, 1, 0]);

    expect(detectChordNameFromDiagram(diagram)).toEqual({
      root: "C",
      quality: "major",
    });
  });

  it("detects slash chords using the lowest sounded string as the bass note", () => {
    const diagram = makeDiagram([2, 0, 0, 2, 1, 2]);

    expect(detectChordNameFromDiagram(diagram)).toEqual({
      root: "D",
      quality: "7",
      bassNote: "F#",
    });
  });

  it("falls back to assuming the perfect fifth for incomplete but common voicings", () => {
    const diagram = makeDiagram(
      [0, 0, 0, -1, -1, -1],
      { tuning: ["D", "F", "C", "E", "A", "D"] }
    );

    expect(detectChordNameFromDiagram(diagram)).toEqual({
      root: "D",
      quality: "m7",
    });
  });

  it("returns null for unsupported or unresolved shapes", () => {
    const diagram = makeDiagram([0, 0, 0, 0, 0, -1]);

    expect(detectChordNameFromDiagram(diagram)).toBeNull();
  });

  it("treats the untouched all-open starter diagram as unresolved", () => {
    expect(detectChordNameFromDiagram(createEmptyChordDiagram())).toBeNull();
  });

  it("preserves a manual display-name override while syncing detected identity", () => {
    const detected = syncDiagramNameWithDetection(
      makeDiagram([-1, 3, 2, 0, 1, 0], { displayName: "My C Shape" })
    );

    expect(detected.name).toEqual({
      root: "C",
      quality: "major",
      displayName: "My C Shape",
    });
  });

  it("clears root, quality, and bass when the shape cannot be identified", () => {
    const unresolved = syncDiagramNameWithDetection(
      makeDiagram([0, 0, 0, 0, 0, -1], { displayName: "Custom Cluster" })
    );

    expect(unresolved.name).toEqual({
      root: "",
      quality: "",
      displayName: "Custom Cluster",
      bassNote: undefined,
    });
  });
});
