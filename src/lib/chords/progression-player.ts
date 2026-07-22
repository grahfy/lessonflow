/**
 * Chord progression playback scheduling (student-chord-browser, AC-8/AC-9/AC-10).
 *
 * Pure, framework-free helpers for turning a `ChordChart`'s ordered items
 * into a playback schedule: per-item start time and duration in seconds, at
 * a caller-supplied tempo and bars-per-chord. `ChordChartItem` has no tempo
 * or duration column — and none is being added (AC-9) — so tempo and
 * bars-per-chord are purely client-side player controls passed in here.
 *
 * DELIBERATELY has no dependency on React, Tone.js, the DOM, `Date`, or
 * `Math.random()`: the (separately owned) React component adapts a real
 * `ChordChart`'s items into a plain array, feeds it through here, and drives
 * the existing chord-preview playback path from the resulting schedule.
 *
 * Loop-range and speed-ramp semantics deliberately mirror
 * `guitar-pro/loop-range.ts` and `guitar-pro/speed-trainer.ts`: same
 * inclusive-bounds/clamp/swap conventions and the same "hold at ceiling,
 * never overshoot" ramp behavior, reimplemented rather than imported because
 * those modules' exports are typed around ticks/percent-of-master-tempo, a
 * different unit domain than item-index ranges and absolute BPM.
 */

/** Default tempo used when an invalid (non-finite/non-positive) BPM is supplied. */
export const DEFAULT_TEMPO_BPM = 120;

/** Default beats per bar (4/4 time), used when none/invalid is supplied. */
export const DEFAULT_BEATS_PER_BAR = 4;

/** Default bars held per chord, used when none/invalid is supplied. */
export const DEFAULT_BARS_PER_CHORD = 1;

/** Default number of completed loop passes to hold at each speed-ramp step. */
export const DEFAULT_HOLD_PASSES = 1;

/** Returns `value` if finite and > 0, otherwise `fallback`. */
function resolvePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback;
}

/** Minimal timing shape a scheduled chord carries — what `chordRangeToLoopTime` reads. */
export interface ChordTiming {
  startTime: number;
  duration: number;
}

/** A progression item annotated with its computed playback timing. */
export interface ScheduledChordItem<T> extends ChordTiming {
  item: T;
  index: number;
}

export interface ChordProgressionScheduleConfig {
  /** Playback tempo in BPM. Non-finite/non-positive falls back to `DEFAULT_TEMPO_BPM`. */
  bpm: number;
  /** Beats per bar (time signature numerator). Default `DEFAULT_BEATS_PER_BAR`. */
  beatsPerBar?: number;
  /** Bars held per chord before advancing to the next item. Default `DEFAULT_BARS_PER_CHORD`. */
  barsPerChord?: number;
}

/**
 * Builds a playback schedule for an ordered set of chord progression items:
 * each item gets a start time and duration in seconds, back-to-back with no
 * gaps, in the order given.
 *
 * LOGIC:
 * - Empty/missing `items` returns `[]` (a valid "no chart" result, not an
 *   error — mirrors how an empty progression simply has nothing to play).
 * - `bpm`, `beatsPerBar`, `barsPerChord` are each guarded independently: a
 *   non-finite or non-positive value falls back to its documented default
 *   rather than propagating `NaN`/`Infinity` or an inverted/zero-length
 *   schedule.
 * - Every item gets the same duration: `barsPerChord * beatsPerBar * (60 / bpm)`
 *   seconds. Item `i` starts at `i * duration`, so the schedule's total span
 *   is `items.length * duration` — exactly `items x bars x beats x (60/bpm)`.
 */
export function buildChordProgressionSchedule<T>(
  items: readonly T[],
  config: ChordProgressionScheduleConfig
): ScheduledChordItem<T>[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const bpm = resolvePositive(config.bpm, DEFAULT_TEMPO_BPM);
  const beatsPerBar = resolvePositive(config.beatsPerBar, DEFAULT_BEATS_PER_BAR);
  const barsPerChord = resolvePositive(config.barsPerChord, DEFAULT_BARS_PER_CHORD);

  const duration = (60 / bpm) * beatsPerBar * barsPerChord;

  return items.map((item, index) => ({
    item,
    index,
    startTime: index * duration,
    duration
  }));
}

