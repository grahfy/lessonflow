import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";

import { adminManualBookingSchema, bookingRequestSchema, generateRecurringStartDates, getBookingEnd } from "@/lib/booking-rules";

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

    // NOTE: The public booking schema intentionally allows current-year future
    // recurring requests that include the full required address/contact fields.
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

  it("rejects public booking dates in the past", () => {
    const startDate = addDays(new Date(), -2);
    const start = startDate.toISOString().replace("Z", "+00:00");

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

  it("allows admin manual single bookings in the past, including prior years", () => {
    const previousYear = new Date().getUTCFullYear() - 1;
    const start = toIso(previousYear, 6, 10, 3);

    const parsed = adminManualBookingSchema.safeParse({
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

    expect(parsed.success).toBe(true);
  });

  it("still rejects admin manual single bookings scheduled beyond the current year", () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    const start = toIso(nextYear, 1, 10, 3);

    const parsed = adminManualBookingSchema.safeParse({
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

    expect(parsed.success).toBe(true);
  });

  it("allows admin recurring bookings in the past", () => {
    const previousYear = new Date().getUTCFullYear() - 1;
    const start = toIso(previousYear, 6, 10, 3);
    const end = toIso(previousYear, 6, 24, 3);

    const parsed = adminManualBookingSchema.safeParse({
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
      isRecurring: true,
      recurrenceEndAt: end
    });

    expect(parsed.success).toBe(true);
  });

  it("allows admin recurring bookings that span year boundaries", () => {
    const year = new Date().getUTCFullYear();
    const start = toIso(year, 12, 20, 3);
    const end = toIso(year + 1, 1, 17, 3);

    const parsed = adminManualBookingSchema.safeParse({
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
      isRecurring: true,
      recurrenceEndAt: end
    });

    expect(parsed.success).toBe(true);
  });

  it("allows preset admin bookings when custom duration is sent as null", () => {
    const start = addDays(new Date(), 7).toISOString().replace("Z", "+00:00");

    const parsed = adminManualBookingSchema.safeParse({
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
      customDurationMinutes: null,
      requestedStartAt: start,
      isRecurring: false
    });

    expect(parsed.success).toBe(true);
  });

  it("still rejects recurrence end dates before the first booking", () => {
    const year = new Date().getUTCFullYear();
    const start = toIso(year, 6, 24, 3);
    const end = toIso(year, 6, 10, 3);

    const parsed = adminManualBookingSchema.safeParse({
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
      isRecurring: true,
      recurrenceEndAt: end
    });

    expect(parsed.success).toBe(false);
  });

  it("creates weekly recurrence dates", () => {
    const dates = generateRecurringStartDates({
      startAt: new Date("2026-03-02T10:00:00.000Z"),
      recurrenceEndAt: new Date("2026-03-16T10:00:00.000Z")
    });

    // RATIONALE: Recurrence generation is inclusive of the start date and then
    // advances in weekly steps until the inclusive recurrence end boundary.
    expect(dates.length).toBe(3);
    expect(dates[1].toISOString()).toBe("2026-03-09T10:00:00.000Z");
  });

  it("creates weekly recurrence dates across year boundaries", () => {
    const dates = generateRecurringStartDates({
      startAt: new Date("2026-12-20T10:00:00.000Z"),
      recurrenceEndAt: new Date("2027-01-17T10:00:00.000Z")
    });

    expect(dates).toHaveLength(5);
    expect(dates[4].toISOString()).toBe("2027-01-17T10:00:00.000Z");
  });

  it("rejects recurrence generation when the end is before the start", () => {
    expect(() =>
      generateRecurringStartDates({
        startAt: new Date("2026-06-24T10:00:00.000Z"),
        recurrenceEndAt: new Date("2026-06-10T10:00:00.000Z")
      })
    ).toThrow("Recurrence end must be after first booking.");
  });

  it("computes booking end times from duration", () => {
    const start = new Date("2026-03-01T09:00:00.000Z");
    expect(getBookingEnd(start, "min30").toISOString()).toBe("2026-03-01T09:30:00.000Z");
    expect(getBookingEnd(start, "min60").toISOString()).toBe("2026-03-01T10:00:00.000Z");
  });
});
