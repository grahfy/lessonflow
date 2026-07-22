/**
 * Derived lesson availability (student booking tab — AC-48, AC-50, AC-51, AC-52).
 *
 * Available = configured business hours MINUS that teacher's existing
 * non-cancelled bookings. There is no availability model and none is coming,
 * so this module derives candidate slots from a weekly open/close definition
 * and a list of already-booked intervals.
 *
 * PURE by construction: no Prisma import, no database access, and no ambient
 * clock — `now` is a required parameter so tests can pin it. Callers load the
 * teacher's bookings and the owner-configured hours and pass them in.
 *
 * TIMEZONE — the decision, because it is load-bearing:
 * `Booking.startAt` / `endAt` are stored as UTC instants (see
 * `prisma/schema.prisma`), while business hours are wall-clock minutes the
 * owner types in ("we open at 9"). Those minutes are therefore interpreted in
 * the SCHOOL's timezone — `APP_TIMEZONE` from `@/lib/time`
 * (`Australia/Melbourne` unless `NEXT_PUBLIC_TIMEZONE` overrides it) — never
 * in the server's local timezone, which is UTC in production. The `timeZone`
 * option exists only so tests can pin it; production should leave it default.
 * Wall-clock → instant conversion reuses `dateTimeLocalToDate`, the same
 * helper the booking form and the recurring-series generator already use.
 *
 * DST consequences (Melbourne switches on the first Sundays of April/October):
 * - The "slot fits inside the open window" check is WALL-CLOCK: a 09:00 slot
 *   is 09:00 to the owner whichever side of a transition it falls on.
 * - The slot's real length is exact: `endAt = startAt + durationMinutes` as
 *   instants, so a lesson is always the minutes the customer paid for even if
 *   the local clock jumps mid-lesson.
 * - Wall-clock times that do not exist (the spring-forward gap, e.g. 02:30)
 *   yield no slot: `dateTimeLocalToDate` returns null and the slot is skipped.
 */

import { addMinutes } from "date-fns";

import { APP_TIMEZONE, dateTimeLocalToDate, toDateKey } from "@/lib/time";

import { findOverlaps, type IdentifiedInterval, type Interval } from "./overlap";

/** JS weekday numbering, matching `Date#getDay`: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One weekday's opening rule. Minutes are wall-clock minutes from midnight. */
export interface BusinessHoursDay {
  isOpen: boolean;
  openMinute: number;
  closeMinute: number;
}

/** Weekly opening rules. A weekday with no entry is treated as closed. */
export type WeeklyBusinessHours = Partial<Record<Weekday, BusinessHoursDay>>;

/** A bookable slot, as UTC instants. */
export interface AvailabilitySlot {
  startAt: Date;
  endAt: Date;
}

export interface DeriveSlotsInput {
  /** Search window, half-open `[rangeStart, rangeEnd)`, matched on slot start. */
  rangeStart: Date;
  rangeEnd: Date;
  businessHours: WeeklyBusinessHours;
  /** Requested lesson length. Independent of the slot grid. */
  durationMinutes: number;
  /** Existing non-cancelled bookings for this teacher. Caller pre-filters. */
  bookings: readonly IdentifiedInterval[];
  /** Injected clock — never read the ambient one here. */
  now: Date;
  /** Slot grid step in minutes. Default 30. */
  slotMinutes?: number;
  /** Minimum lead time before a slot may be booked. Default 24. */
  minimumNoticeHours?: number;
  /** Wall-clock timezone for the business hours. Default `APP_TIMEZONE`. */
  timeZone?: string;
}

const MINUTES_PER_DAY = 24 * 60;

function requireValidDate(value: Date, label: string): number {
  const time = value?.getTime?.();
  if (typeof time !== "number" || Number.isNaN(time)) {
    throw new RangeError(`${label} must be a valid Date.`);
  }
  return time;
}

