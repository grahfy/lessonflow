"use client";

import { useCallback, useMemo, useReducer } from "react";
import type {
  ChordDiagramData,
  ChordFingering,
  BarreIndicator,
  StringTuple,
  StringFretValue,
  FingerValue,
} from "@/lib/chords/chord-types";
import { createEmptyChordDiagram, DEFAULT_FRET_COUNT } from "@/lib/chords/chord-types";
import { detectChordNameFromDiagram, syncDiagramNameWithDetection } from "@/lib/chords/chord-detection";

// ─── Action Types ────────────────────────────────────────────

type ChordAction =
  | { type: "PLACE_DOT"; stringIndex: number; fret: number; finger: number }
  | { type: "REMOVE_DOT"; stringIndex: number }
  | { type: "SET_STRING_STATE"; stringIndex: number; state: "open" | "muted" }
  | { type: "CYCLE_STRING_STATE"; stringIndex: number }
  | { type: "ADD_BARRE"; barre: BarreIndicator; finger: number }
  | { type: "REMOVE_BARRE"; fret: number }
  | { type: "SET_ROOT"; root: string }
  | { type: "SET_QUALITY"; quality: string }
  | { type: "SET_BASS_NOTE"; bassNote: string | undefined }
  | { type: "SET_DISPLAY_NAME"; displayName: string | undefined }
  | { type: "SET_LEFT_HANDED"; isLeftHanded: boolean }
  | { type: "SET_START_FRET"; startFret: number }
  | { type: "CLEAR_ALL" }
  | { type: "LOAD_FINGERING"; fingering: ChordFingering }
  | { type: "LOAD_DIAGRAM"; diagram: ChordDiagramData };

function normalizeBarre(barre: BarreIndicator): BarreIndicator {
  return {
    fret: barre.fret,
    fromString: Math.min(barre.fromString, barre.toString),
    toString: Math.max(barre.fromString, barre.toString),
  };
}

/**
 * Applies a barre to the current fingering so the sounding strings match the
 * visual barre indicator.
 */
export function applyBarreToFingering(
  fingering: ChordFingering,
  barre: BarreIndicator,
  finger: number
): ChordFingering {
  const normalizedBarre = normalizeBarre(barre);
  const strings = [...fingering.strings] as StringTuple<StringFretValue>;
  const fingers = [...fingering.fingers] as StringTuple<FingerValue>;

  for (let stringIndex = normalizedBarre.fromString; stringIndex <= normalizedBarre.toString; stringIndex += 1) {
    if (strings[stringIndex] <= 0 || strings[stringIndex] < normalizedBarre.fret) {
      strings[stringIndex] = normalizedBarre.fret;
    }

    if (strings[stringIndex] === normalizedBarre.fret) {
      fingers[stringIndex] = finger;
    }
  }

  return {
    ...fingering,
    strings,
    fingers,
    barres: [...fingering.barres.filter((existing) => existing.fret !== normalizedBarre.fret), normalizedBarre],
  };
}

/**
 * Removes a barre overlay while preserving the underlying fretted strings.
 */
export function removeBarreFromFingering(fingering: ChordFingering, fret: number): ChordFingering {
  return {
    ...fingering,
    barres: fingering.barres.filter((barre) => barre.fret !== fret),
  };
}

// ─── Reducer ─────────────────────────────────────────────────

