"use client";

import { AlertCircle, CalendarRange, Clock3, UserRound } from "lucide-react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { Tooltip } from "@/components/admin/ui/tooltip";

/** Available calendar layouts. */
export type CalendarView = "day" | "week" | "month" | "year";

export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

interface BookingsWorkspaceStats {
  total: number;
  pending: number;
  confirmed: number;
  unassigned: number;
}

interface BookingsWorkspaceToolbarProps {
  view: CalendarView;
  dateStr: string;
  rangeLabel: string;
  viewLabel: string;
  workspaceSummary: string;
  teacherFilterLabel: string;
  loadingBookings: boolean;
  hasLoadedInitialBookings: boolean;
  stats: BookingsWorkspaceStats;
  teacherFilter: string;
  setTeacherFilter: (value: string) => void;
  teacherOptions: Array<{ id: string; displayName: string }>;
  onPrev: () => void;
  onNext: () => void;
  onNavigate: (view: CalendarView, date: string) => void;
  onAddManualBooking: () => void;
}

/**
 * Schedule workspace header: hero stats, range navigation, view switcher,
 * teacher filter, and the manual-booking entry point.
 *
 * Presentational only — all state and navigation handlers are supplied by the
 * bookings orchestrator so behavior stays identical to the pre-extraction inline JSX.
 */
export function BookingsWorkspaceToolbar({
  view,
  dateStr,
  rangeLabel,
  viewLabel,
  workspaceSummary,
  teacherFilterLabel,
  loadingBookings,
  hasLoadedInitialBookings,
  stats,
  teacherFilter,
  setTeacherFilter,
  teacherOptions,
  onPrev,
  onNext,
  onNavigate,
  onAddManualBooking
}: BookingsWorkspaceToolbarProps) {
  const statValue = (value: number) => (loadingBookings || !hasLoadedInitialBookings ? "—" : value);

  const statItems: Array<{ label: string; value: number; isWarning?: boolean }> = [
    { label: "Visible items", value: stats.total },
    { label: "Confirmed", value: stats.confirmed },
    { label: "Pending", value: stats.pending },
    { label: "Unassigned", value: stats.unassigned, isWarning: true }
  ];

  const viewOptions: Array<{ view: CalendarView; label: string; tooltip: string }> = [
    { view: "day", label: "Day", tooltip: "Switch to a single-day booking timeline." },
    { view: "week", label: "Week", tooltip: "Switch to week view for lesson planning." },
    { view: "month", label: "Month", tooltip: "Switch to month view for broader scheduling." },
    { view: "year", label: "Year", tooltip: "Switch to year view for long-range planning." }
  ];

  return (
    <AdminCard className="admin-toolbar-card admin-range-card admin-bookings-workspace">
      <div className="admin-bookings-workspace-hero">
        <div className="admin-bookings-workspace-copy">
          <p className="admin-console-kicker">Schedule Workspace</p>
          <div className="admin-bookings-workspace-heading">
            <h2>{rangeLabel}</h2>
            <span className="admin-bookings-workspace-view-pill">{viewLabel}</span>
          </div>
          <p className="helper-text admin-bookings-workspace-summary">{workspaceSummary}</p>

          <div className="admin-bookings-workspace-chips" aria-label="Current bookings context">
            <span className="admin-bookings-workspace-chip">
              <UserRound size={15} aria-hidden="true" />
              {teacherFilterLabel}
            </span>
            <span className="admin-bookings-workspace-chip">
              <CalendarRange size={15} aria-hidden="true" />
              {rangeLabel}
            </span>
            <span className="admin-bookings-workspace-chip">
              <Clock3 size={15} aria-hidden="true" />
              {loadingBookings || !hasLoadedInitialBookings
                ? "Loading bookings"
                : countLabel(stats.confirmed, "confirmed booking", "confirmed bookings")}
            </span>
          </div>
        </div>

        <div className="admin-bookings-workspace-stats" aria-label="Visible booking totals">
          {statItems.map(({ label, value, isWarning }) => (
            <div key={label} className={`admin-bookings-workspace-stat${isWarning ? " is-warning" : ""}`}>
              <span className="admin-bookings-workspace-stat-label">{label}</span>
              <strong>{statValue(value)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-range-row">
        <div className="admin-range-primary">
          <div className="button-row admin-range-nav-buttons">
            <Tooltip content="Go to the previous date range.">
              <button className="btn btn-secondary btn-icon" type="button" onClick={onPrev} aria-label="Previous range">←</button>
            </Tooltip>
            <Tooltip content="Go to the next date range.">
              <button className="btn btn-secondary btn-icon" type="button" onClick={onNext} aria-label="Next range">→</button>
            </Tooltip>
          </div>
          <div className="admin-range-copy">
            <span className="admin-inline-field">Schedule Window</span>
            <strong className="admin-range-label">{rangeLabel}</strong>
          </div>
        </div>

        <div className="admin-range-actions">
          <div className="site-nav admin-range-view-nav">
            {viewOptions.map(({ view: optionView, label, tooltip }) => (
              <Tooltip key={optionView} content={tooltip}>
                <button
                  className={`btn ${view === optionView ? "btn-primary" : "btn-secondary"}`}
                  type="button"
                  onClick={() => onNavigate(optionView, dateStr)}
                >
                  {label}
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="field admin-inline-field booking-teacher-filter-field">
            <label htmlFor="booking-teacher-filter">Teacher</label>
            <select id="booking-teacher-filter" aria-label="Teacher" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
              <option value="all">All teachers</option>
              <option value="unassigned">Unassigned</option>
              {teacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-range-divider" />
          <Tooltip content="Create a new booking directly from the admin calendar.">
            <button className="btn btn-primary" type="button" onClick={onAddManualBooking}>Add Manual Booking</button>
          </Tooltip>
        </div>
      </div>

      {!loadingBookings && hasLoadedInitialBookings && stats.unassigned > 0 ? (
        <div className="admin-bookings-workspace-alert" role="status">
          <AlertCircle size={16} aria-hidden="true" />
          <span>
            {countLabel(stats.unassigned, "unassigned lesson", "unassigned lessons")} still need a teacher in this window.
          </span>
        </div>
      ) : null}
    </AdminCard>
  );
}
