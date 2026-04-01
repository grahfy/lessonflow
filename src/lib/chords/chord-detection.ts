import { detect } from "@tonaljs/chord-detect";

import type { ChordDiagramData } from "./chord-types";
import { getChordNotes } from "./music-theory";

export interface DetectedChordName {
  root: string;
  quality: string;
  bassNote?: string;
}

const SPECIAL_NOTE_MAP: Record<string, string> = {
  "B#": "C",
  Cb: "B",
  "E#": "F",
  Fb: "E",
};

const TONAL_QUALITY_MAP: Record<string, string> = {
  "": "major",
  M: "major",
  m: "minor",
  "7": "7",
  m7: "m7",
  M7: "maj7",
  maj7: "maj7",
  dim: "dim",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  sus: "sus4",
  "6": "6",
  m6: "m6",
  "9": "9",
  m9: "m9",
  Madd9: "add9",
  add9: "add9",
  dim7: "dim7",
  m7b5: "m7b5",
  "7sus4": "7sus4",
  "m/ma7": "mmaj7",
  mMaj7: "mmaj7",
  mM7: "mmaj7",
  aug7: "aug7",
  "+7": "aug7",
  "7#5": "aug7",
  "5": "5",
};

function normalizeDetectedNoteName(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
  return SPECIAL_NOTE_MAP[normalized] ?? normalized;
}

function isPristineOpenShape(diagram: ChordDiagramData): boolean {
  const { strings, barres, startFret } = diagram.fingering;
  return startFret === 1 && barres.length === 0 && strings.every((value) => value === 0);
}

function buildDetectionNotes(diagram: ChordDiagramData): string[] {
  if (isPristineOpenShape(diagram)) {
    return [];
  }

  const soundingNotes = getChordNotes(diagram)
    .filter((note) => note !== "X")
    .map((note) => normalizeDetectedNoteName(note));

  const uniqueNotes: string[] = [];
  for (const note of soundingNotes) {
    if (note && !uniqueNotes.includes(note)) {
      uniqueNotes.push(note);
    }
  }

  return uniqueNotes;
}

function parseDetectedCandidate(candidate: string): DetectedChordName | null {
  const match = candidate.match(/^([A-G](?:#|b)?)([^/]*?)(?:\/([A-G](?:#|b)?))?$/);
  if (!match) {
    return null;
  }

  const [, rawRoot, rawSuffix, rawBass] = match;
  const quality = TONAL_QUALITY_MAP[rawSuffix];
  if (!quality) {
    return null;
  }

  const root = normalizeDetectedNoteName(rawRoot);
  const bassNote = rawBass ? normalizeDetectedNoteName(rawBass) : undefined;

  return {
    root,
    quality,
    bassNote,
  };
}

/**
 * Detects the most suitable supported chord identity for a diagram.
 * Returns null when the current shape is empty, ambiguous, or unsupported.
 */
export function detectChordNameFromDiagram(diagram: ChordDiagramData): DetectedChordName | null {
  const notes = buildDetectionNotes(diagram);
  if (notes.length === 0) {
    return null;
  }

  const candidates = detect(notes, { assumePerfectFifth: false });
  const fallbackCandidates = candidates.length > 0 ? candidates : detect(notes, { assumePerfectFifth: true });

  for (const candidate of fallbackCandidates) {
    const parsed = parseDetectedCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

/**
 * Applies live detection to a diagram, preserving manual display-name overrides
 * while syncing the structured chord identity with the current fingering.
 */
export function syncDiagramNameWithDetection(diagram: ChordDiagramData): ChordDiagramData {
  const detected = detectChordNameFromDiagram(diagram);

  return {
    ...diagram,
    name: {
      ...diagram.name,
      root: detected?.root ?? "",
      quality: detected?.quality ?? "",
      bassNote: detected?.bassNote,
      displayName: diagram.name.displayName,
    },
  };
}