function chordReducer(state: ChordDiagramData, action: ChordAction): ChordDiagramData {
  switch (action.type) {
    case "PLACE_DOT": {
      const strings = [...state.fingering.strings] as StringTuple<StringFretValue>;
      const fingers = [...state.fingering.fingers] as StringTuple<FingerValue>;
      strings[action.stringIndex] = action.fret;
      fingers[action.stringIndex] = action.finger;
      return syncDiagramNameWithDetection({
        ...state,
        fingering: { ...state.fingering, strings, fingers },
      });
    }

    case "REMOVE_DOT": {
      const strings = [...state.fingering.strings] as StringTuple<StringFretValue>;
      const fingers = [...state.fingering.fingers] as StringTuple<FingerValue>;
      strings[action.stringIndex] = 0;
      fingers[action.stringIndex] = 0;
      return syncDiagramNameWithDetection({
        ...state,
        fingering: { ...state.fingering, strings, fingers },
      });
    }

    case "SET_STRING_STATE": {
      const strings = [...state.fingering.strings] as StringTuple<StringFretValue>;
      const fingers = [...state.fingering.fingers] as StringTuple<FingerValue>;
      strings[action.stringIndex] = action.state === "muted" ? -1 : 0;
      fingers[action.stringIndex] = 0;
      return syncDiagramNameWithDetection({
        ...state,
        fingering: { ...state.fingering, strings, fingers },
      });
    }

    case "CYCLE_STRING_STATE": {
      const current = state.fingering.strings[action.stringIndex];
      const strings = [...state.fingering.strings] as StringTuple<StringFretValue>;
      const fingers = [...state.fingering.fingers] as StringTuple<FingerValue>;
      // Cycle: open(0) → muted(-1) → open(0) (for strings with no fret placed)
      // For fretted strings: remove the dot → open
      if (current > 0) {
        strings[action.stringIndex] = 0;
        fingers[action.stringIndex] = 0;
      } else if (current === 0) {
        strings[action.stringIndex] = -1;
        fingers[action.stringIndex] = 0;
      } else {
        strings[action.stringIndex] = 0;
        fingers[action.stringIndex] = 0;
      }
      return syncDiagramNameWithDetection({
        ...state,
        fingering: { ...state.fingering, strings, fingers },
      });
    }

    case "ADD_BARRE": {
      return syncDiagramNameWithDetection({
        ...state,
        fingering: applyBarreToFingering(state.fingering, action.barre, action.finger),
      });
    }

    case "REMOVE_BARRE": {
      return syncDiagramNameWithDetection({
        ...state,
        fingering: removeBarreFromFingering(state.fingering, action.fret),
      });
    }

    case "SET_ROOT":
      return { ...state, name: { ...state.name, root: action.root } };

    case "SET_QUALITY":
      return { ...state, name: { ...state.name, quality: action.quality } };

    case "SET_BASS_NOTE":
      return { ...state, name: { ...state.name, bassNote: action.bassNote } };

    case "SET_DISPLAY_NAME":
      return { ...state, name: { ...state.name, displayName: action.displayName } };

    case "SET_LEFT_HANDED":
      return { ...state, isLeftHanded: action.isLeftHanded };

    case "SET_START_FRET":
      return syncDiagramNameWithDetection({
        ...state,
        fingering: { ...state.fingering, startFret: Math.max(1, Math.min(24, action.startFret)) },
      });

    case "CLEAR_ALL":
      return syncDiagramNameWithDetection({
        ...state,
        fingering: {
          strings: [0, 0, 0, 0, 0, 0],
          fingers: [0, 0, 0, 0, 0, 0],
          barres: [],
          startFret: 1,
          fretCount: DEFAULT_FRET_COUNT,
        },
      });

    case "LOAD_FINGERING":
      return syncDiagramNameWithDetection({ ...state, fingering: action.fingering });

    case "LOAD_DIAGRAM":
      return syncDiagramNameWithDetection(action.diagram);

    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────

export interface ChordBuilderState {
  diagram: ChordDiagramData;
  selectedFinger: number;
}

export function useChordBuilder(initial?: ChordDiagramData) {
  const [diagram, dispatch] = useReducer(
    chordReducer,
    initial ?? createEmptyChordDiagram(),
    syncDiagramNameWithDetection
  );
  const detectedChord = useMemo(() => detectChordNameFromDiagram(diagram), [diagram]);

  const placeDot = useCallback(
    (stringIndex: number, fret: number, finger: number) =>
      dispatch({ type: "PLACE_DOT", stringIndex, fret, finger }),
    []
  );

  const removeDot = useCallback(
    (stringIndex: number) => dispatch({ type: "REMOVE_DOT", stringIndex }),
    []
  );

  const cycleStringState = useCallback(
    (stringIndex: number) => dispatch({ type: "CYCLE_STRING_STATE", stringIndex }),
    []
  );

  const addBarre = useCallback(
    (barre: BarreIndicator, finger: number) => dispatch({ type: "ADD_BARRE", barre, finger }),
    []
  );

  const removeBarre = useCallback(
    (fret: number) => dispatch({ type: "REMOVE_BARRE", fret }),
    []
  );

  const setRoot = useCallback(
    (root: string) => dispatch({ type: "SET_ROOT", root }),
    []
  );

  const setQuality = useCallback(
    (quality: string) => dispatch({ type: "SET_QUALITY", quality }),
    []
  );

  const setBassNote = useCallback(
    (bassNote: string | undefined) => dispatch({ type: "SET_BASS_NOTE", bassNote }),
    []
  );

  const setDisplayName = useCallback(
    (displayName: string | undefined) => dispatch({ type: "SET_DISPLAY_NAME", displayName }),
    []
  );

  const setLeftHanded = useCallback(
    (isLeftHanded: boolean) => dispatch({ type: "SET_LEFT_HANDED", isLeftHanded }),
    []
  );

  const setStartFret = useCallback(
    (startFret: number) => dispatch({ type: "SET_START_FRET", startFret }),
    []
  );

  const clearAll = useCallback(() => dispatch({ type: "CLEAR_ALL" }), []);

  const loadFingering = useCallback(
    (fingering: ChordFingering) => dispatch({ type: "LOAD_FINGERING", fingering }),
    []
  );

  const loadDiagram = useCallback(
    (d: ChordDiagramData) => dispatch({ type: "LOAD_DIAGRAM", diagram: d }),
    []
  );

  return {
    diagram,
    detectedChord,
    placeDot,
    removeDot,
    cycleStringState,
    addBarre,
    removeBarre,
    setRoot,
    setQuality,
    setBassNote,
    setDisplayName,
    setLeftHanded,
    setStartFret,
    clearAll,
    loadFingering,
    loadDiagram,
  };
}
