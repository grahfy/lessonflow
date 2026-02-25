import { describe, expect, it } from "vitest";

import {
  customerBookingStatusTemplate,
  customerBookingMovedTemplate,
  customerBookingReminderTemplate,
  customerInvoiceReminderTemplate,
  customerInvoiceTemplate,
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

  it("includes Melbourne Guitar School branded signature details", () => {
    const template = customerBookingReminderTemplate({
      name: "Alex",
      when: new Date("2026-07-03T10:00:00.000Z")
    });

    expect(template.html).toContain("Melbourne Guitar School");
    expect(template.html).toContain("mgs-logo.png");
    expect(template.html).toContain("Call or text:");
    expect(template.html).toContain("Email:");
    expect(template.html).toContain("Studio:");
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

  it("includes portal access details for first-time approved bookings", () => {
    const template = customerBookingStatusTemplate({
      name: "Alex",
      status: "approved",
      when: new Date("2026-07-03T10:00:00.000Z"),
      portalAccess: {
        loginUrl: "https://example.com/student/login",
        generatedPassword: "TempPass123!"
      }
    });

    expect(template.html).toContain("student/login");
    expect(template.html).toContain("TempPass123!");
    expect(template.html).toContain("Student portal access");
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

  it("renders invoice template with amount and invoice number", () => {
    const invoice = customerInvoiceTemplate({
      invoiceNumber: "MGS-2026-0001",
      customerName: "Alex",
      dueAt: new Date("2026-08-10T00:00:00.000Z"),
      totalCents: 12345,
      sellerBusinessName: "Melbourne Guitar School"
    });

    expect(invoice.subject).toContain("MGS-2026-0001");
    expect(invoice.html).toContain("Alex");
    expect(invoice.html).toContain("$123.45");
  });

  it("renders invoice reminder template with overdue days", () => {
    const reminder = customerInvoiceReminderTemplate({
      invoiceNumber: "MGS-2026-0002",
      customerName: "Alex",
      dueAt: new Date("2026-08-10T00:00:00.000Z"),
      totalCents: 12345,
      sellerBusinessName: "Melbourne Guitar School",
      overdueDays: 14
    });

    expect(reminder.subject).toContain("overdue");
    expect(reminder.html).toContain("14 day");
    expect(reminder.html).toContain("MGS-2026-0002");
  });
});
