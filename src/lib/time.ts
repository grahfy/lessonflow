const MELBOURNE_TZ = "Australia/Melbourne";

export function getCurrentCalendarYear(now: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    year: "numeric"
  });
  return Number(formatter.format(now));
}

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
