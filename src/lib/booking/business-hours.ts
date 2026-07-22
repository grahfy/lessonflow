/**
 * Owner-configured business hours (AC-49), stored as a singleton row.
 *
 * `BusinessHours.weekdays` is a Json column, so it is validated with zod on
 * read rather than trusted. Anything unparseable (or a missing row) falls back
 * to the defaults below: the availability page showing default hours is a far
 * better failure than a 500, and the owner overwrites it on first save.
 *
 * The array is indexed 0..6 = Sunday..Saturday, matching `Date#getDay` and the
 * `Weekday` type in `./availability`.
 */

import { z } from "zod";

import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/observability";

import type { BusinessHoursDay, WeeklyBusinessHours } from "./availability";

/** The singleton row's fixed primary key. */
export const BUSINESS_HOURS_ID = "default";

const MINUTES_PER_DAY = 24 * 60;

const daySchema = z
  .object({
    isOpen: z.boolean(),
    openMinute: z.number().int().min(0).max(MINUTES_PER_DAY),
    closeMinute: z.number().int().min(0).max(MINUTES_PER_DAY)
  })
  .refine((day) => !day.isOpen || day.closeMinute > day.openMinute, {
    message: "closeMinute must be after openMinute on an open day."
  });

const weekdaysSchema = z.array(daySchema).length(7);

export const businessHoursInputSchema = z.object({
  weekdays: weekdaysSchema,
  slotGranularityMinutes: z.number().int().min(5).max(240),
  minimumNoticeHours: z.number().int().min(0).max(720)
});

export type BusinessHoursConfig = z.infer<typeof businessHoursInputSchema>;

const CLOSED: BusinessHoursDay = { isOpen: false, openMinute: 9 * 60, closeMinute: 17 * 60 };
const WEEKDAY: BusinessHoursDay = { isOpen: true, openMinute: 9 * 60, closeMinute: 17 * 60 };

/** Mon–Fri 09:00–17:00, weekend closed, 30-minute grid, 24 hours' notice. */
export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  weekdays: [CLOSED, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, CLOSED],
  slotGranularityMinutes: 30,
  minimumNoticeHours: 24
};

/** Adapts the stored 7-entry array into the shape `deriveAvailableSlots` reads. */
export function toWeeklyBusinessHours(weekdays: BusinessHoursDay[]): WeeklyBusinessHours {
  return {
    0: weekdays[0],
    1: weekdays[1],
    2: weekdays[2],
    3: weekdays[3],
    4: weekdays[4],
    5: weekdays[5],
    6: weekdays[6]
  };
}

/** Reads the singleton, falling back to defaults when absent or corrupt. */
export async function getBusinessHours(db = prisma): Promise<BusinessHoursConfig> {
  const row = await db.businessHours.findUnique({ where: { id: BUSINESS_HOURS_ID } });
  if (!row) {
    return DEFAULT_BUSINESS_HOURS;
  }

  const parsed = weekdaysSchema.safeParse(row.weekdays);
  if (!parsed.success) {
    logEvent("business_hours.invalid_weekdays_json", { issues: parsed.error.issues.length });
    return DEFAULT_BUSINESS_HOURS;
  }

  return {
    weekdays: parsed.data,
    slotGranularityMinutes: row.slotGranularityMinutes,
    minimumNoticeHours: row.minimumNoticeHours
  };
}

/** Validates and upserts the singleton. Throws on invalid input. */
export async function saveBusinessHours(
  input: BusinessHoursConfig,
  db = prisma
): Promise<BusinessHoursConfig> {
  const data = businessHoursInputSchema.parse(input);

  await db.businessHours.upsert({
    where: { id: BUSINESS_HOURS_ID },
    update: data,
    create: { id: BUSINESS_HOURS_ID, ...data }
  });

  return data;
}
