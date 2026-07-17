/**
 * Loop-range + loop-pass-detection logic (Guitar Pro Phase B.2 — Speed trainer
 * loop wiring).
 *
 * Pure, framework-free helpers for turning a bar range into an alphaTab-style
 * tick range, and for detecting when a looping playback has just wrapped
 * from the end of that range back to its start (a "pass").
 *
 * DELIBERATELY has no dependency on React, alphaTab, the DOM, `Date`, or
 * `Math.random()`: the (separately owned) React component adapts real
 * alphaTab `tickCache`/`masterBars` data into the minimal `BarTiming` shape
 * this module reads, and reacts to `isNewLoopPass` by bumping the speed
 * trainer (see `speed-trainer.ts`).
 */

/** A tick range, e.g. an alphaTab `PlaybackRange` (`{ startTick, endTick }`). */
export interface TickRange {
  startTick: number;
  endTick: number;
}

/**
 * Minimal structural view of what the component reads from alphaTab's
 * `tickCache`/`masterBars` for a single bar, so this module never imports
 * alphaTab. The component is responsible for adapting real alphaTab objects
 * into this shape.
 */
export interface BarTiming {
  startTick: number;
  durationTicks: number;
}

/**
 * Fraction of the loop range (measured from its start) that `prevTick` must
 * have reached before a backward jump can be considered a genuine wrap
 * rather than an unrelated backward seek/jitter inside the range. A wrap
 * only makes musical sense if playback had actually progressed into the back
 * portion of the loop before snapping back toward the start.
 */
const WRAP_BACK_PORTION_FRACTION = 0.5;

/**
 * Fraction of the loop range (measured from its start) that `currentTick`
 * must land WITHIN for a backward jump to count as a wrap to the start.
 *
 * WHY A FRONT-PORTION RULE (not a tight tick epsilon): alphaTab fires
 * `playerPositionChanged` on a coarse scheduling cadence, so the first tick
 * reported AFTER a loop wraps is rarely `startTick` exactly — it commonly
 * lands tens or even hundreds of ticks past the start (however far playback
 * advanced between the wrap and the next event). A 2-tick window would miss
 * almost every real wrap and the speed trainer would never ramp. Requiring
 * only that `currentTick` land inside the FRONT quarter of the range (while
 * `prevTick` was in the back half and motion was backward) reliably catches
 * the wrap while still rejecting mid-range backward jitter/seeks, because the
 * front quarter and back half never overlap.
 */
const WRAP_FRONT_PORTION_FRACTION = 0.25;

/**
 * Builds a tick range spanning bars `[startBarIndex..endBarIndex]` inclusive
 * from an ordered, zero-indexed bar-timing list.
 *
 * LOGIC:
 * - Returns `null` if `bars` is missing or empty — there is no valid range.
 * - Indices are clamped into `[0, bars.length - 1]`; non-finite indices
 *   (`NaN`, `Infinity`) fall back to `0` before clamping so a bad caller
 *   input can't propagate `NaN` into the result.
 * - If `startBarIndex > endBarIndex` (after clamping) the pair is swapped so
 *   the caller doesn't have to pre-sort.
 * - `endTick = bars[endBar].startTick + bars[endBar].durationTicks`. A
 *   non-finite or non-positive `durationTicks` on the end bar is treated as
 *   `0` rather than corrupting the result with `NaN`/a shrinking range.
 * - Returns `null` if either bar's `startTick` is non-finite, or if the
 *   computed `endTick` would end up before `startTick`.
 */
export function barRangeToTicks(
  bars: BarTiming[],
  startBarIndex: number,
  endBarIndex: number
): TickRange | null {
  if (!Array.isArray(bars) || bars.length === 0) {
    return null;
  }

  const lastIndex = bars.length - 1;
  const clampIndex = (index: number): number => {
    const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
    return Math.min(Math.max(safe, 0), lastIndex);
  };

  let start = clampIndex(startBarIndex);
  let end = clampIndex(endBarIndex);
  if (start > end) {
    [start, end] = [end, start];
  }

  const startBar = bars[start];
  const endBar = bars[end];

  if (!Number.isFinite(startBar.startTick) || !Number.isFinite(endBar.startTick)) {
    return null;
  }

  const endBarDuration =
    Number.isFinite(endBar.durationTicks) && endBar.durationTicks > 0 ? endBar.durationTicks : 0;

  const startTick = startBar.startTick;
  const endTick = endBar.startTick + endBarDuration;

  if (endTick < startTick) {
    return null;
  }

  return { startTick, endTick };
}

/**
 * Detects whether a looping playback has just started a new pass: i.e.
 * `currentTick` wrapped backward from near the end of `range` to at/near
 * `range.startTick`.
 *
 * LOGIC (the exact wrap rule):
 * A pass is detected only when ALL of the following hold:
 * 1. `prevTick > currentTick` — playback moved backward. Forward progress
 *    (including a forward seek, where `prevTick < currentTick`) never fires.
 * 2. `prevTick >= range.startTick + span * WRAP_BACK_PORTION_FRACTION` — the
 *    previous position was in the back portion (default: back half) of the
 *    loop range, so the backward jump is musically consistent with "reached
 *    the end and wrapped," not an arbitrary backward seek or jitter from
 *    somewhere in the middle of the range.
 * 3. `currentTick < range.startTick + span * WRAP_FRONT_PORTION_FRACTION` —
 *    the new position landed inside the FRONT portion (default: front
 *    quarter) of the range. This tolerates the coarse position-event cadence:
 *    the first tick reported after a wrap may sit tens/hundreds of ticks past
 *    the start, yet still counts, while a backward jump that lands mid-range
 *    (past the front quarter) does not.
 *
 * The front quarter (rule 3) and back half (rule 2) never overlap, so a
 * single backward event can't satisfy both from an interior position. This
 * also naturally returns `false` at the very first tick of playback
 * (`prevTick === currentTick`, failing rule 1).
 *
 * Returns `false` (rather than throwing) for non-finite inputs or a
 * degenerate/empty range (`range.endTick <= range.startTick`).
 */
export function isNewLoopPass(prevTick: number, currentTick: number, range: TickRange): boolean {
  if (!Number.isFinite(prevTick) || !Number.isFinite(currentTick)) {
    return false;
  }
  if (!Number.isFinite(range.startTick) || !Number.isFinite(range.endTick)) {
    return false;
  }

  const rangeSpan = range.endTick - range.startTick;
  if (rangeSpan <= 0) {
    return false;
  }

  if (prevTick <= currentTick) {
    return false;
  }

  const backPortionThreshold = range.startTick + rangeSpan * WRAP_BACK_PORTION_FRACTION;
  if (prevTick < backPortionThreshold) {
    return false;
  }

  const frontPortionThreshold = range.startTick + rangeSpan * WRAP_FRONT_PORTION_FRACTION;
  if (currentTick >= frontPortionThreshold) {
    return false;
  }

  return true;
}

/** Clamps `tick` into `[range.startTick, range.endTick]`. Non-finite input clamps to `range.startTick`. */
export function clampTick(tick: number, range: TickRange): number {
  if (!Number.isFinite(tick)) {
    return range.startTick;
  }
  return Math.min(Math.max(tick, range.startTick), range.endTick);
}
