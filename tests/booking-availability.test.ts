// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  deriveAvailableSlots,
  type BusinessHoursDay,
  type DeriveSlotsInput,
  type WeeklyBusinessHours
} from "@/lib/booking/availability";
import type { IdentifiedInterval } from "@/lib/booking/overlap";

/**
 * All fixtures are Melbourne wall-clock times written with an explicit UTC
 * offset (+10:00 AEST / +11:00 AEDT), so the assertions stay true regardless of
 * the machine's TZ. 2026-08-12 is a Wednesday (weekday 3) in AEST.
 */
const MELBOURNE = "Australia/Melbourne";

const at = (iso: string) => new Date(iso);
const startsOf = (slots: { startAt: Date }[]) => slots.map((slot) => slot.startAt.toISOString());
const expected = (...isos: string[]) => isos.map((iso) => at(iso).toISOString());

const hours = (openMinute: number, closeMinute: number): BusinessHoursDay => ({
  isOpen: true,
  openMinute,
  closeMinute
});

/** Wednesday only, 09:00–17:00. */
const WED_9_TO_5: WeeklyBusinessHours = { 3: hours(9 * 60, 17 * 60) };

const booked = (id: string, startIso: string, endIso: string): IdentifiedInterval => ({
  id,
  startAt: at(startIso),
  endAt: at(endIso)
});

/** A whole Melbourne Wednesday, with the clock far enough back to disarm notice. */
function baseInput(overrides: Partial<DeriveSlotsInput> = {}): DeriveSlotsInput {
  return {
    rangeStart: at("2026-08-12T00:00:00+10:00"),
    rangeEnd: at("2026-08-13T00:00:00+10:00"),
    businessHours: WED_9_TO_5,
    durationMinutes: 60,
    bookings: [],
    now: at("2026-08-01T00:00:00+10:00"),
    slotMinutes: 30,
    minimumNoticeHours: 24,
    timeZone: MELBOURNE,
    ...overrides
  };
}

describe("deriveAvailableSlots — grid and opening hours", () => {
  it("walks the grid from open, and offers a slot ending exactly at close", () => {
    const slots = deriveAvailableSlots(baseInput());

    expect(slots).toHaveLength(15);
    expect(startsOf(slots).slice(0, 2)).toEqual(
      expected("2026-08-12T09:00:00+10:00", "2026-08-12T09:30:00+10:00")
    );
    expect(slots[slots.length - 1].startAt.toISOString()).toBe(at("2026-08-12T16:00:00+10:00").toISOString());
    expect(slots[slots.length - 1].endAt.toISOString()).toBe(at("2026-08-12T17:00:00+10:00").toISOString());
  });

  it("drops the last slot when it would run one minute past close", () => {
    const slots = deriveAvailableSlots(
      baseInput({ businessHours: { 3: hours(9 * 60, 17 * 60 - 1) } })
    );

    expect(slots).toHaveLength(14);
    expect(slots[slots.length - 1].startAt.toISOString()).toBe(at("2026-08-12T15:30:00+10:00").toISOString());
  });

  it("honours a lesson duration that is not a multiple of the grid (AC-52)", () => {
    const slots = deriveAvailableSlots(baseInput({ durationMinutes: 45 }));

    expect(slots).toHaveLength(15);
    expect(slots[slots.length - 1].startAt.toISOString()).toBe(at("2026-08-12T16:00:00+10:00").toISOString());
    expect(slots[slots.length - 1].endAt.toISOString()).toBe(at("2026-08-12T16:45:00+10:00").toISOString());
  });

  it("offers nothing on a closed weekday", () => {
    expect(deriveAvailableSlots(baseInput({ businessHours: { 3: { ...hours(540, 1020), isOpen: false } } }))).toEqual(
      []
    );
  });

  it("offers nothing on a weekday with no configured hours at all", () => {
    expect(deriveAvailableSlots(baseInput({ businessHours: { 4: hours(540, 1020) } }))).toEqual([]);
  });

  it("offers nothing when the window is too short for the lesson", () => {
    expect(deriveAvailableSlots(baseInput({ businessHours: { 3: hours(540, 570) } }))).toEqual([]);
  });

  it("spans multiple days, skipping the closed ones", () => {
    const slots = deriveAvailableSlots(
      baseInput({
        rangeEnd: at("2026-08-14T00:00:00+10:00"),
        businessHours: { 3: hours(9 * 60, 10 * 60), 4: hours(9 * 60, 10 * 60) },
        slotMinutes: 60
      })
    );

    expect(startsOf(slots)).toEqual(
      expected("2026-08-12T09:00:00+10:00", "2026-08-13T09:00:00+10:00")
    );
  });

  it("filters slot starts into the half-open range", () => {
    const slots = deriveAvailableSlots(
      baseInput({
        rangeStart: at("2026-08-12T10:00:00+10:00"),
        rangeEnd: at("2026-08-12T11:00:00+10:00")
      })
    );

    expect(startsOf(slots)).toEqual(
      expected("2026-08-12T10:00:00+10:00", "2026-08-12T10:30:00+10:00")
    );
  });
});

