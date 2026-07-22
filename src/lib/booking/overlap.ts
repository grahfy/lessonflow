/**
 * Booking overlap detection (student booking tab — AC-56, AC-57, AC-58, AC-59).
 *
 * Pure interval math over `{ startAt, endAt }` pairs. DELIBERATELY has no
 * Prisma import and no database access: callers load the candidate and the
 * teacher's existing bookings, hand them here as plain data, and act on the
 * returned conflicts (e.g. report the conflicting booking's id to the owner).
 *
 * SEMANTICS: intervals are HALF-OPEN — `[startAt, endAt)`. A lesson ending at
 * 10:00 and one starting at 10:00 therefore do NOT conflict; back-to-back
 * lessons are legal, which is the whole point of the boundary rule.
 *
 * ZERO-LENGTH intervals (`endAt === startAt`) are empty under half-open
 * semantics and so never overlap anything, including each other.
 *
 * INVERTED intervals (`endAt < startAt`) THROW rather than being normalised:
 * a backwards booking is a programming error upstream (bad duration math, a
 * swapped argument), and silently sorting the ends would let a corrupt row
 * pass a conflict check it should have failed. Fail loud, fail closed.
 * Invalid `Date`s (`NaN` time) throw for the same reason.
 */

/** Minimal structural view of anything with a start and an end instant. */
export interface Interval {
  startAt: Date;
  endAt: Date;
}

/** An interval the caller can identify afterwards — e.g. a `Booking` row. */
export interface IdentifiedInterval extends Interval {
  id: string;
}

function toMillis(interval: Interval, label: string): { start: number; end: number } {
  const start = interval.startAt?.getTime?.();
  const end = interval.endAt?.getTime?.();

  if (typeof start !== "number" || typeof end !== "number" || Number.isNaN(start) || Number.isNaN(end)) {
    throw new RangeError(`${label} must have valid startAt/endAt Dates.`);
  }
  if (end < start) {
    throw new RangeError(
      `${label} is inverted: endAt (${interval.endAt.toISOString()}) is before startAt (${interval.startAt.toISOString()}).`
    );
  }

  return { start, end };
}

/**
 * True when two half-open intervals share at least one instant.
 *
 * Touching endpoints (`a.endAt === b.startAt`) are NOT an overlap. Either
 * interval being zero-length is NOT an overlap.
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  const first = toMillis(a, "First interval");
  const second = toMillis(b, "Second interval");

  // Half-open intersection is non-empty iff the latest start precedes the
  // earliest end. This form (unlike `a.start < b.end && b.start < a.end`) also
  // gets zero-length intervals right: an empty interval nested inside another
  // yields `max === min` and correctly reports no overlap.
  return Math.max(first.start, second.start) < Math.min(first.end, second.end);
}

/**
 * Returns every existing interval that overlaps `candidate`, in the order
 * given. Empty array means the candidate is free.
 *
 * The caller gets the whole conflicting record back (not just a boolean) so it
 * can name the clashing booking in the error it shows the owner (AC-57).
 *
 * Callers are responsible for pre-filtering the list — e.g. excluding
 * cancelled bookings and the booking being rescheduled.
 */
export function findOverlaps<T extends IdentifiedInterval>(
  candidate: Interval,
  existing: readonly T[]
): T[] {
  toMillis(candidate, "Candidate interval");

  return existing.filter((item) => intervalsOverlap(candidate, item));
}
