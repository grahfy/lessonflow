import { addMinutes, addWeeks, isAfter, isBefore } from "date-fns";
import { z } from "zod";

import { getCurrentCalendarYear, isDateInCalendarYear } from "@/lib/time";

export const skillLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const lessonModeSchema = z.enum(["in_person", "video"]);
export const lessonDurationSchema = z.enum(["min30", "min60"]);
export const auStateSchema = z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"]);

const isoDateParser = z.string().datetime({ offset: true });
const auPhoneRegex = /^(?:\d{10}|\d{4}-\d{3}-\d{3}|\d{2}-\d{4}-\d{4})$/;
const optionalNumericTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().regex(/^\d{1,5}$/).optional()
);

export const auPhoneSchema = z
  .string()
  .trim()
  .regex(auPhoneRegex, "Contact number must be 10 digits, or mobile xxxx-xxx-xxx, or landline xx-xxxx-xxxx.");
export const auPostcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Postcode must be exactly 4 digits.");

export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(10).max(2000)
});

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

    if (!isDateInCalendarYear(startAt, currentYear)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Bookings must be in the current calendar year (${currentYear}).`,
        path: ["requestedStartAt"]
      });
    }

    if (isBefore(startAt, now)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Requested start must be in the future.",
        path: ["requestedStartAt"]
      });
    }

    if (data.customDurationMinutes !== undefined && !Number.isInteger(data.customDurationMinutes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom duration must be a whole number of minutes.",
        path: ["customDurationMinutes"]
      });
    }

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

export function getDurationMinutes(
  duration: z.infer<typeof lessonDurationSchema>,
  customDurationMinutes?: number | null
): number {
  if (customDurationMinutes && Number.isFinite(customDurationMinutes) && customDurationMinutes > 0) {
    return Math.round(customDurationMinutes);
  }
  return duration === "min30" ? 30 : 60;
}

export function getBookingEnd(
  startAt: Date,
  duration: z.infer<typeof lessonDurationSchema>,
  customDurationMinutes?: number | null
): Date {
  return addMinutes(startAt, getDurationMinutes(duration, customDurationMinutes));
}

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

  while (!isAfter(current, input.recurrenceEndAt)) {
    dates.push(current);
    current = addWeeks(current, 1);
  }

  return dates;
}
