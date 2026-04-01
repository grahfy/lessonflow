import type { ChordDiagramData } from "./chord-types";

const SHARP_NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const STANDARD_GUITAR_OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;

export interface PlayableChordNote {
  stringIndex: number;
  midi: number;
  note: string;
}

/**
 * Converts a MIDI note number into scientific pitch notation.
 */
export function midiToScientificPitch(midi: number): string {
  const noteName = SHARP_NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

/**
 * Returns playable string notes for browser-side chord preview.
 *
 * RATIONALE: Chord diagrams currently store tuning note names without octave
 * numbers, so preview playback assumes standard guitar string registers.
 */
export function getPlayableChordNotes(diagram: ChordDiagramData): PlayableChordNote[] {
  return diagram.fingering.strings.flatMap((fret, stringIndex) => {
    if (fret < 0) {
      return [];
    }

    const absoluteFret = fret > 0 ? fret + diagram.fingering.startFret - 1 : 0;
    const midi = STANDARD_GUITAR_OPEN_STRING_MIDI[stringIndex] + absoluteFret;

    return [{
      stringIndex,
      midi,
      note: midiToScientificPitch(midi),
    }];
  });
}
