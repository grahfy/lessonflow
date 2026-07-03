/**
 * Global Time & Timezone Service
 *
 * LessonsFlow stores instants in UTC while interpreting wall-clock booking
 * inputs against one explicit business timezone.
 */

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Australia/Melbourne";
export const SYSTEM_TIMEZONE = process.env.TZ || APP_TIMEZONE;

type TimeZoneDateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

const dateTimePartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimePartsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateTimePartsFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  dateTimePartsFormatterCache.set(timeZone, formatter);
  return formatter;
}

function getOffsetFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = offsetFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  offsetFormatterCache.set(timeZone, formatter);
  return formatter;
}

function getTimeZoneDateParts(date: Date, timeZone: string): TimeZoneDateParts {
  const parts = getDateTimePartsFormatter(timeZone).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second")
  };
}

function parseOffsetMinutes(offsetLabel: string): number {
  if (offsetLabel === "GMT" || offsetLabel === "UTC") {
    return 0;
  }

  const match = offsetLabel.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unsupported time zone offset label: ${offsetLabel}`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || "0");
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const offsetLabel = getOffsetFormatter(timeZone)
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  if (!offsetLabel) {
    throw new Error(`Unable to resolve time zone offset for ${timeZone}`);
  }

  return parseOffsetMinutes(offsetLabel);
}

function parseDateTimeLocalValue(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  const match = value.match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?$/
  );
  if (!match?.groups) {
    return null;
  }

  const parsed = {
    year: Number(match.groups.year),
    month: Number(match.groups.month),
    day: Number(match.groups.day),
    hour: Number(match.groups.hour),
    minute: Number(match.groups.minute),
    second: Number(match.groups.second || "0")
  };

  if (
    parsed.month < 1 ||
    parsed.month > 12 ||
    parsed.day < 1 ||
    parsed.day > 31 ||
    parsed.hour > 23 ||
    parsed.minute > 59 ||
    parsed.second > 59
  ) {
    return null;
  }

  return parsed;
}

/**
 * Formats a UTC instant for `datetime-local` inputs using the configured app timezone.
 */
export function toDateTimeLocalValue(value: string | Date, timeZone: string = APP_TIMEZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getTimeZoneDateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Formats an instant as an app-timezone date key (`YYYY-MM-DD`). */
export function toDateKey(value: string | Date, timeZone: string = APP_TIMEZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getTimeZoneDateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Formats an instant as an app-timezone time key (`HH:mm`). */
export function toTimeKey(value: string | Date, timeZone: string = APP_TIMEZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getTimeZoneDateParts(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

/**
 * Converts a `datetime-local` value in the configured app timezone into a UTC ISO timestamp.
 */
export function dateTimeLocalToIso(value: string, timeZone: string = APP_TIMEZONE): string | null {
  const parsed = parseDateTimeLocalValue(value);
  if (!parsed) {
    return null;
  }

  const normalizedLocalValue = `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}T${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;

  const utcGuess = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second);
  let resolvedMs = utcGuess - getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone) * 60_000;
  const correctedMs = utcGuess - getTimeZoneOffsetMinutes(new Date(resolvedMs), timeZone) * 60_000;
  if (correctedMs !== resolvedMs) {
    resolvedMs = correctedMs;
  }

  const resolvedDate = new Date(resolvedMs);
  if (Number.isNaN(resolvedDate.getTime())) {
    return null;
  }

  // RATIONALE: Reject impossible wall-clock inputs, such as DST gap times,
  // rather than silently shifting them to a different local time.
  if (toDateTimeLocalValue(resolvedDate, timeZone) !== normalizedLocalValue) {
    return null;
  }

  return resolvedDate.toISOString();
}

/** Converts a `datetime-local` app-timezone value into a Date instance. */
export function dateTimeLocalToDate(value: string, timeZone: string = APP_TIMEZONE): Date | null {
  const iso = dateTimeLocalToIso(value, timeZone);
  return iso ? new Date(iso) : null;
}

/**
 * Resolves the numeric calendar year in the configured local timezone.
 * RATIONALE: Used to bound recurring bookings and financial reporting ranges.
 */
export function getCurrentCalendarYear(): number {
  return Number(toDateKey(new Date()).slice(0, 4));
}

/** Determines if a specific Date record falls within a given year. */
export function isDateInCalendarYear(date: Date, year: number): boolean {
  return Number(toDateKey(date).slice(0, 4)) === year;
}
