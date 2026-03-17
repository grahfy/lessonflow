/**
 * Booking Validation & Domain Rules Engine
 * 
 * This module acts as the "Source of Truth" for all business logic surrounding 
 * scheduling, address integrity, and lesson parameters.
 * 
 * CORE RESPONSIBILITIES:
 * 1. Schema Definition: Centralized Zod schemas for public and admin data entry.
 * 2. Cross-Field Validation: Logic that ensures bookings are in the future, 
 *    within the correct year, and geographically valid (e.g., VIC-only for in-person).
 * 3. Duration Math: Converting UI duration tokens (min30/min60) into 
 *    discrete temporal intervals for DB storage.
 * 4. Recurring Logic: Algorithmic generation of weekly booking series.
 * 
 * RATIONALE: By centralizing these rules in a single library, we keep the
 * Public Booking Form, Admin Manual Booking, and Background Workers aligned on
 * shared validation while still making explicit, auditable exceptions where
 * business policy differs.
 */

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
/** Country restriction for public lesson bookings */
export const bookingCountrySchema = z.literal("Australia");

// Australian phone number formats: 10 digits, mobile xxx-xxx-xxx, landline xx-xxxx-xxxx
const isoDateParser = z.string().datetime({ offset: true });
const auPhoneRegex = /^(?:\d{10}|\d{4}-\d{3}-\d{3}|\d{2}-\d{4}-\d{4})$/;

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

const bookingRequestFields = z.object({
  // Split name for better customer matching logic
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  // name is kept for backward compatibility with the database schema
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: auPhoneSchema,
  // Country is defaulted to Australia but allowed to be empty
  country: z.string().trim().optional().default("Australia"),
  // Address fields are now optional to support simplified booking flow
  unitNumber: z.string().trim().optional().nullable(),
  houseNumber: z.string().trim().optional().default(""),
  streetName: z.string().trim().optional().default(""),
  streetType: z.string().trim().optional().default(""),
  suburb: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default("VIC"),
  // Postcode remains mandatory for matching and service eligibility
  postcode: auPostcodeSchema,
  lessonMode: lessonModeSchema,
  skillLevel: skillLevelSchema,
  lessonDuration: lessonDurationSchema,
  customDurationMinutes: z.coerce.number().int().min(15).max(300).optional(),
  requestedStartAt: isoDateParser,
  notes: z.string().trim().max(1000).optional(),
  isRecurring: z.boolean().default(false),
  recurrenceEndAt: isoDateParser.optional()
});

function createBookingRequestSchema(options?: { allowHistoricalSingleBookings?: boolean }) {
  return bookingRequestFields.superRefine((data, ctx) => {
    const startAt = new Date(data.requestedStartAt);
    const now = new Date();
    const currentYear = getCurrentCalendarYear();
    // NOTE: No lower-bound date limit is enforced — admins may backfill single bookings for any past date.
    // Recurring entries still require the standard current-year and future-only rules.
    const allowHistoricalSingleBookings =
      options?.allowHistoricalSingleBookings === true && !data.isRecurring && isBefore(startAt, now);

    if (!allowHistoricalSingleBookings) {
      // SECURITY: Prevent booking dates in the past or far future outside the business cycle.
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

    // BUSINESS RULE: In-person lessons are currently offered only in Victoria.
    // If state is empty/defaulted to VIC, this passes.
    if (data.lessonMode === "in_person" && data.state && data.state !== "VIC") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "In-person lessons are currently available in Victoria (VIC) only.",
        path: ["state"]
      });
    }
  });
}

/**
 * Complete public booking request schema with simplified address validation.
 *
 * LOGIC: Validates core identification fields (Name, Email, Phone, Postcode).
 * RATIONALE: Address fields (street, house number, etc.) have been moved out of the
 * public UI to reduce friction. They are kept in the schema as optional/empty strings
 * to maintain backward compatibility with existing database rows and admin views.
 */
export const bookingRequestSchema = createBookingRequestSchema();

/**
 * Admin-only manual booking schema.
 *
 * RATIONALE: Admins may backfill one-off historical bookings for record keeping,
 * but recurring entries still follow the normal current-year and future-only rules.
 * 
 * NOTE: This bypass only applies to past dates (isBefore check). Future single bookings
 * that fall outside the current calendar year are still rejected by the normal year guard.
 */
export const adminManualBookingSchema = createBookingRequestSchema({
  allowHistoricalSingleBookings: true
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

// =============================================================================
// ADDRESS FORMATTING - UI helper for display
// =============================================================================

/** 
 * Formats Australian address for display in UI.
 * 
 * LOGIC: Handles missing components by filtering out empty strings and joining with 
 * sensible delimiters. If only postcode exists, returns that.
 */
export function formatBookingAddress(input: {
  unitNumber?: string | null;
  houseNumber?: string | null;
  streetName?: string | null;
  streetType?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode: string;
}): string {
  const unit = input.unitNumber ? `${input.unitNumber}/` : "";
  const street = [input.houseNumber, input.streetName, input.streetType]
    .filter(Boolean)
    .join(" ");
  
  const region = [input.suburb, input.state, input.postcode]
    .filter(Boolean)
    .join(" ");

  if (!street && !input.suburb && !input.state) {
    return input.postcode;
  }

  const parts = [];
  if (unit || street) parts.push(`${unit}${street}`);
  if (region) parts.push(region);

  return parts.join(", ");
}

// =============================================================================
// DURATION CALCULATIONS - Business logic for lesson timing
// =============================================================================

/**
 * Normalizes UI duration tokens into raw minute counts.
 * RATIONALE: We allow 'Custom' durations in the Admin panel which override 
 * the standard enum choices.
 */
export function getDurationMinutes(
  duration: z.infer<typeof lessonDurationSchema>,
  customDurationMinutes?: number | null
): number {
  if (customDurationMinutes && Number.isFinite(customDurationMinutes) && customDurationMinutes > 0) {
    return Math.round(customDurationMinutes);
  }
  return duration === "min30" ? 30 : 60;
}

/** 
 * Calculates lesson end time. 
 * RATIONALE: Explicitly calculated on the server to ensure No-overlap constraints 
 * aren't bypassed by client-side clock drift.
 */
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
 * 
 * LOGIC: Creates weekly occurrences from start date until end date (inclusive).
 * RATIONALE: We generate discrete dates here so that the DB can store them 
 * as individual 'Booking' records, allowing per-lesson notes and manual 
 * rescheduling of specific weeks.
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
