import { describe, expect, it } from "vitest";

import {
  customerBookingMovedTemplate,
  customerBookingReminderTemplate,
  customerCustomMessageTemplate,
  ownerDailyDigestTemplate,
  ownerPendingBookingTemplate
} from "@/lib/email/templates";

describe("email-templates", () => {
  it("renders pending booking owner template", () => {
    const template = ownerPendingBookingTemplate({
      name: "Alex",
      email: "alex@example.com",
      phone: "0400-000-000",
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

  it("renders reminder and moved templates", () => {
    const reminder = customerBookingReminderTemplate({
      name: "Alex",
      when: new Date("2026-07-03T10:00:00.000Z")
    });
    const moved = customerBookingMovedTemplate({
      name: "Alex",
      oldWhen: new Date("2026-07-03T09:00:00.000Z"),
      newWhen: new Date("2026-07-03T10:00:00.000Z")
    });

    expect(reminder.subject).toContain("reminder");
    expect(moved.subject).toContain("updated");
  });

  it("escapes custom template content", () => {
    const custom = customerCustomMessageTemplate({
      name: "Alex",
      subject: "<Test>",
      message: "Line 1\nLine <2>"
    });

    expect(custom.html).toContain("&lt;Test&gt;");
    expect(custom.html).toContain("Line &lt;2&gt;");
  });
});
