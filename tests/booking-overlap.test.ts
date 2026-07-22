// @vitest-environment node

import { describe, expect, it } from "vitest";

import { findOverlaps, intervalsOverlap, type IdentifiedInterval } from "@/lib/booking/overlap";

const at = (iso: string) => new Date(iso);

/** Every fixture is a Melbourne wall-clock time written with its explicit offset. */
const booking = (id: string, startIso: string, endIso: string): IdentifiedInterval => ({
  id,
  startAt: at(startIso),
  endAt: at(endIso)
});

const NINE_TO_TEN = booking("nine", "2026-08-12T09:00:00+10:00", "2026-08-12T10:00:00+10:00");
const TEN_TO_ELEVEN = booking("ten", "2026-08-12T10:00:00+10:00", "2026-08-12T11:00:00+10:00");

describe("intervalsOverlap", () => {
  it("detects a partial overlap", () => {
    const straddling = booking("straddle", "2026-08-12T09:30:00+10:00", "2026-08-12T10:30:00+10:00");
    expect(intervalsOverlap(straddling, TEN_TO_ELEVEN)).toBe(true);
    expect(intervalsOverlap(TEN_TO_ELEVEN, straddling)).toBe(true);
  });

  it("treats back-to-back lessons as free (half-open [start, end))", () => {
    expect(intervalsOverlap(NINE_TO_TEN, TEN_TO_ELEVEN)).toBe(false);
    expect(intervalsOverlap(TEN_TO_ELEVEN, NINE_TO_TEN)).toBe(false);
  });

  it("detects identical intervals", () => {
    expect(intervalsOverlap(TEN_TO_ELEVEN, { ...TEN_TO_ELEVEN })).toBe(true);
  });

  it("detects containment in both directions", () => {
    const wide = booking("wide", "2026-08-12T08:00:00+10:00", "2026-08-12T18:00:00+10:00");
    expect(intervalsOverlap(wide, TEN_TO_ELEVEN)).toBe(true);
    expect(intervalsOverlap(TEN_TO_ELEVEN, wide)).toBe(true);
  });

  it("returns false for disjoint intervals", () => {
    const later = booking("later", "2026-08-12T14:00:00+10:00", "2026-08-12T15:00:00+10:00");
    expect(intervalsOverlap(NINE_TO_TEN, later)).toBe(false);
  });

  it("never overlaps a zero-length interval, even one inside another", () => {
    const instant = booking("instant", "2026-08-12T10:30:00+10:00", "2026-08-12T10:30:00+10:00");
    expect(intervalsOverlap(instant, TEN_TO_ELEVEN)).toBe(false);
    expect(intervalsOverlap(TEN_TO_ELEVEN, instant)).toBe(false);
    expect(intervalsOverlap(instant, { ...instant })).toBe(false);
  });

  it("counts a one-millisecond sliver of shared time as an overlap", () => {
    const sliver = booking("sliver", "2026-08-12T09:59:59.999+10:00", "2026-08-12T10:30:00+10:00");
    expect(intervalsOverlap(sliver, NINE_TO_TEN)).toBe(true);
  });

  it("throws on an inverted interval rather than normalising it", () => {
    const inverted = booking("inverted", "2026-08-12T11:00:00+10:00", "2026-08-12T10:00:00+10:00");
    expect(() => intervalsOverlap(inverted, TEN_TO_ELEVEN)).toThrow(/inverted/i);
    expect(() => intervalsOverlap(TEN_TO_ELEVEN, inverted)).toThrow(/inverted/i);
  });

  it("throws on an invalid Date", () => {
    const broken = { startAt: new Date("not-a-date"), endAt: at("2026-08-12T10:00:00+10:00") };
    expect(() => intervalsOverlap(broken, TEN_TO_ELEVEN)).toThrow(/valid startAt\/endAt/i);
  });
});

describe("findOverlaps", () => {
  const existing = [
    NINE_TO_TEN,
    TEN_TO_ELEVEN,
    booking("two", "2026-08-12T14:00:00+10:00", "2026-08-12T15:00:00+10:00")
  ];

  it("returns the conflicting booking so the owner can be told which one", () => {
    const candidate = {
      startAt: at("2026-08-12T10:30:00+10:00"),
      endAt: at("2026-08-12T11:30:00+10:00")
    };
    expect(findOverlaps(candidate, existing).map((item) => item.id)).toEqual(["ten"]);
  });

  it("returns every conflict when a long candidate spans several bookings", () => {
    const candidate = {
      startAt: at("2026-08-12T09:30:00+10:00"),
      endAt: at("2026-08-12T14:30:00+10:00")
    };
    expect(findOverlaps(candidate, existing).map((item) => item.id)).toEqual(["nine", "ten", "two"]);
  });

  it("returns an empty array when the candidate slots in back-to-back", () => {
    const candidate = {
      startAt: at("2026-08-12T11:00:00+10:00"),
      endAt: at("2026-08-12T12:00:00+10:00")
    };
    expect(findOverlaps(candidate, existing)).toEqual([]);
  });

  it("returns an empty array against an empty booking list", () => {
    expect(findOverlaps(TEN_TO_ELEVEN, [])).toEqual([]);
  });

  it("throws on a corrupt existing row instead of silently skipping it", () => {
    const corrupt = booking("corrupt", "2026-08-12T12:00:00+10:00", "2026-08-12T11:00:00+10:00");
    expect(() => findOverlaps(TEN_TO_ELEVEN, [corrupt])).toThrow(/inverted/i);
  });
});
