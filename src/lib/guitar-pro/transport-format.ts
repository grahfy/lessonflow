/**
 * Playback transport formatting (Guitar Pro Phase B.2, Component 4 — transport bar).
 *
 * Pure, framework-free formatters that turn raw alphaTab position-event
 * milliseconds into the human-readable strings/fractions the transport bar
 * displays: a "1:12 / 3:40" clock readout and a 0..1 progress-bar fraction.
 * Also converts between the alphaTab `playbackSpeed` multiplier (1.0) and the
 * integer percent shown/edited in the UI (100).
 *
 * DELIBERATELY has no dependency on React, alphaTab, or the DOM: it is called
 * from the (separately owned) transport bar component and is unit-testable
 * here in isolation from any of that.
 *
 * LOGIC: minutes are NOT wrapped into hours. A track over an hour long simply
 * shows minutes past 59 (e.g. 3,661,000ms → "61:01") rather than "1:01:01".
 * No existing repo convention for an hours segment was found, and guitar
 * practice material is essentially never over an hour, so the simpler
 * "m:ss" format (matching `formatTime`'s documented contract) was kept
 * rather than introducing an "h:mm:ss" branch for an edge case that doesn't
 * occur in practice.
 */

/**
 * Formats a millisecond duration as "m:ss" (minutes not zero-padded, seconds
 * zero-padded to 2 digits). Negative and non-finite input is clamped to 0.
 * Fractional milliseconds are floored to whole seconds.
 */
export function formatTime(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Formats a "current / total" clock readout, e.g. "1:12 / 3:40". A
 * non-finite or non-positive `totalMs` (score not yet loaded) falls back to
 * "0:00" on both sides rather than showing a misleading duration.
 */
export function formatClock(currentMs: number, totalMs: number): string {
  const safeTotal = Number.isFinite(totalMs) && totalMs > 0 ? totalMs : 0;
  return `${formatTime(currentMs)} / ${formatTime(safeTotal)}`;
}

/**
 * Computes a progress-bar fraction in `[0, 1]` from current/total
 * milliseconds. A non-finite or non-positive `totalMs` returns 0 (nothing to
 * show progress against); the result is always clamped even if `currentMs`
 * overshoots `totalMs` slightly (e.g. due to timer drift).
 */
export function progressFraction(currentMs: number, totalMs: number): number {
  if (!Number.isFinite(totalMs) || totalMs <= 0 || !Number.isFinite(currentMs)) {
    return 0;
  }
  return Math.min(Math.max(currentMs / totalMs, 0), 1);
}

/**
 * Converts an alphaTab `playbackSpeed` multiplier (e.g. 1.0) to the integer
 * percent shown in the UI (e.g. 100). Rounds to the nearest whole percent.
 * Non-finite input falls back to 100 (normal speed).
 */
export function speedToPercent(speed: number): number {
  const safeSpeed = Number.isFinite(speed) ? speed : 1;
  return Math.round(safeSpeed * 100);
}

/**
 * Converts an integer UI percent (e.g. 100) back to the alphaTab
 * `playbackSpeed` multiplier (e.g. 1.0). Non-finite input falls back to 1
 * (normal speed).
 */
export function percentToSpeed(percent: number): number {
  const safePercent = Number.isFinite(percent) ? percent : 100;
  return safePercent / 100;
}
