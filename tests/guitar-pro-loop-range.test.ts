// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  barRangeToTicks,
  clampTick,
  isNewLoopPass,
  type BarTiming,
  type TickRange
} from "@/lib/guitar-pro/loop-range";

const BARS: BarTiming[] = [
  { startTick: 0, durationTicks: 1000 }, // bar 0: 0..1000
  { startTick: 1000, durationTicks: 1000 }, // bar 1: 1000..2000
  { startTick: 2000, durationTicks: 500 }, // bar 2: 2000..2500
  { startTick: 2500, durationTicks: 1500 } // bar 3: 2500..4000
];

describe("barRangeToTicks", () => {
  it("builds a normal multi-bar range", () => {
    expect(barRangeToTicks(BARS, 1, 2)).toEqual({ startTick: 1000, endTick: 2500 });
  });

  it("builds a single-bar range", () => {
    expect(barRangeToTicks(BARS, 2, 2)).toEqual({ startTick: 2000, endTick: 2500 });
  });

  it("swaps indices when startBarIndex > endBarIndex", () => {
    expect(barRangeToTicks(BARS, 3, 1)).toEqual({ startTick: 1000, endTick: 4000 });
  });

  it("clamps an end index past the end of the list", () => {
    expect(barRangeToTicks(BARS, 0, 99)).toEqual({ startTick: 0, endTick: 4000 });
  });

  it("clamps a negative start index", () => {
    expect(barRangeToTicks(BARS, -5, 0)).toEqual({ startTick: 0, endTick: 1000 });
  });

  it("clamps non-finite indices to 0 rather than propagating NaN", () => {
    expect(barRangeToTicks(BARS, Number.NaN, 1)).toEqual({ startTick: 0, endTick: 2000 });
  });

  it("returns null for an empty bar list", () => {
    expect(barRangeToTicks([], 0, 0)).toBeNull();
  });

  it("returns null for a missing bar list", () => {
    expect(barRangeToTicks(undefined as unknown as BarTiming[], 0, 0)).toBeNull();
  });

  it("treats a non-finite end-bar duration as zero instead of corrupting the range", () => {
    const bars: BarTiming[] = [{ startTick: 0, durationTicks: 1000 }, { startTick: 1000, durationTicks: Number.NaN }];
    expect(barRangeToTicks(bars, 0, 1)).toEqual({ startTick: 0, endTick: 1000 });
  });

  it("treats a negative end-bar duration as zero instead of corrupting the range", () => {
    const bars: BarTiming[] = [{ startTick: 0, durationTicks: 1000 }, { startTick: 1000, durationTicks: -50 }];
    expect(barRangeToTicks(bars, 0, 1)).toEqual({ startTick: 0, endTick: 1000 });
  });
});

describe("isNewLoopPass", () => {
  const range: TickRange = { startTick: 1000, endTick: 2000 };

  it("detects a genuine end-to-start wrap", () => {
    expect(isNewLoopPass(1998, 1000, range)).toBe(true);
  });

  it("detects a wrap landing exactly at the range start", () => {
    expect(isNewLoopPass(1999, 1000, range)).toBe(true);
  });

  it("does not fire on normal forward progress", () => {
    expect(isNewLoopPass(1200, 1250, range)).toBe(false);
  });

  it("does not fire on a forward seek", () => {
    expect(isNewLoopPass(1100, 1900, range)).toBe(false);
  });

  it("does not fire at the very first tick (prev === current)", () => {
    expect(isNewLoopPass(1000, 1000, range)).toBe(false);
  });

  it("does not fire on backward micro-jitter from the middle of the range", () => {
    // prevTick (1400) is in the range but below the upper-half wrap threshold (1500).
    expect(isNewLoopPass(1400, 1398, range)).toBe(false);
  });

  it("does not fire on a backward jump from the back half that lands past the front portion", () => {
    // prevTick is in the back half, but currentTick (1500) lands mid-range —
    // at/after the front-quarter threshold (startTick 1000 + span 1000 * 0.25 = 1250).
    expect(isNewLoopPass(1900, 1500, range)).toBe(false);
  });

  it("fires when a wrap lands tens of ticks past the start (coarse position cadence)", () => {
    // Real wraps rarely report currentTick === startTick; landing ~120 ticks in
    // (well within the front quarter, threshold 1250) must still count.
    expect(isNewLoopPass(1980, 1120, range)).toBe(true);
  });

  it("fires when a wrap lands just inside the front-quarter threshold", () => {
    // currentTick 1249 is < the 1250 front-quarter threshold: still a wrap.
    expect(isNewLoopPass(1990, 1249, range)).toBe(true);
  });

  it("does not fire when currentTick lands exactly at the front-quarter threshold", () => {
    // 1250 is NOT < 1250, so it's treated as mid-range, not a wrap.
    expect(isNewLoopPass(1990, 1250, range)).toBe(false);
  });

  it("fires for a realistic large loop wrap landing hundreds of ticks past the start", () => {
    // 4 bars x 960 ticks -> range [0, 3840]; front-quarter threshold = 960.
    const bigRange: TickRange = { startTick: 0, endTick: 3840 };
    expect(isNewLoopPass(3800, 700, bigRange)).toBe(true); // 700 < 960 -> wrap
    expect(isNewLoopPass(3800, 1500, bigRange)).toBe(false); // 1500 >= 960 -> not a wrap
  });

  it("does not fire for a degenerate range (endTick <= startTick)", () => {
    expect(isNewLoopPass(1999, 1000, { startTick: 1000, endTick: 1000 })).toBe(false);
  });

  it("does not fire for non-finite tick inputs", () => {
    expect(isNewLoopPass(Number.NaN, 1000, range)).toBe(false);
    expect(isNewLoopPass(1999, Number.POSITIVE_INFINITY, range)).toBe(false);
  });

  it("requires prevTick to be at/past the exact back-portion threshold to count as a wrap", () => {
    // Threshold is startTick + span * 0.5 = 1500. Just below it should not fire.
    expect(isNewLoopPass(1499, 1000, range)).toBe(false);
    // At the threshold it should fire.
    expect(isNewLoopPass(1500, 1000, range)).toBe(true);
  });
});

describe("clampTick", () => {
  const range: TickRange = { startTick: 1000, endTick: 2000 };

  it("passes through a value already inside the range", () => {
    expect(clampTick(1500, range)).toBe(1500);
  });

  it("clamps a value below the range start", () => {
    expect(clampTick(500, range)).toBe(1000);
  });

  it("clamps a value above the range end", () => {
    expect(clampTick(2500, range)).toBe(2000);
  });

  it("clamps a non-finite value to the range start", () => {
    expect(clampTick(Number.NaN, range)).toBe(1000);
  });
});
