"use client";
import { APP_TIMEZONE } from "@/lib/time";

/**
 * Admin booking calendar presentation component.
 *
 * Rendering is isolated from data fetching/mutations so the parent admin console owns business
 * state while this component focuses on view-specific layout and event selection.
 */
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear
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
  view: "day" | "week" | "month" | "year";
  date: string;
  events: AdminCalendarEvent[];
  selectedEventId: string | null;
  onSelect: (event: AdminCalendarEvent) => void;
  teacherFilterLabel?: string;
};

/** Human-readable heading for one calendar day cell or day-view header. */
function dayLabel(date: Date): string {
  return format(date, "EEE d MMM");
}

/** Formats event times in the app's canonical timezone rather than browser local time. */
function eventTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: APP_TIMEZONE
  }).format(parseISO(iso));
}

/** Checks whether an event starts on the given rendered calendar day. */
function eventDay(event: AdminCalendarEvent, day: Date): boolean {
  return isSameDay(parseISO(event.startAt), day);
}

function monthGridDays(baseDate: Date): Date[] {
  // Render a full Monday-starting grid so month view columns stay stable across month lengths.
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

function yearMonths(baseDate: Date): Date[] {
  const yearStart = startOfYear(baseDate);
  const yearEnd = endOfYear(baseDate);
  const months: Date[] = [];
  let cursor = yearStart;

  while (cursor <= yearEnd) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  return months;
}

function eventMonth(event: AdminCalendarEvent, monthStart: Date): boolean {
  return isSameMonth(parseISO(event.startAt), monthStart);
}

function assignedTeacherLabel(event: AdminCalendarEvent): string | null {
  const row = event.row as { assignedTeacherName?: unknown };
  if (typeof row.assignedTeacherName === "string" && row.assignedTeacherName.trim()) {
    return row.assignedTeacherName.trim();
  }
  return null;
}

/**
 * An approved booking with no active invoice link is "unbilled". The API derives
 * `hasActiveInvoice` per booking event; only approved bookings (not requests) can
 * be billed, so the badge is scoped to those.
 */
function isUnbilledBooking(event: AdminCalendarEvent): boolean {
  if (event.entityType !== "booking" || event.status !== "approved") {
    return false;
  }
  const row = event.row as { hasActiveInvoice?: unknown };
  return row.hasActiveInvoice === false;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function calendarSummary(view: Props["view"], events: AdminCalendarEvent[], teacherFilterLabel?: string): string {
  const pending = events.filter((event) => event.status === "pending").length;
  const approved = events.filter((event) => event.status === "approved").length;
  const scope = teacherFilterLabel || "all teachers";

  if (events.length === 0) {
    return `No bookings or requests are scheduled in this ${view} window for ${scope.toLowerCase()}.`;
  }

  return `${countLabel(events.length, "item")} in view · ${countLabel(approved, "confirmed booking", "confirmed bookings")} · ${countLabel(pending, "pending request", "pending requests")}.`;
}

function calendarLegendCounts(events: AdminCalendarEvent[]) {
  return {
    confirmed: events.filter((event) => event.color === "green").length,
    pending: events.filter((event) => event.color === "yellow").length,
    attention: events.filter((event) => event.color === "red").length,
    archived: events.filter((event) => event.color === "slate").length,
    unbilled: events.filter((event) => isUnbilledBooking(event)).length
  };
}

/** Shared day cell for day/week/month views. */
function DayCell(props: {
  day: Date;
  events: AdminCalendarEvent[];
  selectedEventId: string | null;
  onSelect: (event: AdminCalendarEvent) => void;
  muted?: boolean;
}) {
  // Cap animation markers per day to avoid excessive motion work on very busy days.
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
            {isUnbilledBooking(event) ? <span className="calendar-event-badge is-unbilled" title="Approved booking with no invoice yet">Unbilled</span> : null}
            <small>{assignedTeacherLabel(event) || "Unassigned"}</small>
          </button>
        ))}
        {!props.events.length ? <p className="helper-text">No events</p> : null}
      </div>
    </div>
  );
}

