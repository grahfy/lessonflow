import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CHORD_PREVIEW_SAMPLE_FILES,
  createChordPreviewSampler,
  getChordPreviewSampleMap,
  loadChordPreviewSamplerWithTone,
  resetChordPreviewSamplerCache,
} from "@/components/admin/chords/use-chord-preview";

type FakeSamplerOptions = {
  onerror?: (error: Error) => void;
  onload?: () => void;
};

function createFakeToneHarness() {
  let constructCount = 0;

  class FakeSampler {
    loaded = false;
    volume = { value: 0 };
    readonly options: FakeSamplerOptions;

    constructor(options: FakeSamplerOptions) {
      this.options = options;
      constructCount += 1;
    }

    releaseAll() {}

    toDestination() {
      return this;
    }

    triggerAttackRelease() {}

    flushLoad() {
      this.loaded = true;
      this.options.onload?.();
    }

    failLoad(error: Error) {
      this.options.onerror?.(error);
    }
  }

  class TrackingFakeSampler extends FakeSampler {
    static latest: TrackingFakeSampler | null = null;

    constructor(options: FakeSamplerOptions) {
      super(options);
      TrackingFakeSampler.latest = this;
    }
  }

  return {
    Tone: {
      Sampler: TrackingFakeSampler,
    },
    failLoad(error: Error) {
      if (!TrackingFakeSampler.latest) {
        throw new Error("No sampler instance available.");
      }

      TrackingFakeSampler.latest.failLoad(error);
    },
    flushLoad() {
      if (!TrackingFakeSampler.latest) {
        throw new Error("No sampler instance available.");
      }

      TrackingFakeSampler.latest.flushLoad();
    },
    getConstructCount() {
      return constructCount;
    },
    getCurrentSampler() {
      return TrackingFakeSampler.latest;
    },
  };
}

describe("chord preview sampler loader", () => {
  beforeEach(() => {
    resetChordPreviewSamplerCache();
  });

  afterEach(() => {
    resetChordPreviewSamplerCache();
  });

  it("matches the committed guitar sample pack including low D samples", () => {
    expect(CHORD_PREVIEW_SAMPLE_FILES).toContain("D2.mp3");
    expect(CHORD_PREVIEW_SAMPLE_FILES).toContain("Ds2.mp3");
    expect(getChordPreviewSampleMap()).toMatchObject({
      D2: "D2.mp3",
      "D#2": "Ds2.mp3",
      E2: "E2.mp3",
      B3: "B3.mp3",
      D5: "D5.mp3",
    });
  });

  it("resolves only after the sampler-specific onload fires", async () => {
    const harness = createFakeToneHarness();
    let didResolve = false;

    const samplerPromise = createChordPreviewSampler(harness.Tone as never).then((sampler) => {
      didResolve = true;
      return sampler;
    });

    await Promise.resolve();
    expect(didResolve).toBe(false);

    harness.flushLoad();
    const sampler = await samplerPromise;

    expect(sampler.loaded).toBe(true);
    expect(sampler.volume.value).toBe(-10);
  });

  it("clears the cached sampler promise after a load failure so the next attempt can retry", async () => {
    const harness = createFakeToneHarness();

    const firstAttempt = loadChordPreviewSamplerWithTone(harness.Tone as never);
    harness.failLoad(new Error("GET /audio/chord-preview/guitar-acoustic/E2.mp3 404"));

    await expect(firstAttempt).rejects.toThrow("Failed to load guitar preview samples.");
    expect(harness.getConstructCount()).toBe(1);

    const secondAttempt = loadChordPreviewSamplerWithTone(harness.Tone as never);
    expect(harness.getConstructCount()).toBe(2);

    harness.flushLoad();
    const sampler = await secondAttempt;

    expect(sampler).toBe(harness.getCurrentSampler());
    expect(sampler.loaded).toBe(true);
  });
});
