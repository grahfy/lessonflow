import { addDays, endOfDay, endOfMonth, endOfWeek, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns";

type CalendarView = "day" | "week" | "month";

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