describe("deriveAvailableSlots — existing bookings (AC-48, AC-50)", () => {
  it("returns the full grid for an empty booking list", () => {
    expect(deriveAvailableSlots(baseInput({ bookings: [] }))).toHaveLength(15);
  });

  it("still offers the slot that starts exactly when a booking ends (back-to-back)", () => {
    const slots = deriveAvailableSlots(
      baseInput({
        durationMinutes: 30,
        bookings: [booked("b1", "2026-08-12T10:00:00+10:00", "2026-08-12T11:00:00+10:00")]
      })
    );
    const starts = startsOf(slots);

    expect(starts).toContain(at("2026-08-12T09:30:00+10:00").toISOString());
    expect(starts).toContain(at("2026-08-12T11:00:00+10:00").toISOString());
    expect(starts).not.toContain(at("2026-08-12T10:00:00+10:00").toISOString());
    expect(starts).not.toContain(at("2026-08-12T10:30:00+10:00").toISOString());
  });

  it("excludes a 60-minute lesson that collides only in its SECOND grid cell", () => {
    const slots = deriveAvailableSlots(
      baseInput({ bookings: [booked("b1", "2026-08-12T10:30:00+10:00", "2026-08-12T11:00:00+10:00")] })
    );
    const starts = startsOf(slots);

    // 09:30 ends exactly when the booking starts, so it survives.
    expect(starts).toContain(at("2026-08-12T09:30:00+10:00").toISOString());
    // 10:00 is free for its first half-hour and collides in its second.
    expect(starts).not.toContain(at("2026-08-12T10:00:00+10:00").toISOString());
    expect(starts).not.toContain(at("2026-08-12T10:30:00+10:00").toISOString());
    expect(starts).toContain(at("2026-08-12T11:00:00+10:00").toISOString());
  });

  it("offers nothing when one booking covers the whole day", () => {
    const slots = deriveAvailableSlots(
      baseInput({ bookings: [booked("all-day", "2026-08-12T08:00:00+10:00", "2026-08-12T18:00:00+10:00")] })
    );

    expect(slots).toEqual([]);
  });

  it("excludes a slot a booking sits entirely inside", () => {
    const slots = deriveAvailableSlots(
      baseInput({ bookings: [booked("short", "2026-08-12T09:15:00+10:00", "2026-08-12T09:30:00+10:00")] })
    );

    expect(startsOf(slots)).not.toContain(at("2026-08-12T09:00:00+10:00").toISOString());
  });

  it("ignores bookings on other days", () => {
    const slots = deriveAvailableSlots(
      baseInput({ bookings: [booked("other", "2026-08-13T10:00:00+10:00", "2026-08-13T11:00:00+10:00")] })
    );

    expect(slots).toHaveLength(15);
  });
});