/** A time range (in seconds) to loop playback within, e.g. `{ startTime: 0, endTime: 4 }`. */
export interface ChordLoopTimeRange {
  startTime: number;
  endTime: number;
}

/**
 * Builds a time range spanning progression items `[startItemIndex..endItemIndex]`
 * inclusive, from an already-built schedule.
 *
 * LOGIC (mirrors `barRangeToTicks`'s conventions exactly, in seconds instead
 * of ticks):
 * - Returns `null` if `schedule` is missing or empty — there is no valid range.
 * - Indices are clamped into `[0, schedule.length - 1]`; non-finite indices
 *   fall back to `0` before clamping.
 * - If `startItemIndex > endItemIndex` (after clamping) the pair is swapped
 *   so the caller doesn't have to pre-sort.
 * - `endTime = schedule[endIndex].startTime + schedule[endIndex].duration`.
 */
export function chordRangeToLoopTime(
  schedule: readonly ChordTiming[],
  startItemIndex: number,
  endItemIndex: number
): ChordLoopTimeRange | null {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return null;
  }

  const lastIndex = schedule.length - 1;
  const clampIndex = (index: number): number => {
    const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
    return Math.min(Math.max(safe, 0), lastIndex);
  };

  let start = clampIndex(startItemIndex);
  let end = clampIndex(endItemIndex);
  if (start > end) {
    [start, end] = [end, start];
  }

  return {
    startTime: schedule[start].startTime,
    endTime: schedule[end].startTime + schedule[end].duration
  };
}

export interface ChordSpeedRampConfig {
  /** Starting tempo, in BPM. Non-finite/non-positive falls back to `DEFAULT_TEMPO_BPM`. */
  startBpm: number;
  /** Target (ceiling) tempo, in BPM. The ramp never exceeds this. */
  targetBpm: number;
  /** BPM added per step once `holdPasses` passes have elapsed at the current tempo. */
  incrementBpm: number;
  /** Completed loop passes to hold at each tempo before stepping up. Default `DEFAULT_HOLD_PASSES`. */
  holdPasses?: number;
}

/**
 * Returns the tempo (BPM) that should play during loop pass `passIndex`
 * (0-based) of a gradual speed-up ramp.
 *
 * LOGIC (mirrors `speed-trainer.ts`'s "hold at ceiling" behavior):
 * - Every `holdPasses` completed passes, tempo steps up by `incrementBpm`.
 * - `tempo = min(startBpm + floor(passIndex / holdPasses) * incrementBpm, targetBpm)`
 *   — never overshoots `targetBpm`, and holds there on further passes.
 * - `incrementBpm <= 0` or `targetBpm <= startBpm` mean there is nowhere to
 *   ramp to, so every pass plays at `startBpm` rather than stepping
 *   backwards or running away.
 * - Non-finite/non-positive `holdPasses` falls back to holding for 1 pass.
 * - Non-finite or negative `passIndex` is treated as pass 0.
 */
export function tempoForLoopPass(config: ChordSpeedRampConfig, passIndex: number): number {
  const startBpm = resolvePositive(config.startBpm, DEFAULT_TEMPO_BPM);
  const targetBpm = resolvePositive(config.targetBpm, startBpm);
  const incrementBpm = resolvePositive(config.incrementBpm, 0);
  const holdPasses = resolvePositive(config.holdPasses, DEFAULT_HOLD_PASSES);

  if (incrementBpm === 0 || targetBpm <= startBpm) {
    return startBpm;
  }

  const safePassIndex = Number.isFinite(passIndex) && passIndex > 0 ? Math.trunc(passIndex) : 0;
  const stepsCompleted = Math.floor(safePassIndex / holdPasses);

  return Math.min(startBpm + stepsCompleted * incrementBpm, targetBpm);
}
