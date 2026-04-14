import { describe, expect, it } from "vitest";

import {
  sanitizeBookingEditPayload,
  type BookingDialogForm
} from "@/components/admin/bookings/types";

function baseForm(overrides: Partial<BookingDialogForm> = {}): BookingDialogForm {
  return {
    notes: "",
    notesContent: null,
    linkedCustomerId: "",
    startAtLocal: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    unitNumber: "",
    houseNumber: "",
    streetName: "",
    streetType: "",
    suburb: "",
    state: "",
    postcode: "",
    lessonMode: "",
    skillLevel: "",
    assignedTeacherId: "",
    durationChoice: "",
    customDurationMinutes: "",
    ...overrides
  };
}

describe("sanitizeBookingEditPayload", () => {
  it("drops empty optional strings so zod optional fields are not exercised", () => {
    const payload = sanitizeBookingEditPayload(baseForm());

    // unitNumber is nullable in editSchema, so "" normalizes to null (not omitted).
    expect(payload).toEqual({ unitNumber: null, notesContent: null });
  });

  it("passes through trimmed non-empty values", () => {
    const payload = sanitizeBookingEditPayload(
      baseForm({
        firstName: "  Ada  ",
        email: "ada@example.com ",
        phone: "0400111222",
        houseNumber: "12",
        streetName: "Main",
        streetType: "Rd",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        unitNumber: "  2B ",
        notes: "  bring notebook  ",
        lessonMode: "in_person",
        skillLevel: "beginner"
      })
    );

    expect(payload).toMatchObject({
      firstName: "Ada",
      email: "ada@example.com",
      phone: "0400111222",
      houseNumber: "12",
      streetName: "Main",
      streetType: "Rd",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      unitNumber: "2B",
      notes: "bring notebook",
      lessonMode: "in_person",
      skillLevel: "beginner"
    });
  });

  it("omits durationChoice, startAtLocal, linkedCustomerId, customDurationMinutes", () => {
    const payload = sanitizeBookingEditPayload(
      baseForm({
        firstName: "Grace",
        durationChoice: "45",
        startAtLocal: "2026-06-01T09:00",
        linkedCustomerId: "cust_123",
        customDurationMinutes: "45"
      })
    );

    expect(payload).not.toHaveProperty("durationChoice");
    expect(payload).not.toHaveProperty("startAtLocal");
    expect(payload).not.toHaveProperty("linkedCustomerId");
    expect(payload).not.toHaveProperty("customDurationMinutes");
    expect(payload.firstName).toBe("Grace");
  });

  it("forwards notesContent JSON unchanged", () => {
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    const payload = sanitizeBookingEditPayload(baseForm({ notesContent: content }));
    expect(payload.notesContent).toBe(content);
  });
});
