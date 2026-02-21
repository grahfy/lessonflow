/**
 * Melbourne timezone identifier for all date/time operations.
 * UI: Used for displaying times in the booking calendar and admin panels.
 * LOGIC: Business operates in Melbourne, so all times must be in local context.
 */
const MELBOURNE_TZ = "Australia/Melbourne";

/**
 * Gets the current calendar year in Melbourne timezone.
 * LOGIC: Used for filtering bookings and invoices by fiscal year.
 */
export function getCurrentCalendarYear(now: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    year: "numeric"
  });
  return Number(formatter.format(now));
}

/**
 * Checks if a date falls within a specific calendar year in Melbourne timezone.
 * LOGIC: Used for year-based filtering in booking and invoice queries.
 */
export function isDateInCalendarYear(date: Date, year: number): boolean {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    year: "numeric"
  });
  return Number(formatter.format(date)) === year;
}

export function melbourneNow(): Date {
  return new Date();
}

export const AUSTRALIA_MELBOURNE_TZ = MELBOURNE_TZ;
