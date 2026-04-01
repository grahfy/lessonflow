"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Sampler } from "tone";

import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { getPlayableChordNotes } from "@/lib/chords/chord-preview";

type PreviewMode = "strum" | "block";

const CHORD_PREVIEW_BASE_URL = "/audio/chord-preview/guitar-acoustic/";
const CHORD_PREVIEW_SAMPLE_FILES = [
  "E2.mp3",
  "F2.mp3",
  "Fs2.mp3",
  "G2.mp3",
  "Gs2.mp3",
  "A2.mp3",
  "As2.mp3",
  "B2.mp3",
  "C3.mp3",
  "Cs3.mp3",
  "D3.mp3",
  "Ds3.mp3",
  "E3.mp3",
  "F3.mp3",
  "Fs3.mp3",
  "G3.mp3",
  "Gs3.mp3",
  "A3.mp3",
  "As3.mp3",
  "B3.mp3",
  "C4.mp3",
  "Cs4.mp3",
  "D4.mp3",
  "Ds4.mp3",
  "E4.mp3",
  "F4.mp3",
  "Fs4.mp3",
  "G4.mp3",
  "Gs4.mp3",
  "A4.mp3",
  "As4.mp3",
  "B4.mp3",
  "C5.mp3",
  "Cs5.mp3",
  "D5.mp3",
] as const;

const STRUM_STEP_SECONDS = 0.075;
const BLOCK_DURATION_SECONDS = 1.6;
const STRUM_DURATION_SECONDS = 1.45;

let toneModulePromise: Promise<typeof import("tone")> | null = null;
let samplerPromise: Promise<Sampler> | null = null;

function getSampleNoteName(fileName: string): string {
  const stem = fileName.replace(/\.mp3$/, "");
  return stem.replace(/^([A-G])s(\d)$/, "$1#$2");
}

function getChordPreviewSampleMap(): Record<string, string> {
  return Object.fromEntries(
    CHORD_PREVIEW_SAMPLE_FILES.map((fileName) => [getSampleNoteName(fileName), fileName])
  );
}

function getToneModule(): Promise<typeof import("tone")> {
  if (!toneModulePromise) {
    toneModulePromise = import("tone");
  }

  return toneModulePromise;
}

async function getChordPreviewSampler(): Promise<Sampler> {
  if (!samplerPromise) {
    samplerPromise = (async () => {
      const Tone = await getToneModule();
      const sampler = new Tone.Sampler({
        urls: getChordPreviewSampleMap(),
        baseUrl: CHORD_PREVIEW_BASE_URL,
        attack: 0.01,
        release: 1.8,
      }).toDestination();

      sampler.volume.value = -10;

      await Tone.loaded();
      return sampler;
    })().catch((error: unknown) => {
      samplerPromise = null;
      throw error;
    });
  }

  return samplerPromise;
}

function getPreviewErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Guitar preview is unavailable right now.";
}

/**
 * Provides button-driven audio preview state and playback handlers for the
 * admin chord builder.
 */
export function useChordPreview(diagram: ChordDiagramData, isOpen: boolean) {
  const playableNotes = useMemo(() => getPlayableChordNotes(diagram), [diagram]);
  const samplerRef = useRef<Sampler | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedSamples, setHasLoadedSamples] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!isOpen && samplerRef.current) {
      samplerRef.current.releaseAll();
    }
  }, [isOpen]);

  const playPreview = useCallback(
    async (mode: PreviewMode) => {
      if (playableNotes.length === 0) {
        return;
      }

      const shouldShowLoadingState = !hasLoadedSamples;

      if (shouldShowLoadingState) {
        setIsLoading(true);
      }

      setPreviewError("");

      try {
        const Tone = await getToneModule();
        await Tone.start();

        const sampler = await getChordPreviewSampler();
        samplerRef.current = sampler;
        setHasLoadedSamples(true);

        const now = Tone.now() + 0.02;
        sampler.releaseAll(now);

        if (mode === "block") {
          sampler.triggerAttackRelease(
            playableNotes.map((note) => note.note),
            BLOCK_DURATION_SECONDS,
            now,
            0.82
          );
          return;
        }

        playableNotes.forEach((note, index) => {
          sampler.triggerAttackRelease(
            note.note,
            STRUM_DURATION_SECONDS,
            now + index * STRUM_STEP_SECONDS,
            0.78
          );
        });
      } catch (error: unknown) {
        setPreviewError(getPreviewErrorMessage(error));
      } finally {
        if (shouldShowLoadingState) {
          setIsLoading(false);
        }
      }
    },
    [hasLoadedSamples, playableNotes]
  );

  return {
    canPreview: playableNotes.length > 0,
    isLoading,
    previewError,
    previewMessage: isLoading ? "Loading guitar samples..." : "",
    playBlockPreview: () => {
      void playPreview("block");
    },
    playStrumPreview: () => {
      void playPreview("strum");
    },
  };
}
