import { addMinutes, addWeeks, isAfter, isBefore } from "date-fns";
import { z } from "zod";

import { getCurrentCalendarYear, isDateInCalendarYear } from "@/lib/time";

// =============================================================================
// SCHEMA DEFINITIONS - Australian address and booking validation rules
// =============================================================================

/** Valid guitar skill levels for lessons */
export const skillLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
/** Lesson delivery mode - in-person or video call */
export const lessonModeSchema = z.enum(["in_person", "video"]);
/** Standard lesson durations */
export const lessonDurationSchema = z.enum(["min30", "min60"]);
/** Australian states/territories for address validation */
export const auStateSchema = z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"]);

// Australian phone number formats: 10 digits, mobile xxx-xxx-xxx, landline xx-xxxx-xxxx
const isoDateParser = z.string().datetime({ offset: true });
const auPhoneRegex = /^(?:\d{10}|\d{4}-\d{3}-\d{3}|\d{2}-\d{4}-\d{4})$/;
const optionalNumericTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().regex(/^\d{1,5}$/).optional()
);

/** Australian phone number validation - handles mobile and landline formats */
export const auPhoneSchema = z
  .string()
  .trim()
  .regex(auPhoneRegex, "Contact number must be 10 digits, or mobile xxxx-xxx-xxx, or landline xx-xxxx-xxxx.");
/** Australian 4-digit postcode validation */
export const auPostcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Postcode must be exactly 4 digits.");

/** Contact form submission - used for general inquiries */
export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(10).max(2000)
});

// =============================================================================
// BOOKING REQUEST VALIDATION - Complex schema with cross-field validation
// =============================================================================

/**
 * Complete booking request schema with Australian address validation.
 * LOGIC: Validates all fields including address format, lesson preferences,
 * and ensures booking dates are in the future within the current calendar year.
 */
export const bookingRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: auPhoneSchema,
    unitNumber: optionalNumericTextSchema,
    houseNumber: z.string().trim().regex(/^\d{1,5}$/),
    streetName: z.string().trim().min(2).max(120),
    streetType: z.string().trim().min(2).max(40),
    suburb: z.string().trim().min(2).max(80),
    state: auStateSchema,
    postcode: auPostcodeSchema,
    lessonMode: lessonModeSchema,
    skillLevel: skillLevelSchema,
    lessonDuration: lessonDurationSchema,
    customDurationMinutes: z.coerce.number().int().min(15).max(300).optional(),
    requestedStartAt: isoDateParser,
    notes: z.string().trim().max(1000).optional(),
    isRecurring: z.boolean().default(false),
    recurrenceEndAt: isoDateParser.optional()
  })
  .superRefine((data, ctx) => {
    const startAt = new Date(data.requestedStartAt);
    const now = new Date();
    const currentYear = getCurrentCalendarYear(now);

    // SECURITY: Prevent booking dates in the past
    if (!isDateInCalendarYear(startAt, currentYear)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Bookings must be in the current calendar year (${currentYear}).`,
        path: ["requestedStartAt"]
      });
    }

    // LOGIC: Ensure booking is in the future
    if (isBefore(startAt, now)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Requested start must be in the future.",
        path: ["requestedStartAt"]
      });
    }

    // VALIDATION: Custom duration must be whole number
    if (data.customDurationMinutes !== undefined && !Number.isInteger(data.customDurationMinutes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom duration must be a whole number of minutes.",
        path: ["customDurationMinutes"]
      });
    }

    // LOGIC: Recurring booking validation - end date must be after start
    if (data.isRecurring) {
      if (!data.recurrenceEndAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recurrence end date is required for recurring bookings.",
          path: ["recurrenceEndAt"]
        });
        return;
      }

      const end = new Date(data.recurrenceEndAt);
      if (isBefore(end, startAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recurrence end must be after first booking.",
          path: ["recurrenceEndAt"]
        });
      }

      // Ensure recurring bookings stay within calendar year
      if (!isDateInCalendarYear(end, currentYear)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Recurring bookings must end in ${currentYear}.`,
          path: ["recurrenceEndAt"]
        });
      }
    }
  });

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

// =============================================================================
// ADDRESS FORMATTING - UI helper for display
// =============================================================================

/** Formats Australian address for display in UI */
export function formatBookingAddress(input: {
  unitNumber?: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
}): string {
  const unit = input.unitNumber ? `${input.unitNumber}/` : "";
  return `${unit}${input.houseNumber} ${input.streetName} ${input.streetType}, ${input.suburb} ${input.state} ${input.postcode}`;
}

// =============================================================================
// DURATION CALCULATIONS - Business logic for lesson timing
// =============================================================================

/** Converts duration enum to actual minutes for database/storage */
export function getDurationMinutes(
  duration: z.infer<typeof lessonDurationSchema>,
  customDurationMinutes?: number | null
): number {
  if (customDurationMinutes && Number.isFinite(customDurationMinutes) && customDurationMinutes > 0) {
    return Math.round(customDurationMinutes);
  }
  return duration === "min30" ? 30 : 60;
}

/** Calculates lesson end time from start time and duration */
export function getBookingEnd(
  startAt: Date,
  duration: z.infer<typeof lessonDurationSchema>,
  customDurationMinutes?: number | null
): Date {
  return addMinutes(startAt, getDurationMinutes(duration, customDurationMinutes));
}

// =============================================================================
// RECURRING BOOKINGS - Generate weekly booking instances
// =============================================================================

/**
 * Generates all booking dates for a recurring weekly lesson.
 * LOGIC: Creates weekly occurrences from start date until end date (inclusive).
 */
export function generateRecurringStartDates(input: {
  startAt: Date;
  recurrenceEndAt: Date;
  currentYear?: number;
}): Date[] {
  const year = input.currentYear ?? getCurrentCalendarYear();
  if (!isDateInCalendarYear(input.startAt, year) || !isDateInCalendarYear(input.recurrenceEndAt, year)) {
    throw new Error(`Recurring bookings must be in the current year (${year}).`);
  }

  const dates: Date[] = [];
  let current = input.startAt;

  // Generate weekly occurrences until end date
  while (!isAfter(current, input.recurrenceEndAt)) {
    dates.push(current);
    current = addWeeks(current, 1);
  }

  return dates;
}
