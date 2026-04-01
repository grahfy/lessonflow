/**
 * Music theory utilities for chord name formatting and note calculation.
 */

import type { ChordDiagramData, StringTuple } from "./chord-types";

/** Chromatic scale using sharps. */
export const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Chromatic scale using flats. */
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** All valid root note names (sharps and flats). */
export const ALL_ROOT_NOTES = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"
] as const;

/** Common chord quality suffixes. */
export const CHORD_QUALITIES = [
  "major", "minor", "7", "m7", "maj7", "dim", "aug",
  "sus2", "sus4", "6", "m6", "9", "m9", "add9",
  "dim7", "m7b5", "7sus4", "mmaj7", "aug7", "5",
] as const;

/** Display labels for chord qualities. */
export const QUALITY_DISPLAY_MAP: Record<string, string> = {
  major: "",
  minor: "m",
  "7": "7",
  m7: "m7",
  maj7: "maj7",
  dim: "dim",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  "6": "6",
  m6: "m6",
  "9": "9",
  m9: "m9",
  add9: "add9",
  dim7: "dim7",
  m7b5: "m7b5",
  "7sus4": "7sus4",
  mmaj7: "mmaj7",
  aug7: "aug7",
  "5": "5",
};

/**
 * Returns the semitone index (0–11) for a note name.
 * Handles both sharps and flats.
 */
export function noteToSemitone(note: string): number {
  const sharpIdx = NOTE_NAMES_SHARP.indexOf(note as typeof NOTE_NAMES_SHARP[number]);
  if (sharpIdx !== -1) return sharpIdx;
  const flatIdx = NOTE_NAMES_FLAT.indexOf(note as typeof NOTE_NAMES_FLAT[number]);
  if (flatIdx !== -1) return flatIdx;
  return 0;
}

/**
 * Given an open string note and a fret number, returns the resulting note name.
 * Uses sharps by default.
 */
export function getNoteAtFret(openNote: string, fret: number): string {
  if (fret <= 0) return openNote;
  const base = noteToSemitone(openNote);
  const idx = (base + fret) % 12;
  return NOTE_NAMES_SHARP[idx];
}

/**
 * Returns the sounding note for each string in a chord diagram.
 * Muted strings return "X".
 */
export function getChordNotes(diagram: ChordDiagramData): StringTuple<string> {
  const { fingering, tuning } = diagram;
  return fingering.strings.map((fret, i) => {
    if (fret === -1) return "X";
    if (fret === 0) return tuning[i];
    const absoluteFret = fret + fingering.startFret - 1;
    return getNoteAtFret(tuning[i], absoluteFret);
  }) as StringTuple<string>;
}

/**
 * Formats a chord name for display.
 * Returns the displayName override if set, otherwise root + quality suffix + optional bass.
 */
export function formatChordName(name: { root: string; quality: string; bassNote?: string; displayName?: string }): string {
  if (name.displayName) return name.displayName;
  const suffix = QUALITY_DISPLAY_MAP[name.quality] ?? name.quality;
  const base = `${name.root}${suffix}`;
  return name.bassNote ? `${base}/${name.bassNote}` : base;
}
