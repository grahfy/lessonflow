import { describe, expect, it } from "vitest";

import { ownerDailyDigestTemplate, ownerPendingBookingTemplate } from "@/lib/email/templates";

describe("email-templates", () => {
  it("renders pending booking owner template", () => {
    const template = ownerPendingBookingTemplate({
      name: "Alex",
      email: "alex@example.com",
      phone: "0400000000",
      address: "66 High St",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      requestedStartAt: new Date("2026-07-01T10:00:00.000Z"),
      isRecurring: false,
      recurrenceEndAt: null
    });
    expect(template.subject).toContain("New booking request");
    expect(template.html).toContain("Alex");
  });

  it("renders daily digest with fallback content", () => {
    const template = ownerDailyDigestTemplate({
      date: new Date("2026-07-01T00:00:00.000Z"),
      rows: []
    });
    expect(template.subject).toContain("Daily bookings digest");
    expect(template.html).toContain("No bookings for today");
  });
});