describe("deriveAvailableSlots — minimum notice (AC-51)", () => {
  it("offers a slot starting exactly on the notice cutoff", () => {
    const slots = deriveAvailableSlots(baseInput({ now: at("2026-08-11T09:00:00+10:00") }));

    expect(slots[0].startAt.toISOString()).toBe(at("2026-08-12T09:00:00+10:00").toISOString());
  });

  it("excludes a slot one millisecond inside the notice window", () => {
    const slots = deriveAvailableSlots(baseInput({ now: at("2026-08-11T09:00:00.001+10:00") }));

    expect(slots[0].startAt.toISOString()).toBe(at("2026-08-12T09:30:00+10:00").toISOString());
  });

  it("offers the whole day when notice is zero", () => {
    const slots = deriveAvailableSlots(
      baseInput({ minimumNoticeHours: 0, now: at("2026-08-12T00:00:00+10:00") })
    );

    expect(slots).toHaveLength(15);
  });

  it("offers nothing when the notice window swallows the range", () => {
    expect(deriveAvailableSlots(baseInput({ now: at("2026-08-12T08:00:00+10:00") }))).toEqual([]);
  });
});

describe("deriveAvailableSlots — Melbourne DST", () => {
  // 2026-10-04 (Sunday): 02:00 → 03:00, so 02:00–02:59 local does not exist.
  it("skips the wall-clock hour that the spring-forward gap deletes", () => {
    const slots = deriveAvailableSlots({
      rangeStart: at("2026-10-04T00:00:00+10:00"),
      rangeEnd: at("2026-10-05T00:00:00+11:00"),
      businessHours: { 0: hours(0, 6 * 60) },
      durationMinutes: 60,
      slotMinutes: 60,
      minimumNoticeHours: 0,
      bookings: [],
      now: at("2026-10-01T00:00:00+10:00"),
      timeZone: MELBOURNE
    });

    expect(startsOf(slots)).toEqual(
      expected(
        "2026-10-04T00:00:00+10:00",
        "2026-10-04T01:00:00+10:00",
        // 02:00 local never happens on this date.
        "2026-10-04T03:00:00+11:00",
        "2026-10-04T04:00:00+11:00",
        "2026-10-04T05:00:00+11:00"
      )
    );
    // A lesson keeps its real 60 minutes across the jump: 01:00 AEST → 03:00 AEDT.
    expect(slots[1].endAt.getTime() - slots[1].startAt.getTime()).toBe(60 * 60_000);
    expect(slots[1].endAt.toISOString()).toBe(at("2026-10-04T03:00:00+11:00").toISOString());
  });

  // 2026-04-05 (Sunday): 03:00 → 02:00, so 02:00–02:59 local happens twice.
  it("emits one distinct, increasing slot per wall-clock hour on the fall-back day", () => {
    const slots = deriveAvailableSlots({
      rangeStart: at("2026-04-05T00:00:00+11:00"),
      rangeEnd: at("2026-04-06T00:00:00+10:00"),
      businessHours: { 0: hours(0, 6 * 60) },
      durationMinutes: 60,
      slotMinutes: 60,
      minimumNoticeHours: 0,
      bookings: [],
      now: at("2026-04-01T00:00:00+11:00"),
      timeZone: MELBOURNE
    });

    const times = slots.map((slot) => slot.startAt.getTime());
    expect(times).toHaveLength(6);
    expect(new Set(times).size).toBe(6);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("deriveAvailableSlots — invalid configuration", () => {
  it("throws on an inverted range", () => {
    expect(() =>
      deriveAvailableSlots(
        baseInput({
          rangeStart: at("2026-08-13T00:00:00+10:00"),
          rangeEnd: at("2026-08-12T00:00:00+10:00")
        })
      )
    ).toThrow(/rangeEnd must not be before rangeStart/i);
  });

  it("throws on a non-positive duration or grid step", () => {
    expect(() => deriveAvailableSlots(baseInput({ durationMinutes: 0 }))).toThrow(/durationMinutes/i);
    expect(() => deriveAvailableSlots(baseInput({ slotMinutes: 0 }))).toThrow(/slotMinutes/i);
  });

  it("throws on a negative notice window and an invalid clock", () => {
    expect(() => deriveAvailableSlots(baseInput({ minimumNoticeHours: -1 }))).toThrow(/minimumNoticeHours/i);
    expect(() => deriveAvailableSlots(baseInput({ now: new Date("nope") }))).toThrow(/now must be a valid Date/i);
  });

  it("returns nothing for an empty range", () => {
    const instant = at("2026-08-12T09:00:00+10:00");
    expect(deriveAvailableSlots(baseInput({ rangeStart: instant, rangeEnd: instant }))).toEqual([]);
  });
});
