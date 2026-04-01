/**
 * Core data types for chord diagrams.
 *
 * A chord diagram captures the full state of a guitar chord voicing:
 * which fret each string is played at, which finger to use, barre
 * positions, the starting fret for higher-position chords, and
 * left-handed display mode.
 */

/** Per-string fret value: -1 = muted (X), 0 = open (O), 1–24 = fret number. */
export type StringFretValue = number;

/** Per-string finger value: 0 = no finger (open/muted), 1–4 = index..pinky. */
export type FingerValue = number;

/** A six-element tuple representing all six guitar strings, low E to high E. */
export type StringTuple<T> = [T, T, T, T, T, T];

export interface BarreIndicator {
  fret: number;
  fromString: number;
  toString: number;
}

export interface ChordFingering {
  /** Fret positions per string. -1 = muted, 0 = open, 1–24 = fret. */
  strings: StringTuple<StringFretValue>;
  /** Finger numbers per string. 0 = none, 1–4 = finger. */
  fingers: StringTuple<FingerValue>;
  /** Barre indicators spanning multiple strings on the same fret. */
  barres: BarreIndicator[];
  /**
   * Starting fret position. 1 = open position (nut shown).
   * Values > 1 shift the diagram up the neck and display the fret number
   * to the left of the first visible fret.
   */
  startFret: number;
  /** Number of frets to display (typically 5). */
  fretCount: number;
}

export interface ChordName {
  /** Root note: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B */
  root: string;
  /** Quality/type: major, minor, 7, m7, maj7, dim, aug, sus2, sus4, etc. */
  quality: string;
  /** Optional bass note for slash chords (e.g., C/G). */
  bassNote?: string;
  /** Free-form display name override (e.g., "Cmaj7#11"). */
  displayName?: string;
}

export interface ChordDiagramData {
  name: ChordName;
  fingering: ChordFingering;
  /** String tuning, low-to-high. Default: ["E", "A", "D", "G", "B", "E"] */
  tuning: StringTuple<string>;
  /** Whether to mirror the diagram for left-handed players. */
  isLeftHanded: boolean;
}

export const STANDARD_TUNING: StringTuple<string> = ["E", "A", "D", "G", "B", "E"];

export const DEFAULT_FRET_COUNT = 5;

export function createEmptyFingering(): ChordFingering {
  return {
    strings: [0, 0, 0, 0, 0, 0],
    fingers: [0, 0, 0, 0, 0, 0],
    barres: [],
    startFret: 1,
    fretCount: DEFAULT_FRET_COUNT,
  };
}

export function createEmptyChordDiagram(): ChordDiagramData {
  return {
    name: { root: "C", quality: "major" },
    fingering: createEmptyFingering(),
    tuning: [...STANDARD_TUNING],
    isLeftHanded: false,
  };
}
