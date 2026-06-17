"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactElement, FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { Tooltip } from "@/components/admin/ui/tooltip";
import { SkeletonBlock, SkeletonRegion } from "@/components/ui/skeleton";
import styles from "@/components/student-portal.module.css";
import { BookingNotesViewer } from "@/components/student-portal/booking-notes-viewer";
import { LessonPlanViewer } from "@/components/student-portal/lesson-plan-viewer";
import {
  parseStudentPortalPayload,
  type StudentPortalBooking,
  type StudentPortalMaterial,
  type StudentPortalPayload
} from "@/lib/student-portal/contracts";
import { APP_TIMEZONE, dateTimeLocalToIso, toDateTimeLocalValue } from "@/lib/time";
import { formatCurrency } from "@/lib/invoices/currency";

type LessonDurationChoice = "min30" | "min60";

type SystemAnnouncement = {
  appliedAt: string;
  shortCommit: string;
  commits: Array<{
    subject: string;
    authoredAt: string;
  }>;
};

/**
 * Student portal dashboard showing lesson history, learning materials,
 * and self-service lesson request/cancellation actions.
 */
export function StudentPortalClient(): ReactElement {
  const router = useRouter();
  const [data, setData] = useState<StudentPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [announcement, setAnnouncement] = useState<SystemAnnouncement | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [requestingBooking, setRequestingBooking] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelledBookingIds, setCancelledBookingIds] = useState<Record<string, boolean>>({});
  const [requestStartAtLocal, setRequestStartAtLocal] = useState(defaultStartAtLocalValue());
  const [requestLessonMode, setRequestLessonMode] = useState<"in_person" | "video">("in_person");
  const [requestLessonDuration, setRequestLessonDuration] = useState<LessonDurationChoice>("min60");
  const [requestNotes, setRequestNotes] = useState("");
  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState<string | null>(null);
  // Reschedule request state: which booking's form is open, the desired time, an
  // optional reason, and the in-flight booking id while the request submits.
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null);
  const [rescheduleStartAtLocal, setRescheduleStartAtLocal] = useState(defaultStartAtLocalValue());
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [submittingRescheduleId, setSubmittingRescheduleId] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // Portal and materials pages intentionally share the same aggregated payload route so booking
    // lists, pending requests, and materials stay consistent.
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
    const payloadBody = await response.json().catch(() => null);
    let payload: StudentPortalPayload;
    try {
      payload = parseStudentPortalPayload(payloadBody);
    } catch {
      setLoading(false);
      setError("Unable to load portal details right now.");
      return;
    }
    setData(payload);
    setLoading(false);

    // Fetch system announcement if available.
    try {
      const announcementResponse = await fetch("/latest-announcement.json", { cache: "no-store" });
      if (announcementResponse.ok) {
        const announcementData = (await announcementResponse.json()) as SystemAnnouncement;
        // Only show if the announcement is fresh (within last 3 days).
        const appliedAt = new Date(announcementData.appliedAt).getTime();
        const now = Date.now();
        if (now - appliedAt < 3 * 24 * 60 * 60 * 1000) {
          setAnnouncement(announcementData);
          setShowAnnouncement(true);
        }
      }
    } catch {
      // Announcements are optional; fail silently.
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Ends the student session and returns to the login page.
   */
  async function logout() {
    setLoggingOut(true);
    // Logout is best-effort; the important user outcome is returning to the login screen.
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

    // Student booking requests remain pending until owner approval.
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
    // Reload to refresh the pending request list and any concurrent owner-side changes.
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
    // Optimistically mark the booking as cancelled for immediate feedback, then reconcile with a
    // delayed reload to pick up any server-side updates.
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

  /**
   * Submits a reschedule request for an upcoming booking. The booking is not moved
   * immediately — it stays scheduled until an admin approves the request.
   */
  async function submitRescheduleRequest(bookingId: string) {
    const requestedStartAt = toIsoFromLocal(rescheduleStartAtLocal);
    if (!requestedStartAt) {
      setError("Choose a valid new lesson time.");
      return;
    }

    setSubmittingRescheduleId(bookingId);
    setError("");
    setNotice("");
    const response = await fetch(`/api/student/bookings/${bookingId}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestedStartAt,
        reason: rescheduleReason.trim() || undefined
      })
    });
    setSubmittingRescheduleId(null);

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || "Unable to submit reschedule request.");
      return;
    }

    setRescheduleBookingId(null);
    setRescheduleReason("");
    setNotice(
      payload?.warning || "Reschedule request submitted. We'll confirm your new time soon."
    );
    // Reload so the booking shows its pending-reschedule state from the server.
    void load();
  }

  /**
   * Redeems a gift-voucher code into the student's own account credit. The
   * endpoint returns an oracle-free generic error on any failure, so the UI
   * surfaces that message as-is without distinguishing failure causes.
   */
  async function redeemVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = voucherCode.trim();
    if (!code) {
      setError("Enter a voucher code to redeem.");
      return;
    }
    setRedeemingVoucher(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/student/portal/redeem-voucher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    setRedeemingVoucher(false);

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || "This voucher code could not be redeemed.");
      return;
    }

    setVoucherCode("");
    setNotice("Voucher redeemed. Your account credit has been updated.");
    // Reload so the new account-credit balance is reflected.
    void load();
  }

  return (
    <div className={styles["portal-shell"]} data-motion-root="student-portal">
      {showAnnouncement && announcement ? (
        <div className={cx("admin-card", "booking-row", styles["system-announcement-banner"])}>
          <div className={styles["system-announcement-content"]}>
            <span className={cx(styles["chip"], styles["chip-success"])}>New Update</span>
            <strong>System updates were recently applied!</strong>
            <ul className={styles["system-announcement-list"]}>
              {announcement.commits.slice(0, 3).map((commit, idx) => (
                <li key={idx}>{commit.subject}</li>
              ))}
            </ul>
          </div>
          <button 
            className="btn btn-secondary btn-sm"
            type="button" 
            onClick={() => setShowAnnouncement(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className={cx("admin-card", "booking-row", styles["portal-header"])}>
        <div className={styles["portal-header-visual"]}>
          {/* Optimized WebP keeps the portal header visual fast without oversized payloads. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles["portal-header-illustration"]}
            src="/images/student-portal-notes-tile.svg"
            alt="Illustration of music study books and notes"
            width={360}
            height={220}
            loading="eager"
            decoding="async"
          />
        </div>
        <div className={styles["portal-header-copy"]}>
          <p className={styles["portal-kicker"]}>Student Portal</p>
          <h1 className={styles["portal-title"]}>{data?.student.fullName || "Portal"}</h1>
          <p className={cx("helper-text", styles["portal-helper-text"])}>Appointments and assigned learning materials.</p>
        </div>
        <div className={styles["portal-header-actions"]}>
          <Tooltip content="Open the full materials library with every file assigned to your account.">
            <Link className={cx("btn", "btn-secondary", styles["portal-header-action-button"])} href="/student/materials">
              Show all learning materials
            </Link>
          </Tooltip>
          <Tooltip content="Sign out of the student portal on this device.">
            <button
              className={cx("btn", "btn-secondary", styles["portal-header-action-button"])}
              type="button"
              onClick={() => void logout()}
              disabled={loggingOut}
            >
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </Tooltip>
        </div>
      </div>

      {loading ? (
        <SkeletonRegion label="Loading portal" className={styles["portal-skeleton"]}>
          <section className={cx("admin-card", styles["actions-panel"])} aria-hidden="true">
            <SkeletonBlock variant="text" width="40%" height="1.25rem" />
            <SkeletonBlock variant="text" width="70%" />
            <SkeletonBlock height="2.5rem" radius={8} />
          </section>
          <div className={styles["portal-grid"]} aria-hidden="true">
            <section className={cx("admin-card", styles["upcoming-panel"])}>
              <SkeletonBlock variant="text" width="50%" height="1.1rem" />
              <SkeletonBlock height="5rem" radius={10} />
              <SkeletonBlock height="5rem" radius={10} />
            </section>
            <section className={cx("admin-card", styles["previous-panel"])}>
              <SkeletonBlock variant="text" width="50%" height="1.1rem" />
              <SkeletonBlock height="5rem" radius={10} />
              <SkeletonBlock height="5rem" radius={10} />
            </section>
          </div>
        </SkeletonRegion>
      ) : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {notice ? <p className="notice success" role="status">{notice}</p> : null}

      {!loading && !error && data ? (
        <>
          <section className={cx("admin-card", styles["actions-panel"])}>
            <div className={styles["actions-header"]}>
              <h2 className={styles["actions-title"]}>Book or cancel a lesson</h2>
              <p className={cx("helper-text", styles["actions-intro"])}>
                New bookings are submitted as pending requests and confirmed after owner approval.
              </p>
            </div>

            <div className={styles["actions-layout"]}>
              <form className={styles["actions-grid"]} onSubmit={createBookingRequest}>
                <h3 className={styles["actions-subtitle"]}>Request lesson</h3>
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
                <div className={cx("field", styles["actions-notes"])}>
                  <label htmlFor="student-request-notes">Notes (optional)</label>
                  <textarea
                    className={styles["actions-textarea"]}
                    id="student-request-notes"
                    value={requestNotes}
                    onChange={(event) => setRequestNotes(event.target.value)}
                  />
                </div>
                <div className={styles["actions-cta"]}>
                  <Tooltip content="Submit this lesson request for owner review and approval.">
                    <button className={cx("btn", "btn-primary", styles["actions-submit-button"])} type="submit" disabled={requestingBooking}>
                      {requestingBooking ? "Submitting..." : "Request lesson (pending)"}
                    </button>
                  </Tooltip>
                </div>
              </form>

              <aside className={styles["actions-side"]} aria-label="Cancellation policy and pending requests">
                {data.lessonCredits && data.lessonCredits.totalRemaining > 0 ? (
                  <div className={styles["pending-list"]} role="status" aria-label="Prepaid lesson credits">
                    <strong className={styles["pending-title"]}>Prepaid lessons</strong>
                    <p className="helper-text">
                      You have <strong>{data.lessonCredits.totalRemaining}</strong>{" "}
                      prepaid {data.lessonCredits.totalRemaining === 1 ? "lesson" : "lessons"} remaining.
                      These are applied automatically when your lesson is booked.
                    </p>
                    <ul className={styles["pending-items"]}>
                      {data.lessonCredits.batches.map((batch) => (
                        <li key={batch.id}>
                          {batch.remainingQuantity}{" "}
                          {batch.durationMinutes ? `× ${batch.durationMinutes} min` : "lesson"}
                          {batch.remainingQuantity === 1 ? "" : "s"}
                          {batch.expiresAt ? ` · expires ${formatWhen(batch.expiresAt)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className={styles["pending-list"]}>
                  <strong className={styles["pending-title"]}>Account credit</strong>
                  <p className="helper-text">
                    Balance:{" "}
                    <strong>{formatCurrency(data.accountCreditCents ?? 0)}</strong>
                    . Account credit is applied to your invoices.
                  </p>
                  <form onSubmit={redeemVoucher}>
                    <label htmlFor="student-voucher-code">Redeem a voucher</label>
                    <input
                      id="student-voucher-code"
                      type="text"
                      value={voucherCode}
                      onChange={(event) => setVoucherCode(event.target.value)}
                      placeholder="Enter voucher code"
                      autoCapitalize="characters"
                      maxLength={64}
                    />
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      disabled={redeemingVoucher}
                    >
                      {redeemingVoucher ? "Redeeming..." : "Redeem voucher"}
                    </button>
                  </form>
                </div>

                <p className={styles["policy-warning"]} role="note">
                  If less than 24 hours notice is given, the full lesson fee is still payable. If more than 24 hours notice is given, a make-up lesson will be provided within the same week.
                </p>

                <div className={styles["pending-list"]}>
                  <strong className={styles["pending-title"]}>Pending requests</strong>
                  {data.pendingRequests.length ? (
                    <ul className={styles["pending-items"]}>
                      {data.pendingRequests.map((requestRow) => (
                        <li key={requestRow.id}>
                          {formatWhen(requestRow.requestedStartAt)} · {requestRow.lessonMode === "in_person" ? "In-person" : "Video"} ·{" "}
                          {requestRow.customDurationMinutes
                            ? `${requestRow.customDurationMinutes} min`
                            : requestRow.lessonDuration === "min30"
                              ? "30 min"
                              : "60 min"}
                          {requestRow.status === "waitlisted" ? (
                            <>
                              {" "}
                              <span className={cx(styles["chip"], styles["chip-info"])}>Waitlisted</span>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={cx("helper-text", styles["pending-empty"])}>No pending requests.</p>
                  )}
                </div>
              </aside>
            </div>
          </section>

          <div className={styles["portal-grid"]}>
            <section className={cx("admin-card", styles["upcoming-panel"])}>
              <h2 className={styles["panel-title"]}>Upcoming appointments</h2>
              <div className={styles["upcoming-viewport"]}>
                <BookingList
                  bookings={data.upcoming}
                  emptyMessage="No upcoming appointments."
                  variant="upcoming"
                  cancellingBookingId={cancellingBookingId}
                  cancelledBookingIds={cancelledBookingIds}
                  onCancelBooking={(bookingId) => setConfirmCancelBookingId(bookingId)}
                  rescheduleBookingId={rescheduleBookingId}
                  rescheduleStartAtLocal={rescheduleStartAtLocal}
                  rescheduleReason={rescheduleReason}
                  submittingRescheduleId={submittingRescheduleId}
                  onOpenReschedule={(bookingId) => {
                    setRescheduleStartAtLocal(defaultStartAtLocalValue());
                    setRescheduleReason("");
                    setRescheduleBookingId(bookingId);
                  }}
                  onCloseReschedule={() => setRescheduleBookingId(null)}
                  onRescheduleStartAtChange={setRescheduleStartAtLocal}
                  onRescheduleReasonChange={setRescheduleReason}
                  onSubmitReschedule={(bookingId) => void submitRescheduleRequest(bookingId)}
                />
              </div>
            </section>
            <section className={cx("admin-card", styles["previous-panel"])}>
              <h2 className={styles["panel-title"]}>Previous appointments</h2>
              <BookingList
                bookings={data.previous}
                standaloneMaterials={data.standaloneMaterials || []}
                emptyMessage="No previous appointments."
                variant="previous"
              />
            </section>
          </div>
        </>
      ) : null}
      <ConfirmDialog
        open={confirmCancelBookingId !== null}
        title="Cancel Lesson"
        description={"Cancel this lesson?\n\nIf less than 24 hours notice is given, the full lesson fee is still payable. If more than 24 hours notice is given, a make-up lesson will be provided within the same week."}
        confirmLabel="Cancel Lesson"
        cancelLabel="Keep Lesson"
        destructive
        onConfirm={() => { const id = confirmCancelBookingId; setConfirmCancelBookingId(null); if (id) void cancelBookingById(id); }}
        onCancel={() => setConfirmCancelBookingId(null)}
      />
    </div>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

/**
 * Renders one portal booking list section with nested learning materials.
 */
type BookingListProps = {
  bookings: StudentPortalBooking[];
  standaloneMaterials?: StudentPortalMaterial[];
  emptyMessage: string;
  variant: "upcoming" | "previous";
  cancellingBookingId?: string | null;
  cancelledBookingIds?: Record<string, boolean>;
  onCancelBooking?: (bookingId: string) => void;
  // Reschedule controls (upcoming variant only). The open form is keyed by booking id.
  rescheduleBookingId?: string | null;
  rescheduleStartAtLocal?: string;
  rescheduleReason?: string;
  submittingRescheduleId?: string | null;
  onOpenReschedule?: (bookingId: string) => void;
  onCloseReschedule?: () => void;
  onRescheduleStartAtChange?: (value: string) => void;
  onRescheduleReasonChange?: (value: string) => void;
  onSubmitReschedule?: (bookingId: string) => void;
};

function BookingList(input: BookingListProps) {
  const standaloneMaterials = input.standaloneMaterials || [];
  if (!input.bookings.length && !(input.variant === "previous" && standaloneMaterials.length)) {
    return <p className="helper-text">{input.emptyMessage}</p>;
  }

  return (
    <div className={styles["booking-list"]}>
      {input.bookings.map((booking) => (
        <article className={cx("booking-item", styles["booking-item"])} key={booking.id}>
          <div className={styles["booking-head"]}>
            <strong className={styles["booking-heading"]}>{formatWhen(booking.startAt)}</strong>
          </div>

          <div className={styles["booking-chip-row"]}>
            <span className={styles["chip"]}>{describeDuration(booking)}</span>
            <span className={styles["chip"]}>{booking.lessonMode === "in_person" ? "In-person" : "Video"}</span>
            <span className={cx(styles["chip"], booking.status === "cancelled" ? styles["chip-cancelled"] : styles["chip-approved"])}>
              {describeBookingStatus(booking.status)}
            </span>
            {isWithin24Hours(booking.startAt) && booking.status !== "cancelled" ? (
              <span className={cx(styles["chip"], styles["chip-warning"])}>Within 24h — full fee</span>
            ) : null}
            {input.cancelledBookingIds?.[booking.id] ? <span className={cx(styles["chip"], styles["chip-success"])}>Cancelled</span> : null}
            {booking.pendingReschedule ? (
              <span className={cx(styles["chip"], styles["chip-warning"])}>
                Reschedule requested: {formatWhen(booking.pendingReschedule.requestedStartAt)}
              </span>
            ) : null}
          </div>

          {input.variant === "upcoming" && booking.status !== "cancelled" ? (
            <div className={styles["booking-actions"]}>
              <Tooltip content="Cancel this upcoming lesson. A confirmation prompt will be shown first.">
                <button
                  className={cx(
                    "btn",
                    "btn-danger",
                    styles["cancel-button"],
                    isWithin24Hours(booking.startAt) && styles["cancel-button-warning"]
                  )}
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
              </Tooltip>
              {booking.pendingReschedule ? (
                <span className="helper-text">Reschedule request pending review.</span>
              ) : input.rescheduleBookingId === booking.id ? null : (
                <Tooltip content="Request a new time for this lesson. The admin will confirm before it changes.">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={!!input.submittingRescheduleId}
                    onClick={() => input.onOpenReschedule?.(booking.id)}
                  >
                    Request reschedule
                  </button>
                </Tooltip>
              )}
            </div>
          ) : null}

          {input.variant === "upcoming" &&
          booking.status !== "cancelled" &&
          !booking.pendingReschedule &&
          input.rescheduleBookingId === booking.id ? (
            <form
              className={styles["reschedule-form"]}
              onSubmit={(event) => {
                event.preventDefault();
                input.onSubmitReschedule?.(booking.id);
              }}
            >
              <label className={styles["reschedule-field"]}>
                <span>New lesson time</span>
                <input
                  type="datetime-local"
                  required
                  value={input.rescheduleStartAtLocal ?? ""}
                  onChange={(event) => input.onRescheduleStartAtChange?.(event.target.value)}
                />
              </label>
              <label className={styles["reschedule-field"]}>
                <span>Reason (optional)</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={input.rescheduleReason ?? ""}
                  onChange={(event) => input.onRescheduleReasonChange?.(event.target.value)}
                />
              </label>
              <div className={styles["reschedule-actions"]}>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={input.submittingRescheduleId === booking.id}
                >
                  {input.submittingRescheduleId === booking.id ? "Submitting..." : "Submit request"}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={input.submittingRescheduleId === booking.id}
                  onClick={() => input.onCloseReschedule?.()}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {booking.notesContent ? (
            <details className={styles["booking-details"]} open>
              <summary>Lesson notes</summary>
              <BookingNotesViewer
                notesContent={booking.notesContent}
                bookingId={booking.id}
              />
            </details>
          ) : booking.notes ? (
            <details className={styles["booking-details"]}>
              <summary>Lesson notes</summary>
              <p>{booking.notes}</p>
            </details>
          ) : null}

          {booking.lessonPlanSummary ? (
            <div className={styles["lesson-plan-summary"]}>
              <strong className={styles["materials-section-title"]}>Lesson plan summary</strong>
              <LessonPlanViewer
                sections={booking.lessonPlanSummary.sections}
                quickCaptureNotes={booking.lessonPlanSummary.quickCaptureNotes}
                bookingId={booking.id}
              />
            </div>
          ) : null}

          <div className={styles["materials-group"]}>
            <strong className={styles["materials-section-title"]}>Learning materials</strong>
            {booking.materials.length ? (
              <ul className={styles["material-list"]}>
                {booking.materials.map((material) => (
                  <li className={styles["material-item"]} key={material.id}>
                    <span className={styles["material-title"]}>
                      <span>{material.description || material.title} ({material.materialType.toUpperCase()})</span>
                      {material.description ? (
                        <span className={cx("helper-text", styles["material-title-secondary"])}>{material.title}</span>
                      ) : null}
                    </span>
                    <span className={styles["material-actions"]}>
                      {material.materialType === "audio" ? (
                        <audio
                          className={cx("material-audio-player", styles["audio-player"])}
                          controls
                          preload="metadata"
                          src={material.previewUrl}
                        />
                      ) : (
                        <Tooltip content="Preview this file in a new browser tab.">
                          <a className="btn btn-secondary" href={material.previewUrl} target="_blank" rel="noreferrer">
                            Preview
                          </a>
                        </Tooltip>
                      )}
                      <Tooltip content="Download this file to your device.">
                        <a className="btn btn-secondary" href={material.downloadUrl}>
                          Download
                        </a>
                      </Tooltip>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles["chip"]}>No materials yet</span>
            )}
          </div>
        </article>
      ))}
      {input.variant === "previous" ? (
        <article className={cx("booking-item", styles["booking-item"])}>
          <div className={styles["booking-head"]}>
            <strong className={styles["booking-heading"]}>General learning materials</strong>
          </div>
          <div className={styles["materials-group"]}>
            {standaloneMaterials.length ? (
              <ul className={styles["material-list"]}>
                {standaloneMaterials.map((material) => (
                  <li className={styles["material-item"]} key={`general-${material.id}`}>
                    <span className={styles["material-title"]}>
                      <span>{material.description || material.title} ({material.materialType.toUpperCase()})</span>
                      {material.description ? (
                        <span className={cx("helper-text", styles["material-title-secondary"])}>{material.title}</span>
                      ) : null}
                    </span>
                    <span className={styles["material-actions"]}>
                      {material.materialType === "audio" ? (
                        <audio
                          className={cx("material-audio-player", styles["audio-player"])}
                          controls
                          preload="metadata"
                          src={material.previewUrl}
                        />
                      ) : (
                        <Tooltip content="Preview this file in a new browser tab.">
                          <a className="btn btn-secondary" href={material.previewUrl} target="_blank" rel="noreferrer">
                            Preview
                          </a>
                        </Tooltip>
                      )}
                      <Tooltip content="Download this file to your device.">
                        <a className="btn btn-secondary" href={material.downloadUrl}>
                          Download
                        </a>
                      </Tooltip>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles["chip"]}>No general materials</span>
            )}
          </div>
        </article>
      ) : null}
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
    timeZone: APP_TIMEZONE
  }).format(date);
}

/**
 * Displays lesson duration, preferring custom minute values when available.
 */
function describeDuration(booking: StudentPortalBooking): string {
  if (booking.customDurationMinutes && booking.customDurationMinutes > 0) {
    return `${booking.customDurationMinutes} min`;
  }
  return booking.lessonDuration === "min30" ? "30 min" : "60 min";
}

/**
 * Maps a raw booking status enum to title-case display copy that matches the
 * admin calendar legend wording (e.g. "approved" => "Confirmed").
 */
function describeBookingStatus(status: string): string {
  switch (status) {
    case "approved":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    case "pending":
      return "Pending";
    case "waitlisted":
      return "Waitlisted";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
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
  return toDateTimeLocalValue(date);
}

/**
 * Converts `datetime-local` input values to ISO timestamps for API requests.
 */
function toIsoFromLocal(value: string): string | null {
  return dateTimeLocalToIso(value);
}

