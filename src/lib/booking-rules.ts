import { addMinutes, addWeeks, isAfter, isBefore } from "date-fns";
import { z } from "zod";

import { getCurrentCalendarYear, isDateInCalendarYear } from "@/lib/time";

export const skillLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const lessonModeSchema = z.enum(["in_person", "video"]);
export const lessonDurationSchema = z.enum(["min30", "min60"]);

const isoDateParser = z.string().datetime({ offset: true });

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
    phone: z.string().trim().min(6).max(40),
    address: z.string().trim().min(5).max(250),
    lessonMode: lessonModeSchema,
    skillLevel: skillLevelSchema,
    lessonDuration: lessonDurationSchema,
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

export function getDurationMinutes(duration: z.infer<typeof lessonDurationSchema>): number {
  return duration === "min30" ? 30 : 60;
}

export function getBookingEnd(startAt: Date, duration: z.infer<typeof lessonDurationSchema>): Date {
  return addMinutes(startAt, getDurationMinutes(duration));
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
