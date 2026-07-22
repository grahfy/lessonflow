"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Sampler } from "tone";

import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { getPlayableChordNotes } from "@/lib/chords/chord-preview";
import {
  buildChordPreviewPlaybackPlan,
  ensureChordPreviewSamplerReady,
  getChordPreviewSampler,
  getPreviewErrorMessage,
  getToneModule,
  type PreviewMode,
} from "@/lib/chords/chord-preview-sampler";

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

        const sampler = ensureChordPreviewSamplerReady(await getChordPreviewSampler());
        samplerRef.current = sampler;
        setHasLoadedSamples(true);

        const now = Tone.now() + 0.02;
        sampler.releaseAll(now);

        const playbackPlan = buildChordPreviewPlaybackPlan(playableNotes, mode);
        playbackPlan.forEach((note) => {
          sampler.triggerAttackRelease(
            note.note,
            note.durationSeconds,
            now + note.timeOffsetSeconds,
            note.velocity
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
