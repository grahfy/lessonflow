import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";

import { bookingRequestSchema, generateRecurringStartDates, getBookingEnd } from "@/lib/booking-rules";

function toIso(year: number, month: number, day: number, hour = 10): string {
  const value = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  return value.toISOString().replace("Z", "+00:00");
}

describe("booking-rules", () => {
  it("accepts valid booking input in current year", () => {
    const startDate = addDays(new Date(), 7);
    const endDate = addDays(startDate, 14);
    const start = startDate.toISOString().replace("Z", "+00:00");
    const end = endDate.toISOString().replace("Z", "+00:00");

    const parsed = bookingRequestSchema.safeParse({
      firstName: "Alex",
      lastName: "Student",
      name: "Alex Student",
      email: "alex@example.com",
      phone: "0400-123-456",
      unitNumber: "2",
      houseNumber: "1",
      streetName: "Smith",
      streetType: "St",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      requestedStartAt: start,
      isRecurring: true,
      recurrenceEndAt: end
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects booking date outside current year", () => {
    const now = new Date();
    const year = now.getUTCFullYear() + 1;
    const start = toIso(year, 1, 10, 3);

    const parsed = bookingRequestSchema.safeParse({
      firstName: "Alex",
      lastName: "Student",
      name: "Alex Student",
      email: "alex@example.com",
      phone: "0400-123-456",
      houseNumber: "1",
      streetName: "Smith",
      streetType: "St",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "video",
      skillLevel: "intermediate",
      lessonDuration: "min30",
      requestedStartAt: start,
      isRecurring: false
    });

    expect(parsed.success).toBe(false);
  });

  it("creates weekly recurrence dates", () => {
    const dates = generateRecurringStartDates({
      startAt: new Date("2026-03-02T10:00:00.000Z"),
      recurrenceEndAt: new Date("2026-03-16T10:00:00.000Z"),
      currentYear: 2026
    });

    expect(dates.length).toBe(3);
    expect(dates[1].toISOString()).toBe("2026-03-09T10:00:00.000Z");
  });

  it("computes booking end times from duration", () => {
    const start = new Date("2026-03-01T09:00:00.000Z");
    expect(getBookingEnd(start, "min30").toISOString()).toBe("2026-03-01T09:30:00.000Z");
    expect(getBookingEnd(start, "min60").toISOString()).toBe("2026-03-01T10:00:00.000Z");
  });
});
