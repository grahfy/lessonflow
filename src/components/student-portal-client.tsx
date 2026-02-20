"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PortalMaterial = {
  id: string;
  title: string;
  materialType: "audio" | "pdf";
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
};

type PortalBooking = {
  id: string;
  status: "approved" | "cancelled";
  lessonMode: "in_person" | "video";
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  startAt: string;
  endAt: string;
  notes: string | null;
  materials: PortalMaterial[];
};

type PortalPendingRequest = {
  id: string;
  requestedStartAt: string;
  lessonMode: "in_person" | "video";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  status: "pending";
};

type PortalPayload = {
  student: {
    id: string;
    fullName: string;
    postcode: string;
  };
  now: string;
  upcoming: PortalBooking[];
  previous: PortalBooking[];
  pendingRequests: PortalPendingRequest[];
};

type LessonDurationChoice = "min30" | "min60";

/**
 * Student portal dashboard showing lesson history, learning materials,
 * and self-service lesson request/cancellation actions.
 */
export function StudentPortalClient() {
  const router = useRouter();
  const [data, setData] = useState<PortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [requestingBooking, setRequestingBooking] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelledBookingIds, setCancelledBookingIds] = useState<Record<string, boolean>>({});
  const [requestStartAtLocal, setRequestStartAtLocal] = useState(defaultStartAtLocalValue());
  const [requestLessonMode, setRequestLessonMode] = useState<"in_person" | "video">("in_person");
  const [requestLessonDuration, setRequestLessonDuration] = useState<LessonDurationChoice>("min60");
  const [requestNotes, setRequestNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/student/portal", { cache: "no-store" });
    if (response.status === 401) {
      router.push("/student/login");
      router.refresh();
      return;
    }
    if (!response.ok) {
      setLoading(false);
      setError("Unable to load portal details right now.");
      return;
    }
    const payload = (await response.json()) as PortalPayload;
    setData(payload);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Ends the student session and returns to the login page.
   */
  async function logout() {
    setLoggingOut(true);
    await fetch("/api/student/logout", { method: "POST" });
    router.push("/student/login");
    router.refresh();
  }

  /**
   * Creates a new pending booking request from the student portal.
   */
  async function createBookingRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestingBooking(true);
    setError("");
    setNotice("");

    const requestedStartAt = toIsoFromLocal(requestStartAtLocal);
    if (!requestedStartAt) {
      setRequestingBooking(false);
      setError("Please choose a valid lesson date and time.");
      return;
    }

    const response = await fetch("/api/student/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestedStartAt,
        lessonMode: requestLessonMode,
        lessonDuration: requestLessonDuration,
        notes: requestNotes.trim() || undefined
      })
    });
    setRequestingBooking(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Unable to submit booking request.");
      return;
    }

    setNotice("Lesson request submitted. It is now pending owner approval.");
    setRequestStartAtLocal(defaultStartAtLocalValue());
    setRequestLessonMode("in_person");
    setRequestLessonDuration("min60");
    setRequestNotes("");
    await load();
  }

  /**
   * Cancels a selected upcoming appointment after explicit confirmation.
   */
  async function cancelBookingById(bookingId: string) {
    if (!bookingId) {
      setError("Select an upcoming appointment to cancel.");
      return;
    }

    const confirmed = window.confirm(
      "Cancel this lesson?\n\nIf the lesson is within 24 hours, you will still be charged the full lesson rate."
    );
    if (!confirmed) {
      return;
    }

    setCancellingBookingId(bookingId);
    setError("");
    setNotice("");
    const response = await fetch(`/api/student/bookings/${bookingId}`, {
      method: "PATCH"
    });
    setCancellingBookingId(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Unable to cancel this appointment.");
      return;
    }

    setCancelledBookingIds((prev) => ({
      ...prev,
      [bookingId]: true
    }));
    setData((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        upcoming: prev.upcoming.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                status: "cancelled"
              }
            : booking
        )
      };
    });
    setNotice("Appointment cancelled.");
    window.setTimeout(() => {
      void load();
    }, 900);
  }

  return (
    <div className="student-portal-shell" data-motion-root="student-portal">
      <div className="admin-card booking-row student-portal-header">
        <div>
          <p className="kicker">Student Portal</p>
          <h1>{data?.student.fullName || "Portal"}</h1>
          <p className="helper-text">Appointments and assigned learning materials.</p>
        </div>
        <div className="student-portal-header-actions">
          <Link className="btn btn-secondary" href="/student/materials">
            Show all learning materials
          </Link>
          <button className="btn btn-secondary" type="button" onClick={() => void logout()} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>

      {loading ? <p className="notice">Loading portal...</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
      {notice ? <p className="notice success">{notice}</p> : null}

      {!loading && !error && data ? (
        <>
          <section className="admin-card student-actions-panel">
            <div className="student-actions-header">
              <h2>Book or cancel a lesson</h2>
              <p className="helper-text student-actions-intro">
                New bookings are submitted as pending requests and confirmed after owner approval.
              </p>
            </div>

            <div className="student-actions-layout">
              <form className="student-actions-grid" onSubmit={createBookingRequest}>
                <h3 className="student-actions-subtitle">Request lesson</h3>
                <div className="field">
                  <label htmlFor="student-request-start">Request lesson time</label>
                  <input
                    id="student-request-start"
                    type="datetime-local"
                    required
                    value={requestStartAtLocal}
                    onChange={(event) => setRequestStartAtLocal(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="student-request-mode">Mode</label>
                  <select
                    id="student-request-mode"
                    value={requestLessonMode}
                    onChange={(event) => setRequestLessonMode(event.target.value as "in_person" | "video")}
                  >
                    <option value="in_person">In-person</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="student-request-duration">Duration</label>
                  <select
                    id="student-request-duration"
                    value={requestLessonDuration}
                    onChange={(event) => setRequestLessonDuration(event.target.value as LessonDurationChoice)}
                  >
                    <option value="min30">30 min</option>
                    <option value="min60">60 min</option>
                  </select>
                </div>
                <div className="field student-actions-notes">
                  <label htmlFor="student-request-notes">Notes (optional)</label>
                  <textarea
                    id="student-request-notes"
                    value={requestNotes}
                    onChange={(event) => setRequestNotes(event.target.value)}
                  />
                </div>
                <div className="student-actions-cta">
                  <button className="btn btn-primary" type="submit" disabled={requestingBooking}>
                    {requestingBooking ? "Submitting..." : "Request lesson (pending)"}
                  </button>
                </div>
              </form>

              <aside className="student-actions-side" aria-label="Cancellation policy and pending requests">
                <p className="student-policy-warning" role="note">
                  If a cancellation is made within 24 hours of lesson start, you will still be charged the full lesson rate.
                </p>

                <div className="student-pending-list">
                  <strong>Pending requests</strong>
                  {data.pendingRequests.length ? (
                    <ul>
                      {data.pendingRequests.map((requestRow) => (
                        <li key={requestRow.id}>
                          {formatWhen(requestRow.requestedStartAt)} · {requestRow.lessonMode === "in_person" ? "In-person" : "Video"} ·{" "}
                          {requestRow.customDurationMinutes
                            ? `${requestRow.customDurationMinutes} min`
                            : requestRow.lessonDuration === "min30"
                              ? "30 min"
                              : "60 min"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="helper-text student-pending-empty">No pending requests.</p>
                  )}
                </div>
              </aside>
            </div>
          </section>

          <div className="student-portal-grid">
            <section className="admin-card student-upcoming-panel">
              <h2>Upcoming appointments</h2>
              <div className="student-upcoming-viewport">
                <BookingList
                  bookings={data.upcoming}
                  emptyMessage="No upcoming appointments."
                  variant="upcoming"
                  cancellingBookingId={cancellingBookingId}
                  cancelledBookingIds={cancelledBookingIds}
                  onCancelBooking={(bookingId) => void cancelBookingById(bookingId)}
                />
              </div>
            </section>
            <section className="admin-card student-previous-panel">
              <h2>Previous appointments</h2>
              <BookingList bookings={data.previous} emptyMessage="No previous appointments." variant="previous" />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Renders one portal booking list section with nested learning materials.
 */
type BookingListProps = {
  bookings: PortalBooking[];
  emptyMessage: string;
  variant: "upcoming" | "previous";
  cancellingBookingId?: string | null;
  cancelledBookingIds?: Record<string, boolean>;
  onCancelBooking?: (bookingId: string) => void;
};

function BookingList(input: BookingListProps) {
  if (!input.bookings.length) {
    return <p className="helper-text">{input.emptyMessage}</p>;
  }

  return (
    <div className="booking-list student-portal-booking-list">
      {input.bookings.map((booking) => (
        <article className="booking-item student-portal-booking-item" key={booking.id}>
          <div className="student-booking-head">
            <strong>{formatWhen(booking.startAt)}</strong>
          </div>

          <div className="student-booking-chip-row">
            <span className="student-chip">{describeDuration(booking)}</span>
            <span className="student-chip">{booking.lessonMode === "in_person" ? "In-person" : "Video"}</span>
            <span className={`student-chip ${booking.status === "cancelled" ? "is-cancelled" : "is-approved"}`}>
              {booking.status}
            </span>
            {isWithin24Hours(booking.startAt) && booking.status !== "cancelled" ? (
              <span className="student-chip is-warning">Within 24h: full fee applies</span>
            ) : null}
            {input.cancelledBookingIds?.[booking.id] ? <span className="student-chip is-success">Cancelled</span> : null}
          </div>

          {input.variant === "upcoming" && booking.status !== "cancelled" ? (
            <div className="student-booking-actions">
              <button
                className={`btn btn-danger ${isWithin24Hours(booking.startAt) ? "student-cancel-btn-warning" : ""}`}
                type="button"
                disabled={!!input.cancellingBookingId}
                onClick={() => {
                  if (input.onCancelBooking) {
                    input.onCancelBooking(booking.id);
                  }
                }}
              >
                {input.cancellingBookingId === booking.id ? "Cancelling..." : "Cancel lesson"}
              </button>
            </div>
          ) : null}

          {booking.notes ? (
            <details className="student-booking-details">
              <summary>Lesson notes</summary>
              <p>{booking.notes}</p>
            </details>
          ) : null}

          <div className="student-materials-group">
            <strong>Learning materials</strong>
            {booking.materials.length ? (
              <ul className="student-material-list">
                {booking.materials.map((material) => (
                  <li key={material.id}>
                    <span>
                      {material.title} ({material.materialType.toUpperCase()})
                    </span>
                    <a className="btn btn-secondary" href={material.downloadUrl}>
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="student-chip">No materials yet</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Formats appointment timestamps in Melbourne-local style for readability.
 */
function formatWhen(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne"
  }).format(date);
}

/**
 * Displays lesson duration, preferring custom minute values when available.
 */
function describeDuration(booking: PortalBooking): string {
  if (booking.customDurationMinutes && booking.customDurationMinutes > 0) {
    return `${booking.customDurationMinutes} min`;
  }
  return booking.lessonDuration === "min30" ? "30 min" : "60 min";
}

/**
 * Determines whether a lesson starts within the next 24 hours.
 */
function isWithin24Hours(startAtIso: string): boolean {
  const startAt = new Date(startAtIso);
  const deltaMs = startAt.getTime() - Date.now();
  return deltaMs > 0 && deltaMs <= 24 * 60 * 60 * 1000;
}

/**
 * Returns a default local datetime value one day ahead for quick booking requests.
 */
function defaultStartAtLocalValue(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return toLocalDateTimeValue(date);
}

/**
 * Converts Date values to `datetime-local` friendly strings.
 */
function toLocalDateTimeValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Converts `datetime-local` input values to ISO timestamps for API requests.
 */
function toIsoFromLocal(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}
