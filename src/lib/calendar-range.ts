import { addDays, endOfDay, endOfMonth, endOfWeek, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns";

/**
 * Calendar view types for the booking interface.
 * UI: Controls the visible date range in the booking calendar component.
 */
type CalendarView = "day" | "week" | "month";

/**
 * Calculates start and end dates for a given calendar view.
 * UI: Used to determine which bookings to display in the calendar.
 * LOGIC: Week starts on Monday (weekStartsOn: 1) for Australian context.
 */
export function getCalendarRange(view: CalendarView, dateIso?: string): { start: Date; end: Date } {
  const baseDate = dateIso ? parseISO(dateIso) : new Date();

  if (view === "day") {
    return {
      start: startOfDay(baseDate),
      end: endOfDay(baseDate)
    };
  }

  if (view === "week") {
    return {
      start: startOfWeek(baseDate, { weekStartsOn: 1 }),
      end: endOfWeek(baseDate, { weekStartsOn: 1 })
    };
  }

  return {
    start: startOfMonth(baseDate),
    end: endOfMonth(baseDate)
  };
}

export function getDayRange(baseDate: Date): { start: Date; end: Date } {
  return {
    start: startOfDay(baseDate),
    end: endOfDay(addDays(baseDate, 0))
  };
}
