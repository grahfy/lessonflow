/**
 * Centralized time configuration.
 * Business logic assumes a consistent local timezone for all operations
 * (Bookings, Reports, Invoices).
 */

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Australia/Melbourne";

/**
 * Gets the current calendar year in the configured timezone.
 */
export function getCurrentCalendarYear(): number {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: APP_TIMEZONE,
    })
  ).getFullYear();
}

/**
 * Checks if a date falls within a specific calendar year in the configured timezone.
 */
export function isDateInCalendarYear(date: Date, year: number): boolean {
  const dateYear = new Date(
    date.toLocaleString("en-US", {
      timeZone: APP_TIMEZONE,
    })
  ).getFullYear();
  return dateYear === year;
}

/**
 * Returns the current date/time adjusted to the configured timezone.
 */
export function localNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: APP_TIMEZONE }));
}

export const SYSTEM_TIMEZONE = APP_TIMEZONE;
