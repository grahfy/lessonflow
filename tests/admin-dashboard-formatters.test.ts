import { describe, expect, it } from "vitest";

import { formatTime, formatWeekdayTime } from "@/app/admin/dashboard/formatters";

/**
 * Regression guard for an Intl.DateTimeFormat options bug.
 *
 * The dashboard week list previously combined `timeStyle: "short"` with the
 * component option `weekday: "short"`. Mixing dateStyle/timeStyle with
 * individual component fields (weekday/hour/minute) throws a RangeError
 * ("Invalid option") at render time, which 500'd /admin/dashboard. These tests
 * exercise the formatters with a real Date so any future return to that illegal
 * options shape fails fast in unit tests instead of silently 500ing in prod.
 */
describe("admin dashboard date formatters", () => {
  const sample = new Date("2026-06-16T05:00:00.000Z");

  it("formatTime returns a non-empty string without throwing", () => {
    expect(() => formatTime(sample)).not.toThrow();
    expect(typeof formatTime(sample)).toBe("string");
    expect(formatTime(sample).length).toBeGreaterThan(0);
  });

  it("formatWeekdayTime returns a non-empty string without throwing", () => {
    expect(() => formatWeekdayTime(sample)).not.toThrow();
    const result = formatWeekdayTime(sample);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // The "Mon 3:00 pm" shape includes a weekday abbreviation and a time.
    expect(result).toMatch(/[A-Za-z]/);
    expect(result).toMatch(/\d/);
  });
});
