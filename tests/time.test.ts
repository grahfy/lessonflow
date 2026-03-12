import { describe, expect, it } from "vitest";

import { dateTimeLocalToIso, toDateKey, toDateTimeLocalValue, toTimeKey } from "@/lib/time";

describe("time helpers", () => {
  it("formats UTC instants for app-timezone datetime-local inputs", () => {
    expect(toDateTimeLocalValue("2026-01-15T01:00:00.000Z")).toBe("2026-01-15T12:00");
    expect(toDateTimeLocalValue("2026-06-15T02:00:00.000Z")).toBe("2026-06-15T12:00");
  });

  it("converts app-timezone datetime-local values back to UTC", () => {
    expect(dateTimeLocalToIso("2026-01-15T12:00")).toBe("2026-01-15T01:00:00.000Z");
    expect(dateTimeLocalToIso("2026-06-15T12:00")).toBe("2026-06-15T02:00:00.000Z");
  });

  it("rejects impossible DST-gap local times", () => {
    expect(dateTimeLocalToIso("2026-10-04T02:30")).toBeNull();
  });

  it("derives app-timezone date and time keys from UTC instants", () => {
    expect(toDateKey("2026-01-15T13:30:00.000Z")).toBe("2026-01-16");
    expect(toTimeKey("2026-01-15T01:00:00.000Z")).toBe("12:00");
  });
});
