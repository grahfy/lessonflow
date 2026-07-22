import type { Sampler } from "tone";

export type PreviewMode = "strum" | "block";
export type ToneModuleLike = Pick<typeof import("tone"), "Sampler">;

export interface PreviewPlaybackEvent {
  durationSeconds: number;
  note: string;
  timeOffsetSeconds: number;
  velocity: number;
}

const CHORD_PREVIEW_BASE_URL = "/audio/chord-preview/guitar-acoustic/";
const CHORD_PREVIEW_SAMPLER_NOT_READY_ERROR = "Guitar preview samples are still loading. Please try again.";

export const CHORD_PREVIEW_SAMPLE_FILES = [
  "D2.mp3",
  "Ds2.mp3",
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
const BLOCK_STEP_SECONDS = 0.012;
const BLOCK_DURATION_SECONDS = 1.6;
const STRUM_DURATION_SECONDS = 1.45;

let toneModulePromise: Promise<typeof import("tone")> | null = null;
let samplerPromise: Promise<Sampler> | null = null;

function getSampleNoteName(fileName: string): string {
  const stem = fileName.replace(/\.mp3$/, "");
  return stem.replace(/^([A-G])s(\d)$/, "$1#$2");
}

export function getChordPreviewSampleMap(): Record<string, string> {
  return Object.fromEntries(
    CHORD_PREVIEW_SAMPLE_FILES.map((fileName) => [getSampleNoteName(fileName), fileName])
  );
}

function getChordPreviewLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `Failed to load guitar preview samples. ${error.message}`;
  }

  return "Failed to load guitar preview samples.";
}

export function ensureChordPreviewSamplerReady(sampler: Sampler): Sampler {
  if (!sampler.loaded) {
    throw new Error(CHORD_PREVIEW_SAMPLER_NOT_READY_ERROR);
  }

  return sampler;
}

export function getToneModule(): Promise<typeof import("tone")> {
  if (!toneModulePromise) {
    toneModulePromise = import("tone");
  }

  return toneModulePromise;
}

export async function createChordPreviewSampler(Tone: ToneModuleLike): Promise<Sampler> {
  return await new Promise<Sampler>((resolve, reject) => {
    let didSettle = false;
    let sampler: Sampler | null = null;

    const rejectLoad = (error: unknown) => {
      if (didSettle) {
        return;
      }

      didSettle = true;
      reject(new Error(getChordPreviewLoadErrorMessage(error)));
    };

    const resolveLoad = () => {
      if (didSettle || !sampler) {
        return;
      }

      try {
        didSettle = true;
        resolve(ensureChordPreviewSamplerReady(sampler));
      } catch (error: unknown) {
        reject(error);
      }
    };

    sampler = new Tone.Sampler({
      urls: getChordPreviewSampleMap(),
      baseUrl: CHORD_PREVIEW_BASE_URL,
      attack: 0.01,
      release: 1.8,
      onload: resolveLoad,
      onerror: rejectLoad,
    }).toDestination();

    sampler.volume.value = -10;

    if (sampler.loaded) {
      resolveLoad();
    }
  });
}

export async function loadChordPreviewSamplerWithTone(Tone: ToneModuleLike): Promise<Sampler> {
  if (!samplerPromise) {
    samplerPromise = createChordPreviewSampler(Tone).catch((error: unknown) => {
      samplerPromise = null;
      throw error;
    });
  }

  return await samplerPromise;
}

export function resetChordPreviewSamplerCache(): void {
  samplerPromise = null;
}

export async function getChordPreviewSampler(): Promise<Sampler> {
  const Tone = await getToneModule();
  return await loadChordPreviewSamplerWithTone(Tone);
}

export function getPreviewErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes("buffer is either not set or not loaded")) {
      return CHORD_PREVIEW_SAMPLER_NOT_READY_ERROR;
    }

    return error.message;
  }

  return "Guitar preview is unavailable right now.";
}

/**
 * Builds a per-string playback plan so duplicate pitches can still retrigger
 * as separate strings in block and strum previews.
 */
export function buildChordPreviewPlaybackPlan(
  notes: Array<{ note: string }>,
  mode: PreviewMode
): PreviewPlaybackEvent[] {
  const stepSeconds = mode === "block" ? BLOCK_STEP_SECONDS : STRUM_STEP_SECONDS;
  const durationSeconds = mode === "block" ? BLOCK_DURATION_SECONDS : STRUM_DURATION_SECONDS;
  const velocity = mode === "block" ? 0.82 : 0.78;

  return notes.map((note, index) => ({
    durationSeconds,
    note: note.note,
    timeOffsetSeconds: index * stepSeconds,
    velocity,
  }));
}
