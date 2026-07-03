/**
 * Chord voicing lookup service.
 *
 * Primary source: @tombatossals/chords-db — a static JSON database of 529+
 * guitar chords with multiple voicing positions each.
 *
 * Fallback: Uberchord API (free, no auth) for rarer chords not in the
 * static database. Treated as best-effort.
 */

import type { ChordFingering, StringTuple, StringFretValue, FingerValue } from "./chord-types";
import { DEFAULT_FRET_COUNT } from "./chord-types";
import { CHORD_QUALITIES } from "./music-theory";

// The chords-db package uses "Csharp"/"Fsharp" for sharp keys.
const KEY_MAP: Record<string, string> = {
  "C": "C", "C#": "Csharp", "Db": "Csharp",
  "D": "D", "D#": "Eb", "Eb": "Eb",
  "E": "E",
  "F": "F", "F#": "Fsharp", "Gb": "Fsharp",
  "G": "G", "G#": "Ab", "Ab": "Ab",
  "A": "A", "A#": "Bb", "Bb": "Bb",
  "B": "B",
};

interface ChordsDbPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  midi: number[];
  capo?: boolean;
}

interface ChordsDbChord {
  key: string;
  suffix: string;
  positions: ChordsDbPosition[];
}

interface ChordsDbData {
  keys: string[];
  suffixes: string[];
  chords: Record<string, ChordsDbChord[]>;
}

export interface LookupChordVoicingEntry {
  root: string;
  quality: string;
  fingering: ChordFingering;
}

let cachedDb: ChordsDbData | null = null;

function getDb(): ChordsDbData {
  if (!cachedDb) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedDb = require("@tombatossals/chords-db/lib/guitar.json") as ChordsDbData;
  }
  return cachedDb;
}

function getDbSuffixForChord(root: string, quality: string, bassNote?: string): string | null {
  if (bassNote) {
    if (quality === "major") return `/${bassNote}`;
    if (quality === "minor") return `m/${bassNote}`;
    return null;
  }

  return quality;
}

/**
 * Converts a chords-db position to our ChordFingering format.
 */
function positionToFingering(pos: ChordsDbPosition): ChordFingering {
  const strings = [...pos.frets] as StringTuple<StringFretValue>;
  const fingers = pos.fingers.map((f) => Math.min(f, 4)) as StringTuple<FingerValue>;

  const barres = pos.barres.map((barreFret) => {
    const stringsOnFret = pos.frets
      .map((f, i) => (f === barreFret ? i : -1))
      .filter((i) => i !== -1);
    return {
      fret: barreFret,
      fromString: Math.min(...stringsOnFret),
      toString: Math.max(...stringsOnFret),
    };
  });

  return {
    strings,
    fingers,
    barres,
    startFret: pos.baseFret,
    fretCount: DEFAULT_FRET_COUNT,
  };
}

/**
 * Looks up chord voicings from the static chords-db database.
 *
 * @param root - Root note (e.g. "C", "F#", "Bb")
 * @param quality - Chord quality (e.g. "major", "m7", "dim")
 * @param bassNote - Optional bass note for slash chords
 * @returns Array of ChordFingering options
 */
export function lookupChordVoicings(root: string, quality: string, bassNote?: string): ChordFingering[] {
  if (!root || !quality) return [];

  const db = getDb();
  const key = KEY_MAP[root];
  if (!key) return [];

  const chords = db.chords[key];
  if (!chords) return [];

  const targetSuffix = getDbSuffixForChord(root, quality, bassNote);
  if (!targetSuffix) return [];

  const match = chords.find((c) => c.suffix === targetSuffix);
  if (!match) return [];

  return match.positions.map(positionToFingering);
}

/**
 * Returns the quality names that are both supported by the app and present in
 * the bundled chords dataset.
 */
export function getImportableChordQualities(): string[] {
  const availableSuffixes = new Set(getDb().suffixes);
  return CHORD_QUALITIES.filter((quality) => availableSuffixes.has(quality));
}

/**
 * Enumerates every importable chord voicing from the bundled dataset for the
 * app's supported quality vocabulary.
 */
export function listImportableChordVoicings(): LookupChordVoicingEntry[] {
  const db = getDb();
  const qualities = getImportableChordQualities();
  const entries: LookupChordVoicingEntry[] = [];

  for (const root of db.keys) {
    const chords = db.chords[root] ?? [];

    for (const quality of qualities) {
      const chord = chords.find((candidate) => candidate.suffix === quality);
      if (!chord) continue;

      for (const position of chord.positions) {
        entries.push({
          root,
          quality,
          fingering: positionToFingering(position),
        });
      }
    }
  }

  return entries;
}

/**
 * Returns all available suffixes from the chords-db database.
 */
export function getAvailableSuffixes(): string[] {
  return getDb().suffixes;
}

/**
 * Returns all available root keys from the chords-db database.
 */
export function getAvailableKeys(): string[] {
  return getDb().keys;
}

interface UberchordResponse {
  chordName: string;
  strings: string;
  fingering: string;
  tones: string;
}

/**
 * Fetches chord voicings from the Uberchord API as a fallback.
 * Returns an empty array on failure (best-effort).
 */
export async function lookupChordVoicingsOnline(chordName: string): Promise<ChordFingering[]> {
  try {
    const res = await fetch(`https://api.uberchord.com/v1/chords/${encodeURIComponent(chordName)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as UberchordResponse[];
    if (!Array.isArray(data)) return [];

    return data.map((entry) => {
      const frets = entry.strings.split(" ").map((s) => (s === "X" ? -1 : parseInt(s, 10)));
      const fingers = entry.fingering.split(" ").map((s) => {
        const n = parseInt(s, 10);
        return isNaN(n) ? 0 : Math.min(n, 4);
      });

      while (frets.length < 6) frets.push(-1);
      while (fingers.length < 6) fingers.push(0);

      const playedFrets = frets.filter((f) => f > 0);
      const minFret = playedFrets.length > 0 ? Math.min(...playedFrets) : 1;
      const maxFret = playedFrets.length > 0 ? Math.max(...playedFrets) : 1;
      const startFret = maxFret <= 5 ? 1 : minFret;

      const adjustedFrets = frets.map((f) =>
        f <= 0 ? f : f - startFret + 1
      ) as StringTuple<StringFretValue>;

      return {
        strings: adjustedFrets,
        fingers: fingers.slice(0, 6) as StringTuple<FingerValue>,
        barres: [],
        startFret,
        fretCount: DEFAULT_FRET_COUNT,
      };
    });
  } catch {
    return [];
  }
}