function requirePositiveInt(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive number of minutes, got ${value}.`);
  }
  return Math.round(value);
}

/** `1234-05-06` → the civil weekday of that date. No timezone involved. */
function weekdayOfDateKey(dateKey: string): Weekday {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

/** Advances a `YYYY-MM-DD` key by one civil day. */
function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return (
    `${String(next.getUTCFullYear()).padStart(4, "0")}-` +
    `${String(next.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(next.getUTCDate()).padStart(2, "0")}`
  );
}

function toLocalValue(dateKey: string, minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Derives the candidate slots a student may request.
 *
 * RULES:
 * - Closed weekdays (or weekdays absent from `businessHours`) produce nothing.
 * - Slot starts walk the grid from `openMinute` in `slotMinutes` steps. The
 *   grid and the lesson length are independent: a 60-minute lesson on a
 *   30-minute grid spans two grid cells and is dropped if EITHER cell collides,
 *   because the collision test uses the full `[start, start + duration)` span.
 * - A slot must fit entirely inside the open window: a slot ending exactly at
 *   `closeMinute` is offered, one minute past is not.
 * - AC-50: any overlap with an existing booking excludes the slot. Overlap is
 *   half-open, so a slot starting exactly when a booking ends is still offered.
 * - AC-51: a slot starting before `now + minimumNoticeHours` is excluded; a
 *   slot starting exactly ON the cutoff is offered.
 * - Slots are filtered on their START into the half-open `[rangeStart, rangeEnd)`
 *   window; a slot may therefore end after `rangeEnd`.
 *
 * THROWS on invalid dates, an inverted range, or a non-positive duration/grid
 * step — all programming errors, not user input.
 */
export function deriveAvailableSlots(input: DeriveSlotsInput): AvailabilitySlot[] {
  const rangeStartMs = requireValidDate(input.rangeStart, "rangeStart");
  const rangeEndMs = requireValidDate(input.rangeEnd, "rangeEnd");
  const nowMs = requireValidDate(input.now, "now");

  if (rangeEndMs < rangeStartMs) {
    throw new RangeError("rangeEnd must not be before rangeStart.");
  }

  const durationMinutes = requirePositiveInt(input.durationMinutes, "durationMinutes");
  const slotMinutes = requirePositiveInt(input.slotMinutes ?? 30, "slotMinutes");
  const minimumNoticeHours = input.minimumNoticeHours ?? 24;
  if (!Number.isFinite(minimumNoticeHours) || minimumNoticeHours < 0) {
    throw new RangeError(`minimumNoticeHours must be zero or greater, got ${minimumNoticeHours}.`);
  }

  const timeZone = input.timeZone ?? APP_TIMEZONE;
  const noticeCutoffMs = nowMs + minimumNoticeHours * 60 * 60_000;
  const slots: AvailabilitySlot[] = [];

  const lastDateKey = toDateKey(input.rangeEnd, timeZone);
  let dateKey = toDateKey(input.rangeStart, timeZone);

  while (dateKey <= lastDateKey) {
    const hours = input.businessHours[weekdayOfDateKey(dateKey)];
    if (!hours?.isOpen) {
      dateKey = nextDateKey(dateKey);
      continue;
    }

    const openMinute = Math.max(0, Math.round(hours.openMinute));
    const closeMinute = Math.min(MINUTES_PER_DAY, Math.round(hours.closeMinute));

    for (
      let minuteOfDay = openMinute;
      minuteOfDay + durationMinutes <= closeMinute;
      minuteOfDay += slotMinutes
    ) {
      // Wall-clock times that don't exist locally (DST spring-forward gap)
      // resolve to null and simply aren't offered.
      const startAt = dateTimeLocalToDate(toLocalValue(dateKey, minuteOfDay), timeZone);
      if (!startAt) {
        continue;
      }

      const startMs = startAt.getTime();
      if (startMs < rangeStartMs || startMs >= rangeEndMs) {
        continue;
      }
      if (startMs < noticeCutoffMs) {
        continue;
      }

      const candidate: Interval = { startAt, endAt: addMinutes(startAt, durationMinutes) };
      if (findOverlaps(candidate, input.bookings).length > 0) {
        continue;
      }

      slots.push(candidate);
    }

    dateKey = nextDateKey(dateKey);
  }

  return slots;
}
