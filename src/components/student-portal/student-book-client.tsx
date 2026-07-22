"use client";

import { useRouter } from "next/navigation";
import { type ReactElement, useEffect, useState } from "react";
import { z } from "zod";

import { APP_TIMEZONE, toDateKey } from "@/lib/time";

import styles from "./student-book-client.module.css";

const bookingSlotSchema = z.object({
  startAt: z.string(),
  endAt: z.string()
});

const bookingSlotsResponseSchema = z.object({
  teacher: z.object({ id: z.string(), name: z.string() }).nullable(),
  durationOptions: z.array(z.number().int().positive()),
  slots: z.array(bookingSlotSchema)
});

type BookingSlot = z.infer<typeof bookingSlotSchema>;

/**
 * Self-service lesson request against the student's assigned teacher only
 * (`Customer.primaryTeacherId`). Availability is derived server-side —
 * business hours minus that teacher's existing bookings — so this client
 * only ever renders what `GET /api/student/booking-slots` returns for one
 * calendar day at a time.
 *
 * Selecting a slot creates a PENDING BookingRequest, never a confirmed
 * Booking — the owner still approves it. Every state below (loading,
 * no-teacher, empty day, submit failure) says so plainly so a student never
 * mistakes a request for a confirmed lesson.
 */
export function StudentBookClient(): ReactElement {
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  // undefined = teacher assignment not yet known; null = confirmed no teacher assigned.
  const [teacher, setTeacher] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [durationOptions, setDurationOptions] = useState<number[]>([]);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingSlots(true);
      setSlotsError("");

      const params = new URLSearchParams({ date: selectedDate });
      // Duration isn't known on the very first request (durationOptions comes
      // back from this same endpoint) — omit it and pick a default once the
      // response arrives, which re-triggers this effect with a real value.
      if (selectedDuration != null) {
        params.set("durationMinutes", String(selectedDuration));
      }

      const response = await fetch(`/api/student/booking-slots?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401) {
        router.push("/student/login");
        router.refresh();
        return;
      }
      if (cancelled) return;
      if (!response.ok) {
        setLoadingSlots(false);
        setSlotsError("Unable to load available times right now.");
        return;
      }

      const rawPayload = await response.json().catch(() => null);
      const parsed = bookingSlotsResponseSchema.safeParse(rawPayload);
      if (cancelled) return;
      if (!parsed.success) {
        setLoadingSlots(false);
        setSlotsError("Unable to load available times right now.");
        return;
      }

      setTeacher(parsed.data.teacher);
      setDurationOptions(parsed.data.durationOptions);
      // Slots computed for no particular duration aren't meaningful to show —
      // wait for the follow-up request that carries a real durationMinutes.
      if (selectedDuration != null) {
        setSlots(parsed.data.slots);
      }
      setLoadingSlots(false);

      if (selectedDuration == null && parsed.data.durationOptions.length > 0) {
        setSelectedDuration(parsed.data.durationOptions[0]);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedDuration, router, reloadTick]);

  async function submitRequest() {
    if (!selectedSlot || selectedDuration == null) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const response = await fetch("/api/student/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestedStartAt: selectedSlot.startAt,
        durationMinutes: selectedDuration
      })
    });
    setSubmitting(false);

    if (response.status === 401) {
      router.push("/student/login");
      router.refresh();
      return;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setSubmitError(payload?.error || "Unable to submit this lesson request. Please try again.");
      return;
    }

    setSuccessNotice(
      `Lesson request submitted for ${formatSlotWhen(selectedSlot.startAt)}. It is now pending owner approval — this is not a confirmed lesson yet.`
    );
    setSelectedSlot(null);
    // Re-fetch: another student's request may have been approved into a real
    // booking while this one was in flight.
    setReloadTick((tick) => tick + 1);
  }

  return (
    <div className={styles["shell"]}>
      <div className={cx("admin-card", styles["panel"])}>
        <h2 className={styles["title"]}>Book a lesson</h2>
        <p className="helper-text">
          Choose a time below to request a lesson with your teacher. This sends a pending request — the school
          still needs to approve it before it becomes a confirmed lesson.
        </p>

        {teacher === undefined ? (
          <p className="helper-text">Loading your teacher&apos;s availability…</p>
        ) : teacher === null ? (
          <p className="notice" role="status">
            You don&apos;t have an assigned teacher yet. Please contact the school to be assigned a teacher before
            booking a lesson.
          </p>
        ) : (
          <>
            <div className={styles["controls-row"]}>
              <div className="field">
                <label htmlFor="booking-date">Date</label>
                <input
                  id="booking-date"
                  type="date"
                  className={styles["control"]}
                  min={toDateKey(new Date())}
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setSelectedSlot(null);
                    setSuccessNotice("");
                  }}
                />
              </div>
              {durationOptions.length > 1 ? (
                <div className="field">
                  <label htmlFor="booking-duration">Lesson length</label>
                  <select
                    id="booking-duration"
                    className={styles["control"]}
                    value={selectedDuration ?? ""}
                    onChange={(event) => {
                      setSelectedDuration(Number(event.target.value));
                      setSelectedSlot(null);
                      setSuccessNotice("");
                    }}
                  >
                    {durationOptions.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </div>
              ) : durationOptions.length === 1 ? (
                <p className="helper-text">Lesson length: {durationOptions[0]} minutes</p>
              ) : null}
            </div>

            {slotsError ? <p className="notice error" role="alert">{slotsError}</p> : null}

            {loadingSlots ? (
              <p className="helper-text">Loading available times…</p>
            ) : !slotsError && slots.length === 0 ? (
              <p className="helper-text">No available times on this day. Try another day.</p>
            ) : slots.length > 0 ? (
              <div className={styles["slot-grid"]} aria-busy={loadingSlots}>
                {slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    className={cx(styles["slot"], selectedSlot?.startAt === slot.startAt && styles["slot-selected"])}
                    aria-pressed={selectedSlot?.startAt === slot.startAt}
                    onClick={() => {
                      setSelectedSlot(slot);
                      setSubmitError("");
                    }}
                  >
                    {formatSlotTime(slot.startAt)}
                  </button>
                ))}
              </div>
            ) : null}

            {selectedSlot ? (
              <div className={styles["confirm-panel"]} role="group" aria-label="Confirm lesson request">
                <p>
                  Request a lesson at <strong>{formatSlotWhen(selectedSlot.startAt)}</strong>
                  {selectedDuration ? ` (${selectedDuration} min)` : ""}?
                </p>
                <p className="helper-text">
                  This sends a request only — the school still needs to approve it before it&apos;s a confirmed lesson.
                </p>
                {submitError ? <p className="notice error" role="alert">{submitError}</p> : null}
                <div className={styles["confirm-actions"]}>
                  <button
                    type="button"
                    className={cx("btn", "btn-primary", styles["control"])}
                    onClick={submitRequest}
                    disabled={submitting}
                  >
                    {submitting ? "Submitting…" : "Request this lesson"}
                  </button>
                  <button
                    type="button"
                    className={cx("btn", "btn-secondary", styles["control"])}
                    onClick={() => setSelectedSlot(null)}
                    disabled={submitting}
                  >
                    Choose a different time
                  </button>
                </div>
              </div>
            ) : null}

            {successNotice ? <p className="notice success" role="status">{successNotice}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Formats a slot's start time for a button label, e.g. "9:00 am". */
function formatSlotTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeStyle: "short", timeZone: APP_TIMEZONE }).format(new Date(iso));
}

/** Formats a slot's start time for confirmation copy, e.g. "22 Jul 2026, 9:00 am". */
function formatSlotWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE
  }).format(new Date(iso));
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
