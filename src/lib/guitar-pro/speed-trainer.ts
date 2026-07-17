/**
 * Speed-trainer ramp logic (Guitar Pro Phase B.2, Component 4 — Practice looper).
 *
 * Pure, framework-free state machine for the "auto-ramp" practice mode: the
 * student loops a bar range starting below full tempo, and each completed
 * loop pass nudges playback speed up by a fixed step until it reaches (and
 * then holds at) the ceiling — normally 100% of the score's master tempo.
 *
 * DELIBERATELY has no dependency on React, alphaTab, the DOM, `Date`, or
 * `Math.random()`: it is called from the (separately owned) React component
 * that wires it to real loop-complete events, and is unit-testable here in
 * isolation from any of that.
 *
 * LOGIC: "hold at ceiling" behavior — once `currentPercent` reaches
 * `ceilingPercent`, further `onLoopComplete` calls do NOT increase the
 * percent any further (idempotent), but DO keep incrementing `passCount`.
 * This matches AC-13 ("capped at 100%, then holds") while still giving the
 * UI an honest, ever-increasing pass count for a student who keeps looping
 * at full speed.
 */

/** Configurable parameters for a speed-trainer session. */
export interface SpeedTrainerConfig {
  /** Starting playback speed, as a percentage of master tempo. Default 60. */
  startPercent: number;
  /** Percentage points added to `currentPercent` per completed loop pass. Default 10. */
  stepPercent: number;
  /** Maximum playback speed, as a percentage of master tempo. Default 100. */
  ceilingPercent: number;
}

/** Current, mutable-in-spirit (but always returned as a new object) trainer state. */
export interface SpeedTrainerState {
  /** Current playback speed, as a percentage of master tempo. */
  currentPercent: number;
  /** Number of loop passes completed since the last init/reset. */
  passCount: number;
  /** True once `currentPercent` has reached `ceilingPercent`. */
  atCeiling: boolean;
}

/** Default config: start at 60%, step by 10 points, cap at 100%. */
export const DEFAULT_SPEED_TRAINER_CONFIG: SpeedTrainerConfig = {
  startPercent: 60,
  stepPercent: 10,
  ceilingPercent: 100
};

/**
 * Defensively normalizes a partial/untrusted config into a safe, internally
 * consistent `SpeedTrainerConfig`.
 *
 * LOGIC:
 * - `ceilingPercent` must be > 0; clamped to a sane upper bound (200) so a
 *   bad UI input can't produce a runaway multiplier.
 * - `stepPercent` must be > 0 (a zero/negative step would never reach the
 *   ceiling, or would run it backwards) — falls back to the default step.
 * - `startPercent` must be within (0, ceilingPercent]; if it exceeds the
 *   (possibly clamped) ceiling, it is pulled down to the ceiling so the
 *   trainer never starts "past" its own cap.
 */
function normalizeConfig(config?: Partial<SpeedTrainerConfig>): SpeedTrainerConfig {
  const merged = { ...DEFAULT_SPEED_TRAINER_CONFIG, ...config };

  const ceilingPercent =
    Number.isFinite(merged.ceilingPercent) && merged.ceilingPercent > 0
      ? Math.min(merged.ceilingPercent, 200)
      : DEFAULT_SPEED_TRAINER_CONFIG.ceilingPercent;

  const stepPercent =
    Number.isFinite(merged.stepPercent) && merged.stepPercent > 0
      ? merged.stepPercent
      : DEFAULT_SPEED_TRAINER_CONFIG.stepPercent;

  const rawStart =
    Number.isFinite(merged.startPercent) && merged.startPercent > 0
      ? merged.startPercent
      : DEFAULT_SPEED_TRAINER_CONFIG.startPercent;
  const startPercent = Math.min(rawStart, ceilingPercent);

  return { startPercent, stepPercent, ceilingPercent };
}

/**
 * Clamps a raw percent value into the valid `(0, ceilingPercent]` range for
 * the given (already-normalized-or-not) config. Used both internally and
 * exported as a standalone guard helper.
 */
export function clampPercent(value: number, config?: Partial<SpeedTrainerConfig>): number {
  const { ceilingPercent } = normalizeConfig(config);
  if (!Number.isFinite(value)) {
    return ceilingPercent;
  }
  return Math.min(Math.max(value, 0), ceilingPercent);
}

/**
 * Creates a fresh trainer state at `startPercent` (NOT the ceiling) with
 * `passCount` at zero. `atCeiling` is only true if a degenerate config makes
 * `startPercent` equal to `ceilingPercent` (e.g. step/ceiling misconfigured
 * so start had to be clamped down to the ceiling).
 */
export function initSpeedTrainer(config?: Partial<SpeedTrainerConfig>): SpeedTrainerState {
  const normalized = normalizeConfig(config);
  return {
    currentPercent: normalized.startPercent,
    passCount: 0,
    atCeiling: normalized.startPercent >= normalized.ceilingPercent
  };
}

/**
 * Advances the trainer by one completed loop pass: raises `currentPercent`
 * by `stepPercent` (clamped to `ceilingPercent`) and increments `passCount`.
 *
 * Once already `atCeiling`, `currentPercent` no longer changes (idempotent),
 * but `passCount` still increments — see the module-level LOGIC note for why.
 */
export function onLoopComplete(state: SpeedTrainerState, config?: Partial<SpeedTrainerConfig>): SpeedTrainerState {
  const normalized = normalizeConfig(config);
  const nextPercent = clampPercent(state.currentPercent + normalized.stepPercent, normalized);

  return {
    currentPercent: nextPercent,
    passCount: state.passCount + 1,
    atCeiling: nextPercent >= normalized.ceilingPercent
  };
}

/** Resets the trainer back to its starting state, discarding pass count. */
export function resetSpeedTrainer(config?: Partial<SpeedTrainerConfig>): SpeedTrainerState {
  return initSpeedTrainer(config);
}
