/**
 * Global Time & Timezone Service
 * 
 * LessonsFlow operates on a "Single Source of Truth" for time, assuming the 
 * entire school (Bookings, Reports, Invoices) operates relative to a 
 * single primary timezone.
 * 
 * DESIGN RATIONALE:
 * 1. Consistent Local Time: Instead of using UTC everywhere and converting 
 *    per-request, we normalize to the configured `APP_TIMEZONE` to ensure 
 *    that "Today" means the same thing for the Teacher and the Student.
 * 2. Intl API: We use `toLocaleString` with a specific `timeZone` to perform 
 *    conversions, ensuring accuracy even across Daylight Savings transitions.
 */

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Australia/Melbourne";

/**
 * Resolves the numeric calendar year in the configured local timezone.
 * RATIONALE: Used to bound recurring bookings and financial reporting ranges.
 */
export function getCurrentCalendarYear(): number {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: APP_TIMEZONE,
    })
  ).getFullYear();
}

/** Determines if a specific Date record falls within a given year. */
export function isDateInCalendarYear(date: Date, year: number): boolean {
  const dateYear = new Date(
    date.toLocaleString("en-US", {
      timeZone: APP_TIMEZONE,
    })
  ).getFullYear();
  return dateYear === year;
}

/**
 * Returns the current instant adjusted to the configured local timezone.
 * Useful for logical "now" comparisons in domain rules.
 */
export function localNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: APP_TIMEZONE }));
}

export const SYSTEM_TIMEZONE = APP_TIMEZONE;
