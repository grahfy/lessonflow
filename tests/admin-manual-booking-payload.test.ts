import { describe, expect, it } from "vitest";

import { buildManualBookingPayload } from "@/lib/admin/manual-booking-payload";

function baseFormData() {
  const formData = new FormData();
  formData.set("firstName", "Taylor");
  formData.set("lastName", "Student");
  formData.set("email", "taylor@example.com");
  formData.set("phone", "0400123456");
  formData.set("houseNumber", "66");
  formData.set("streetName", "High");
  formData.set("streetType", "Street");
  formData.set("suburb", "Northcote");
  formData.set("state", "VIC");
  formData.set("postcode", "3070");
  formData.set("lessonMode", "video");
  formData.set("skillLevel", "intermediate");
  formData.set("lessonDuration", "min60");
  formData.set("requestedStartAt", "2026-04-10T10:00");
  return formData;
}

describe("buildManualBookingPayload", () => {
  it("builds a valid non-recurring payload", () => {
    const formData = baseFormData();

    const result = buildManualBookingPayload(formData, {
      manualCustomerId: "",
      updateCustomerFromBooking: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.isRecurring).toBe(false);
    expect(result.payload.recurrenceEndAt).toBeUndefined();
    expect(result.payload.name).toBe("Taylor Student");
  });

  it("requires recurrence end when recurring is enabled", () => {
    const formData = baseFormData();
    formData.set("isRecurring", "on");

    const result = buildManualBookingPayload(formData, {
      manualCustomerId: "",
      updateCustomerFromBooking: true
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Recurrence end date is required");
  });

  it("includes recurrence end when recurring is enabled", () => {
    const formData = baseFormData();
    formData.set("isRecurring", "on");
    formData.set("recurrenceEndAt", "2026-05-10T10:00");

    const result = buildManualBookingPayload(formData, {
      manualCustomerId: "",
      updateCustomerFromBooking: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.isRecurring).toBe(true);
    expect(typeof result.payload.recurrenceEndAt).toBe("string");
  });

  it("maps custom duration to API-compatible payload", () => {
    const formData = baseFormData();
    formData.set("lessonDuration", "custom");
    formData.set("customDurationMinutes", "45");

    const result = buildManualBookingPayload(formData, {
      manualCustomerId: "",
      updateCustomerFromBooking: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.lessonDuration).toBe("min60");
    expect(result.payload.customDurationMinutes).toBe(45);
  });

  it("requires custom minutes when custom duration is selected", () => {
    const formData = baseFormData();
    formData.set("lessonDuration", "custom");

    const result = buildManualBookingPayload(formData, {
      manualCustomerId: "",
      updateCustomerFromBooking: true
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("custom duration minutes");
  });
});