function YearMonthCell(props: {
  monthStart: Date;
  events: AdminCalendarEvent[];
  selectedEventId: string | null;
  onSelect: (event: AdminCalendarEvent) => void;
}) {
  const visibleEvents = props.events.slice(0, 4);
  const remaining = Math.max(0, props.events.length - visibleEvents.length);

  return (
    <section className="calendar-year-month" data-motion-item="calendar-year-month">
      <header className="calendar-year-month-head" data-motion-item="calendar-year-month-head">
        <h4>{format(props.monthStart, "MMMM")}</h4>
        <span className="calendar-year-month-count">{props.events.length}</span>
      </header>
      <div className="calendar-event-list">
        {visibleEvents.map((event, index) => (
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
            <span>{format(parseISO(event.startAt), "d MMM")} · {eventTime(event.startAt)}</span>
            <strong>{event.title}</strong>
            {isUnbilledBooking(event) ? <span className="calendar-event-badge is-unbilled" title="Approved booking with no invoice yet">Unbilled</span> : null}
            <small>{assignedTeacherLabel(event) || "Unassigned"}</small>
          </button>
        ))}
        {!props.events.length ? <p className="helper-text">No events</p> : null}
        {remaining > 0 ? <p className="helper-text">+{remaining} more</p> : null}
      </div>
    </section>
  );
}

/**
 * Presentational booking calendar that renders the same event set across day,
 * week, month, and year views.
 */
export function AdminBookingCalendar(props: Props) {
  const baseDate = parseISO(`${props.date}T00:00:00`);
  const legendCounts = calendarLegendCounts(props.events);
  const summaryText = calendarSummary(props.view, props.events, props.teacherFilterLabel);

  const headerMeta = (
    <div className="calendar-header-meta" aria-label="Calendar legend">
      <span className="calendar-legend-chip is-green">Confirmed {legendCounts.confirmed}</span>
      <span className="calendar-legend-chip is-yellow">Pending {legendCounts.pending}</span>
      <span className="calendar-legend-chip is-red">Attention {legendCounts.attention}</span>
      <span className="calendar-legend-chip is-slate">Archived {legendCounts.archived}</span>
      <span className="calendar-legend-chip is-amber">Unbilled {legendCounts.unbilled}</span>
    </div>
  );

  if (props.view === "day") {
    const dayEvents = props.events.filter((event) => eventDay(event, baseDate));
    return (
      <div className="calendar-wrap is-day" data-motion-item="calendar-wrap-day">
        <header className="calendar-header-row" data-motion-item="calendar-header">
          <div className="calendar-header-copy">
            <h3>{dayLabel(baseDate)}</h3>
            <p className="helper-text">{summaryText}</p>
          </div>
          {headerMeta}
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
          <div className="calendar-header-copy">
            <h3>Week of {dayLabel(days[0])}</h3>
            <p className="helper-text">{summaryText}</p>
          </div>
          {headerMeta}
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

  if (props.view === "year") {
    const months = yearMonths(baseDate);
    return (
      <div className="calendar-wrap is-year" data-motion-item="calendar-wrap-year">
        <header className="calendar-header-row" data-motion-item="calendar-header">
          <div className="calendar-header-copy">
            <h3>{format(baseDate, "yyyy")}</h3>
            <p className="helper-text">{summaryText}</p>
          </div>
          {headerMeta}
        </header>
        <div className="calendar-grid is-year">
          {months.map((monthStart) => (
            <YearMonthCell
              key={monthStart.toISOString()}
              monthStart={monthStart}
              events={props.events.filter((event) => eventMonth(event, monthStart))}
              selectedEventId={props.selectedEventId}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  // Month view includes adjacent-month days as muted cells to keep the grid rectangular.
  const days = monthGridDays(baseDate);
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  return (
    <div className="calendar-wrap is-month" data-motion-item="calendar-wrap-month">
      <header className="calendar-header-row" data-motion-item="calendar-header">
        <div className="calendar-header-copy">
          <h3>{format(baseDate, "MMMM yyyy")}</h3>
          <p className="helper-text">{summaryText}</p>
        </div>
        {headerMeta}
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
