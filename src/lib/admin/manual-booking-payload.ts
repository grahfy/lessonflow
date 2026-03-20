import { dateTimeLocalToIso } from "@/lib/time";
import { durationMinutesToBookingPayload } from "@/lib/lesson-duration-utils";

export type ManualMatchResolution = "use_existing" | "create_new" | "update_existing";

interface BuildManualBookingPayloadOptions {
  manualCustomerId: string;
  matchResolution?: ManualMatchResolution;
  updateCustomerFromBooking: boolean;
}

type BuildManualBookingPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

function toIsoString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return dateTimeLocalToIso(value);
}

/**
 * Builds and validates the admin manual-booking payload from form data.
 * Converts local datetime inputs to ISO strings and normalizes custom duration handling.
 */
export function buildManualBookingPayload(
  formData: FormData,
  options: BuildManualBookingPayloadOptions
): BuildManualBookingPayloadResult {
  const payload = Object.fromEntries(formData.entries()) as Record<string, unknown>;

  payload.name = `${String(payload.firstName || "").trim()} ${String(payload.lastName || "").trim()}`.trim();
  payload.customerId = options.manualCustomerId || undefined;
  payload.assignedTeacherId = String(payload.assignedTeacherId || "").trim() || null;
  payload.matchResolution = options.matchResolution;
  payload.updateCustomerFromBooking = options.updateCustomerFromBooking;
  payload.isRecurring = formData.get("isRecurring") === "on";

  const requestedStartAt = toIsoString(formData.get("requestedStartAt"));
  if (!requestedStartAt) {
    return { ok: false, error: "Please enter a valid start date and time." };
  }
  payload.requestedStartAt = requestedStartAt;

  const recurrenceEndAt = toIsoString(formData.get("recurrenceEndAt"));
  if (recurrenceEndAt) {
    payload.recurrenceEndAt = recurrenceEndAt;
  } else {
    delete payload.recurrenceEndAt;
  }

  if (payload.isRecurring && !payload.recurrenceEndAt) {
    return { ok: false, error: "Recurrence end date is required when recurring is enabled." };
  }

  const rawDurationChoice = String(payload.lessonDuration || "").trim();
  if (rawDurationChoice === "custom") {
    const rawCustomMinutes = String(payload.customDurationMinutes || "").trim();
    if (!rawCustomMinutes) {
      return { ok: false, error: "Enter custom duration minutes when using custom duration." };
    }

    const customDurationMinutes = Number(rawCustomMinutes);
    if (!Number.isInteger(customDurationMinutes) || customDurationMinutes < 15 || customDurationMinutes > 300) {
      return { ok: false, error: "Custom duration must be a whole number between 15 and 300 minutes." };
    }

    payload.lessonDuration = "min60";
    payload.customDurationMinutes = customDurationMinutes;
  } else if (rawDurationChoice === "min30" || rawDurationChoice === "min60") {
    delete payload.customDurationMinutes;
  } else {
    const durationMinutes = Number(rawDurationChoice);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 300) {
      return { ok: false, error: "Select a configured lesson duration." };
    }

    const normalizedDuration = durationMinutesToBookingPayload(durationMinutes);
    payload.lessonDuration = normalizedDuration.lessonDuration;
    payload.customDurationMinutes = normalizedDuration.customDurationMinutes;
  }

  return { ok: true, payload };
}
