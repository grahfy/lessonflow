"use client";

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek
} from "date-fns";

export type CalendarEventColor = "green" | "yellow" | "red" | "slate";
export type CalendarEventType = "booking" | "booking_request";

export type AdminCalendarEvent = {
  entityType: CalendarEventType;
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  color: CalendarEventColor;
  title: string;
  row: Record<string, unknown>;
};

const MAX_ANIMATED_EVENTS_PER_DAY = 6;

type Props = {
  view: "day" | "week" | "month";
  date: string;
  events: AdminCalendarEvent[];
  selectedEventId: string | null;
  onSelect: (event: AdminCalendarEvent) => void;
};

function dayLabel(date: Date): string {
  return format(date, "EEE d MMM");
}

function eventTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Australia/Melbourne"
  }).format(parseISO(iso));
}

function eventDay(event: AdminCalendarEvent, day: Date): boolean {
  return isSameDay(parseISO(event.startAt), day);
}

function monthGridDays(baseDate: Date): Date[] {
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

function weekDays(baseDate: Date): Date[] {
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function DayCell(props: {
  day: Date;
  events: AdminCalendarEvent[];
  selectedEventId: string | null;
  onSelect: (event: AdminCalendarEvent) => void;
  muted?: boolean;
}) {
  return (
    <div className={`calendar-day ${props.muted ? "is-muted" : ""}`} data-motion-item="calendar-day">
      <div className="calendar-day-head" data-motion-item="calendar-day-head">
        <strong>{format(props.day, "d")}</strong>
        <span>{format(props.day, "EEE")}</span>
      </div>
      <div className="calendar-event-list">
        {props.events.map((event, index) => (
          <button
            type="button"
            key={`${event.entityType}-${event.id}`}
            onClick={() => props.onSelect(event)}
            className={`calendar-event event-${event.color} ${
              props.selectedEventId === `${event.entityType}:${event.id}` ? "is-selected" : ""
            }`}
            data-motion-item={index < MAX_ANIMATED_EVENTS_PER_DAY ? "calendar-event" : undefined}
            data-motion-skip={index < MAX_ANIMATED_EVENTS_PER_DAY ? undefined : "true"}
          >
            <span>{eventTime(event.startAt)}</span>
            <strong>{event.title}</strong>
          </button>
        ))}
        {!props.events.length ? <p className="helper-text">No events</p> : null}
      </div>
    </div>
  );
}

export function AdminBookingCalendar(props: Props) {
  const baseDate = parseISO(`${props.date}T00:00:00`);

  if (props.view === "day") {
    const dayEvents = props.events.filter((event) => eventDay(event, baseDate));
    return (
      <div className="calendar-wrap is-day" data-motion-item="calendar-wrap-day">
        <header className="calendar-header-row" data-motion-item="calendar-header">
          <h3>{dayLabel(baseDate)}</h3>
        </header>
        <div className="calendar-grid is-day">
          <DayCell day={baseDate} events={dayEvents} selectedEventId={props.selectedEventId} onSelect={props.onSelect} />
        </div>
      </div>
    );
  }

  if (props.view === "week") {
    const days = weekDays(baseDate);
    return (
      <div className="calendar-wrap is-week" data-motion-item="calendar-wrap-week">
        <header className="calendar-header-row" data-motion-item="calendar-header">
          <h3>Week of {dayLabel(days[0])}</h3>
        </header>
        <div className="calendar-grid is-week">
          {days.map((day) => (
            <DayCell
              key={day.toISOString()}
              day={day}
              events={props.events.filter((event) => eventDay(event, day))}
              selectedEventId={props.selectedEventId}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  const days = monthGridDays(baseDate);
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  return (
    <div className="calendar-wrap is-month" data-motion-item="calendar-wrap-month">
      <header className="calendar-header-row" data-motion-item="calendar-header">
        <h3>{format(baseDate, "MMMM yyyy")}</h3>
      </header>
      <div className="calendar-grid is-month">
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            muted={day < monthStart || day > monthEnd}
            events={props.events.filter((event) => eventDay(event, day))}
            selectedEventId={props.selectedEventId}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </div>
  );
}
