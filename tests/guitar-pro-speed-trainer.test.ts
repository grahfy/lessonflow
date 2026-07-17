// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  clampPercent,
  DEFAULT_SPEED_TRAINER_CONFIG,
  initSpeedTrainer,
  onLoopComplete,
  resetSpeedTrainer,
  type SpeedTrainerConfig
} from "@/lib/guitar-pro/speed-trainer";

describe("speed-trainer", () => {
  it("initializes at the default start percent, not the ceiling", () => {
    const state = initSpeedTrainer();
    expect(state).toEqual({ currentPercent: 60, passCount: 0, atCeiling: false });
  });

  it("uses the documented default config (60/10/100)", () => {
    expect(DEFAULT_SPEED_TRAINER_CONFIG).toEqual({
      startPercent: 60,
      stepPercent: 10,
      ceilingPercent: 100
    });
  });

  it("raises currentPercent by stepPercent on a single completed pass", () => {
    const state = onLoopComplete(initSpeedTrainer());
    expect(state.currentPercent).toBe(70);
    expect(state.passCount).toBe(1);
    expect(state.atCeiling).toBe(false);
  });

  it("accumulates across multiple completed passes", () => {
    let state = initSpeedTrainer();
    state = onLoopComplete(state); // 70
    state = onLoopComplete(state); // 80
    state = onLoopComplete(state); // 90
    expect(state.currentPercent).toBe(90);
    expect(state.passCount).toBe(3);
    expect(state.atCeiling).toBe(false);
  });

  it("clamps currentPercent at the ceiling instead of overshooting", () => {
    let state = initSpeedTrainer(); // 60
    for (let i = 0; i < 4; i++) {
      state = onLoopComplete(state); // 70, 80, 90, 100
    }
    expect(state.currentPercent).toBe(100);
    expect(state.atCeiling).toBe(true);
  });

  it("holds at the ceiling on further passes while still counting passes", () => {
    let state = initSpeedTrainer();
    for (let i = 0; i < 4; i++) {
      state = onLoopComplete(state); // reaches 100 on the 4th pass
    }
    const held = onLoopComplete(state); // 5th pass, already at ceiling
    expect(held.currentPercent).toBe(100);
    expect(held.atCeiling).toBe(true);
    expect(held.passCount).toBe(5);

    const heldAgain = onLoopComplete(held); // 6th pass, still at ceiling
    expect(heldAgain.currentPercent).toBe(100);
    expect(heldAgain.passCount).toBe(6);
  });

  it("supports a custom config: start 50, step 25, ceiling 100", () => {
    const config: SpeedTrainerConfig = { startPercent: 50, stepPercent: 25, ceilingPercent: 100 };
    let state = initSpeedTrainer(config);
    expect(state.currentPercent).toBe(50);

    state = onLoopComplete(state, config);
    expect(state.currentPercent).toBe(75);

    state = onLoopComplete(state, config);
    expect(state.currentPercent).toBe(100);
    expect(state.atCeiling).toBe(true);

    state = onLoopComplete(state, config);
    expect(state.currentPercent).toBe(100);
    expect(state.atCeiling).toBe(true);
  });

  it("resetSpeedTrainer returns to the configured start, discarding pass count", () => {
    let state = initSpeedTrainer();
    state = onLoopComplete(state);
    state = onLoopComplete(state);
    expect(state.passCount).toBe(2);

    const reset = resetSpeedTrainer();
    expect(reset).toEqual({ currentPercent: 60, passCount: 0, atCeiling: false });
  });

  it("resetSpeedTrainer honors a custom config", () => {
    const reset = resetSpeedTrainer({ startPercent: 80, stepPercent: 5, ceilingPercent: 100 });
    expect(reset.currentPercent).toBe(80);
    expect(reset.passCount).toBe(0);
  });

  it("clampPercent guards values outside the valid range", () => {
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(75)).toBe(75);
    expect(clampPercent(Number.NaN)).toBe(100);
  });

  it("defensively clamps a bad config: startPercent greater than ceiling", () => {
    const state = initSpeedTrainer({ startPercent: 150, ceilingPercent: 100 });
    // start is pulled down to the ceiling rather than left invalid.
    expect(state.currentPercent).toBe(100);
    expect(state.atCeiling).toBe(true);
  });

  it("defensively falls back to defaults for non-positive stepPercent", () => {
    let state = initSpeedTrainer({ startPercent: 60, stepPercent: 0, ceilingPercent: 100 });
    state = onLoopComplete(state, { startPercent: 60, stepPercent: 0, ceilingPercent: 100 });
    // stepPercent <= 0 falls back to the default step (10), so the pass still advances.
    expect(state.currentPercent).toBe(70);
  });

  it("defensively falls back to defaults for a non-positive or non-finite ceiling", () => {
    const state = initSpeedTrainer({ startPercent: 60, ceilingPercent: -5 });
    expect(state.currentPercent).toBe(60);

    const stateInfinite = initSpeedTrainer({ startPercent: 60, ceilingPercent: Number.POSITIVE_INFINITY });
    // non-finite ceiling is rejected outright and falls back to the default (100),
    // never left unbounded.
    let ramped = stateInfinite;
    for (let i = 0; i < 20; i++) {
      ramped = onLoopComplete(ramped, { startPercent: 60, ceilingPercent: Number.POSITIVE_INFINITY });
    }
    expect(ramped.currentPercent).toBe(100);
  });

  it("clamps a finite but excessive ceilingPercent down to the sane upper bound (200)", () => {
    const config = { startPercent: 60, ceilingPercent: 500 };
    let state = initSpeedTrainer(config);
    for (let i = 0; i < 20; i++) {
      state = onLoopComplete(state, config);
    }
    expect(state.currentPercent).toBe(200);
    expect(state.atCeiling).toBe(true);
  });

  it("does not mutate the input state object", () => {
    const state = initSpeedTrainer();
    const snapshot = { ...state };
    onLoopComplete(state);
    expect(state).toEqual(snapshot);
  });
});
