"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBookingCalendar, AdminCalendarEvent } from "@/components/admin-booking-calendar";
import { animateIn, animateOut } from "@/components/motion/tween-orchestrator";
import { usePresenceExit } from "@/components/motion/use-presence-exit";

type CalendarView = "day" | "week" | "month";
type AuState = "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";
type DurationChoice = "min30" | "min60" | "custom";
const AU_STATES: AuState[] = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const PHONE_PATTERN = /^\d{10}$/;
const POSTCODE_PATTERN = /^\d{4}$/;

type BookingRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  unitNumber: string | null;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  lessonMode: "in_person" | "video";
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  status: "approved" | "cancelled";
  startAt: string;
  notes: string | null;
  seriesId: string | null;
};

type BookingRequestRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  unitNumber: string | null;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  lessonMode: "in_person" | "video";
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  status: "pending" | "rejected" | "approved" | "cancelled";
  requestedStartAt: string;
  notes: string | null;
};

type EventWithRow = AdminCalendarEvent & {
  row: BookingRow | BookingRequestRow;
};

type DialogForm = {
  name: string;
  email: string;
  phone: string;
  unitNumber: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: AuState;
  postcode: string;
  lessonMode: "in_person" | "video";
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: string;
  durationChoice: DurationChoice;
  startAtLocal: string;
  notes: string;
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDateTimeLocalValue(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function toIsoFromLocal(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function selectedEventKey(event: AdminCalendarEvent | null): string | null {
  if (!event) {
    return null;
  }
  return `${event.entityType}:${event.id}`;
}

function toAuState(value: string): AuState {
  return AU_STATES.includes(value as AuState) ? (value as AuState) : "VIC";
}

function toDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

function validateDialogForm(form: DialogForm): string | null {
  const email = form.email.trim();
  const name = form.name.trim();
  const phone = form.phone.trim();
  const houseNumber = form.houseNumber.trim();
  const streetName = form.streetName.trim();
  const streetType = form.streetType.trim();
  const suburb = form.suburb.trim();
  const postcode = form.postcode.trim();

  if (!name) {
    return "Name is required.";
  }
  if (!email || !email.includes("@")) {
    return "A valid email address is required.";
  }
  if (!PHONE_PATTERN.test(phone)) {
    return "Contact number must be exactly 10 digits.";
  }
  if (!houseNumber || !streetName || !streetType || !suburb) {
    return "Complete address is required.";
  }
  if (!POSTCODE_PATTERN.test(postcode)) {
    return "Postcode must be exactly 4 digits.";
  }
  if (form.durationChoice === "custom") {
    const custom = Number.parseInt(form.customDurationMinutes || "", 10);
    if (!Number.isFinite(custom) || custom < 15 || custom > 300) {
      return "Custom duration must be between 15 and 300 minutes.";
    }
  }
  return null;
}

function defaultFormFromEvent(event: EventWithRow): DialogForm {
  const row = event.row;
  const startAt = event.entityType === "booking" ? (row as BookingRow).startAt : (row as BookingRequestRow).requestedStartAt;

  return {
    name: row.name,
    email: row.email,
    phone: toDigits(row.phone, 10),
    unitNumber: row.unitNumber ?? "",
    houseNumber: row.houseNumber ?? "",
    streetName: row.streetName ?? "",
    streetType: row.streetType ?? "",
    suburb: row.suburb ?? "",
    state: toAuState(row.state),
    postcode: row.postcode ?? "",
    lessonMode: row.lessonMode,
    skillLevel: row.skillLevel,
    lessonDuration: row.lessonDuration,
    customDurationMinutes: row.customDurationMinutes ? String(row.customDurationMinutes) : "",
    durationChoice: row.customDurationMinutes ? "custom" : row.lessonDuration,
    startAtLocal: toDateTimeLocalValue(startAt),
    notes: row.notes ?? ""
  };
}

export function AdminBookingsClient() {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>("week");
  const [date, setDate] = useState<string>(toDateInputValue(new Date()));
  const [events, setEvents] = useState<EventWithRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithRow | null>(null);
  const [dialogForm, setDialogForm] = useState<DialogForm | null>(null);
  const [manualDurationChoice, setManualDurationChoice] = useState<DurationChoice>("min60");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const dialogPresence = usePresenceExit();
  const emailDialogPresence = usePresenceExit();
  const dialogRootRef = useRef<HTMLDivElement | null>(null);
  const emailDialogRootRef = useRef<HTMLDivElement | null>(null);
  const calendarRootRef = useRef<HTMLDivElement | null>(null);

  const rangeLabel = useMemo(() => `${view.toUpperCase()} VIEW`, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const bookingRes = await fetch(`/api/admin/bookings?view=${view}&date=${date}`, { cache: "no-store" });
    if (!bookingRes.ok) {
      setLoading(false);
      setError("Unable to load admin data. Please sign in again.");
      return;
    }
    const bookingData = await bookingRes.json();
    setEvents(bookingData.events || []);
    setLoading(false);
  }, [date, view]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [load]);

  useEffect(() => {
    if (!dialogPresence.isMounted || !dialogRootRef.current) {
      return;
    }
    void animateIn(dialogRootRef.current, { scope: "admin" });
  }, [dialogPresence.isMounted, selectedEvent?.id]);

  useEffect(() => {
    if (!emailDialogPresence.isMounted || !emailDialogRootRef.current) {
      return;
    }
    void animateIn(emailDialogRootRef.current, { scope: "admin" });
  }, [emailDialogPresence.isMounted]);

  useEffect(() => {
    if (loading || !calendarRootRef.current) {
      return;
    }
    void animateIn(calendarRootRef.current, { scope: "calendar" });
  }, [events, loading, view, date]);

  function openDialog(event: EventWithRow) {
    setNotice("");
    setSelectedEvent(event);
    setDialogForm(defaultFormFromEvent(event));
    setEmailSubject("");
    setEmailMessage("");
    emailDialogPresence.hide(undefined, { immediate: true });
    dialogPresence.show();
  }

  async function closeDialog() {
    if (emailDialogPresence.isMounted) {
      await closeEmailDialog();
    }

    setBusyAction(null);
    if (dialogRootRef.current) {
      await animateOut(dialogRootRef.current, { scope: "admin" });
    }
    dialogPresence.hide(
      () => {
        setSelectedEvent(null);
        setDialogForm(null);
        setEmailSubject("");
        setEmailMessage("");
      },
      { immediate: true }
    );
  }

  function openEmailDialog() {
    setEmailSubject("");
    setEmailMessage("");
    emailDialogPresence.show();
  }

  async function closeEmailDialog() {
    if (emailDialogRootRef.current) {
      await animateOut(emailDialogRootRef.current, { scope: "admin" });
    }
    emailDialogPresence.hide(undefined, { immediate: true });
    setEmailSubject("");
    setEmailMessage("");
  }

  async function mutateBooking(action: "edit" | "move" | "cancel", body: Record<string, unknown>) {
    if (!selectedEvent || selectedEvent.entityType !== "booking") {
      return false;
    }
    const response = await fetch(`/api/admin/bookings/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Booking update failed.");
      return false;
    }
    return true;
  }

  async function mutateRequest(action: "approve" | "reject" | "cancel" | "edit" | "move", body: Record<string, unknown>) {
    if (!selectedEvent || selectedEvent.entityType !== "booking_request") {
      return false;
    }
    const response = await fetch(`/api/admin/booking-requests/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Pending request update failed.");
      return false;
    }
    return true;
  }

  async function sendNotification(action: "reminder" | "custom", custom?: { subject: string; message: string }) {
    if (!selectedEvent) {
      return;
    }

    if (action === "custom" && (!custom?.subject.trim() || !custom?.message.trim())) {
      setError("Custom email requires both subject and message.");
      return;
    }

    setBusyAction(action);
    const endpoint =
      selectedEvent.entityType === "booking"
        ? `/api/admin/bookings/${selectedEvent.id}/notify`
        : `/api/admin/booking-requests/${selectedEvent.id}/notify`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        subject: custom?.subject,
        message: custom?.message
      })
    });
    setBusyAction(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Notification failed.");
      return;
    }
    setNotice(action === "reminder" ? "Reminder sent." : "Custom email sent.");
    if (action === "custom") {
      await closeEmailDialog();
    }
    await load();
  }

  async function saveDetails() {
    if (!selectedEvent || !dialogForm) {
      return;
    }

    const validationError = validateDialogForm(dialogForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    const requestedStartAt = toIsoFromLocal(dialogForm.startAtLocal);
    if (selectedEvent.entityType === "booking_request" && !requestedStartAt) {
      setError("Please enter a valid date and time.");
      return;
    }

    setBusyAction("save");
    const lessonDuration = dialogForm.durationChoice === "min30" ? "min30" : "min60";
    const customDurationMinutes =
      dialogForm.durationChoice === "custom"
        ? Number.parseInt(dialogForm.customDurationMinutes || "", 10)
        : null;
    const payload = {
      name: dialogForm.name.trim(),
      email: dialogForm.email.trim(),
      phone: toDigits(dialogForm.phone.trim(), 10),
      unitNumber: dialogForm.unitNumber.trim() || null,
      houseNumber: dialogForm.houseNumber.trim(),
      streetName: dialogForm.streetName.trim(),
      streetType: dialogForm.streetType.trim(),
      suburb: dialogForm.suburb.trim(),
      state: dialogForm.state,
      postcode: dialogForm.postcode.trim(),
      lessonMode: dialogForm.lessonMode,
      skillLevel: dialogForm.skillLevel,
      lessonDuration,
      customDurationMinutes,
      notes: dialogForm.notes.trim() ? dialogForm.notes.trim() : null
    };

    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("edit", payload)
        : await mutateRequest("edit", {
            ...payload,
            requestedStartAt
          });

    setBusyAction(null);
    if (!ok) {
      return;
    }
    setNotice("Details saved.");
    await load();
  }

  async function moveSelected() {
    if (!selectedEvent || !dialogForm) {
      return;
    }
    const newStartAt = toIsoFromLocal(dialogForm.startAtLocal);
    if (!newStartAt) {
      setError("Please enter a valid date and time.");
      return;
    }

    setBusyAction("move");
    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("move", { newStartAt })
        : await mutateRequest("move", { newStartAt });
    setBusyAction(null);
    if (!ok) {
      return;
    }
    setNotice("Booking moved.");
    await load();
  }

  async function cancelSelected() {
    if (!selectedEvent) {
      return;
    }
    setBusyAction("cancel");
    const ok =
      selectedEvent.entityType === "booking"
        ? await mutateBooking("cancel", {})
        : await mutateRequest("cancel", {});
    setBusyAction(null);
    if (!ok) {
      return;
    }
    await closeDialog();
    await load();
  }

  async function approveSelected(action: "approve" | "reject") {
    if (!selectedEvent || selectedEvent.entityType !== "booking_request") {
      return;
    }
    setBusyAction(action);
    const ok = await mutateRequest(action, {});
    setBusyAction(null);
    if (!ok) {
      return;
    }
    await closeDialog();
    await load();
  }

  async function removeSeries(seriesId: string) {
    const response = await fetch(`/api/admin/booking-series/${seriesId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Unable to remove series.");
      return;
    }
    await closeDialog();
    await load();
  }

  async function addManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    const firstName = String(form.get("firstName") || "").trim();
    const middleName = String(form.get("middleName") || "").trim();
    const lastName = String(form.get("lastName") || "").trim();
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    const phone = toDigits(String(form.get("phone") || ""), 10);
    const customDurationRaw = String(form.get("customDurationMinutes") || "");
    const customDurationMinutes =
      manualDurationChoice === "custom" && customDurationRaw ? Number.parseInt(customDurationRaw, 10) : undefined;
    const payload = {
      name: fullName,
      email: String(form.get("email") || ""),
      phone,
      unitNumber: String(form.get("unitNumber") || ""),
      houseNumber: String(form.get("houseNumber") || ""),
      streetName: String(form.get("streetName") || ""),
      streetType: String(form.get("streetType") || ""),
      suburb: String(form.get("suburb") || ""),
      state: String(form.get("state") || ""),
      postcode: String(form.get("postcode") || ""),
      lessonMode: String(form.get("lessonMode") || ""),
      skillLevel: String(form.get("skillLevel") || ""),
      lessonDuration: manualDurationChoice === "min30" ? "min30" : "min60",
      customDurationMinutes,
      requestedStartAt: new Date(String(form.get("requestedStartAt") || "")).toISOString(),
      isRecurring: Boolean(form.get("isRecurring")),
      recurrenceEndAt: form.get("recurrenceEndAt")
        ? new Date(String(form.get("recurrenceEndAt") || "")).toISOString()
        : undefined
    };

    const response = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setCreating(false);
    if (!response.ok) {
      const payloadResponse = await response.json().catch(() => null);
      setError(payloadResponse?.error || "Manual booking create failed.");
      return;
    }
    formElement.reset();
    setManualDurationChoice("min60");
    setNotice("Manual booking added.");
    await load();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const selectedKey = selectedEventKey(selectedEvent);
  const selectedIsPending = selectedEvent?.entityType === "booking_request";
  const selectedSeriesId =
    selectedEvent && selectedEvent.entityType === "booking"
      ? ((selectedEvent.row as BookingRow).seriesId ?? null)
      : null;

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <div className="admin-card booking-row" data-motion-item="admin-header-card">
        <h1 style={{ marginRight: "auto", fontSize: "1.3rem" }} data-motion-item="admin-title">
          Owner Booking Console
        </h1>
        <button className="btn btn-secondary" data-motion-item="admin-logout" onClick={() => void logout()}>
          Sign out
        </button>
      </div>

      <div className="admin-card booking-row" data-motion-item="admin-range-card">
        <strong data-motion-item="admin-range-label">{rangeLabel}</strong>
        <label data-motion-item="admin-view-select">
          View{" "}
          <select value={view} onChange={(e) => setView(e.target.value as CalendarView)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <label data-motion-item="admin-date-select">
          Base date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="admin-card calendar-legend" data-motion-item="admin-legend-card">
        <span className="legend-chip event-green" data-motion-item="legend-confirmed">
          Confirmed
        </span>
        <span className="legend-chip event-yellow" data-motion-item="legend-pending">
          Pending
        </span>
        <span className="legend-chip event-red" data-motion-item="legend-rejected">
          Rejected (48h)
        </span>
        <span className="legend-chip event-slate" data-motion-item="legend-cancelled">
          Cancelled (48h)
        </span>
      </div>

      {error ? (
        <p className="notice error" data-motion-item="admin-error-notice">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice success" data-motion-item="admin-success-notice">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <p className="notice" data-motion-item="admin-loading-notice">
          Loading...
        </p>
      ) : null}

      <div
        className="admin-card"
        ref={calendarRootRef}
        data-motion-root="calendar"
        data-motion-item="admin-calendar-card"
      >
        <AdminBookingCalendar
          view={view}
          date={date}
          events={events}
          selectedEventId={selectedKey}
          onSelect={(event) => openDialog(event as EventWithRow)}
        />
      </div>

      <div className="admin-card" data-motion-item="manual-booking-card">
        <h2 data-motion-item="manual-booking-title">Add Manual Booking</h2>
        <form className="manual-booking-form" onSubmit={addManualBooking} data-motion-item="manual-booking-form">
          <section className="manual-section" data-motion-item="manual-student-section">
            <h3 className="manual-section-title" data-motion-item="manual-student-title">
              Student
            </h3>
            <div className="manual-grid manual-grid-3" data-motion-item="manual-student-grid">
              <div className="field">
                <label>First Name *</label>
                <input name="firstName" required />
              </div>
              <div className="field">
                <label>Middle Name</label>
                <input name="middleName" />
              </div>
              <div className="field">
                <label>Last Name *</label>
                <input name="lastName" required />
              </div>
            </div>
          </section>

          <section className="manual-section" data-motion-item="manual-contact-section">
            <h3 className="manual-section-title" data-motion-item="manual-contact-title">
              Contact
            </h3>
            <div className="manual-grid manual-grid-3" data-motion-item="manual-contact-grid">
              <div className="field manual-span-2">
                <label>Email *</label>
                <input name="email" type="email" required />
              </div>
              <div className="field field-compact">
                <label>Phone *</label>
                <input
                  name="phone"
                  required
                  maxLength={10}
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  placeholder="10 digits"
                  title="Phone must be exactly 10 digits"
                  onInput={(event) => {
                    event.currentTarget.value = toDigits(event.currentTarget.value, 10);
                  }}
                />
              </div>
            </div>
          </section>

          <section className="manual-section" data-motion-item="manual-address-section">
            <h3 className="manual-section-title" data-motion-item="manual-address-title">
              Address
            </h3>
            <div className="manual-grid manual-grid-3" data-motion-item="manual-address-grid">
              <div className="field field-compact">
                <label>Unit/Apartment</label>
                <input
                  name="unitNumber"
                  maxLength={5}
                  inputMode="numeric"
                  pattern="[0-9]{1,5}"
                  onInput={(event) => {
                    event.currentTarget.value = toDigits(event.currentTarget.value, 5);
                  }}
                />
              </div>
              <div className="field field-compact">
                <label>House/Building Number *</label>
                <input
                  name="houseNumber"
                  required
                  maxLength={5}
                  inputMode="numeric"
                  pattern="[0-9]{1,5}"
                  onInput={(event) => {
                    event.currentTarget.value = toDigits(event.currentTarget.value, 5);
                  }}
                />
              </div>
              <div className="field">
                <label>Street Type *</label>
                <select name="streetType" required defaultValue="">
                  <option value="" disabled>
                    Select street type
                  </option>
                  <option value="Street">Street</option>
                  <option value="Road">Road</option>
                  <option value="Avenue">Avenue</option>
                  <option value="Drive">Drive</option>
                  <option value="Lane">Lane</option>
                  <option value="Court">Court</option>
                  <option value="Crescent">Crescent</option>
                  <option value="Place">Place</option>
                  <option value="Boulevard">Boulevard</option>
                  <option value="Terrace">Terrace</option>
                  <option value="Parade">Parade</option>
                  <option value="Close">Close</option>
                </select>
              </div>
              <div className="field manual-span-2">
                <label>Street Name *</label>
                <input name="streetName" required />
              </div>
              <div className="field">
                <label>Suburb *</label>
                <input name="suburb" required />
              </div>
              <div className="field manual-span-2">
                <label>State *</label>
                <select name="state" required defaultValue="VIC">
                  <option value="ACT">Australian Capital Territory</option>
                  <option value="NSW">New South Wales</option>
                  <option value="NT">Northern Territory</option>
                  <option value="QLD">Queensland</option>
                  <option value="SA">South Australia</option>
                  <option value="TAS">Tasmania</option>
                  <option value="VIC">Victoria</option>
                  <option value="WA">Western Australia</option>
                </select>
              </div>
              <div className="field field-compact">
                <label>Postcode *</label>
                <input
                  name="postcode"
                  required
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  placeholder="3000"
                  title="Postcode must be 4 digits"
                  onInput={(event) => {
                    event.currentTarget.value = toDigits(event.currentTarget.value, 4);
                  }}
                />
              </div>
            </div>
          </section>

          <section className="manual-section" data-motion-item="manual-lesson-section">
            <h3 className="manual-section-title" data-motion-item="manual-lesson-title">
              Lesson
            </h3>
            <div className="manual-grid manual-grid-3" data-motion-item="manual-lesson-grid">
              <div className="field">
                <label>Mode *</label>
                <select name="lessonMode" defaultValue="in_person">
                  <option value="in_person">In-person</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div className="field">
                <label>Skill Level *</label>
                <select name="skillLevel" defaultValue="beginner">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className="field">
                <label>Duration *</label>
                <select
                  value={manualDurationChoice}
                  onChange={(event) => setManualDurationChoice(event.target.value as DurationChoice)}
                >
                  <option value="min30">30 minutes</option>
                  <option value="min60">60 minutes</option>
                  <option value="custom">Other amount</option>
                </select>
              </div>
              {manualDurationChoice === "custom" ? (
                <div className="field field-compact">
                  <label>Custom Duration (minutes) *</label>
                  <input
                    name="customDurationMinutes"
                    required
                    maxLength={3}
                    inputMode="numeric"
                    pattern="[0-9]{2,3}"
                    placeholder="e.g. 45"
                    onInput={(event) => {
                      event.currentTarget.value = toDigits(event.currentTarget.value, 3);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="manual-section" data-motion-item="manual-schedule-section">
            <h3 className="manual-section-title" data-motion-item="manual-schedule-title">
              Schedule
            </h3>
            <div className="manual-grid manual-grid-2" data-motion-item="manual-schedule-grid">
              <div className="field">
                <label>Start *</label>
                <input name="requestedStartAt" type="datetime-local" required />
              </div>
              <div className="field">
                <label>Recurrence end</label>
                <input name="recurrenceEndAt" type="datetime-local" />
              </div>
              <div className="field manual-span-2">
                <label>
                  <input type="checkbox" name="isRecurring" /> Weekly recurring
                </label>
              </div>
            </div>
          </section>

          <div className="manual-form-footer" data-motion-item="manual-actions">
            <p className="helper-text form-required-note" data-motion-item="manual-required-note">
              * Required fields
            </p>
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? "Adding..." : "Add booking"}
            </button>
          </div>
        </form>
      </div>

      {dialogPresence.isMounted && selectedEvent && dialogForm ? (
        <div
          className="dialog-backdrop"
          ref={dialogRootRef}
          data-motion-root="admin"
          data-motion-item="booking-dialog-backdrop"
          onClick={() => void closeDialog()}
        >
          <div className="dialog-panel" data-motion-item="booking-dialog-panel" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head" data-motion-item="booking-dialog-head">
              <h3 data-motion-item="booking-dialog-title">{selectedEvent.title}</h3>
              <button className="btn btn-secondary" type="button" onClick={() => void closeDialog()}>
                Close
              </button>
            </div>
            <p className="helper-text dialog-status" data-motion-item="booking-dialog-status">
              Status: <strong>{selectedEvent.status}</strong> / Type:{" "}
              <strong>{selectedEvent.entityType === "booking" ? "Confirmed booking" : "Booking request"}</strong>
            </p>
            <form className="dialog-form" data-motion-item="booking-dialog-form" onSubmit={(event) => event.preventDefault()}>
              <div className="dialog-layout" data-motion-item="booking-dialog-layout">
                <div className="dialog-col" data-motion-item="booking-dialog-customer-col">
                  <h4 data-motion-item="booking-dialog-customer-title">Customer details</h4>
                  <div className="form-grid dialog-form-grid">
                    <div className="field">
                      <label>Name</label>
                      <input
                        value={dialogForm.name}
                        onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                      />
                    </div>
                    <div className="field">
                      <label>Email</label>
                      <input
                        type="email"
                        value={dialogForm.email}
                        onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, email: event.target.value } : prev))}
                      />
                    </div>
                    <div className="field">
                      <label>Phone</label>
                      <input
                        value={dialogForm.phone}
                        maxLength={10}
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        placeholder="10 digits"
                        title="Phone must be exactly 10 digits"
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, phone: toDigits(event.target.value, 10) } : prev))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Unit / Apartment (optional)</label>
                      <input
                        value={dialogForm.unitNumber}
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, unitNumber: event.target.value } : prev))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>House number</label>
                      <input
                        value={dialogForm.houseNumber}
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, houseNumber: event.target.value } : prev))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Street name</label>
                      <input
                        value={dialogForm.streetName}
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, streetName: event.target.value } : prev))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Street type</label>
                      <select
                        value={dialogForm.streetType}
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, streetType: event.target.value } : prev))
                        }
                      >
                        <option value="Street">Street</option>
                        <option value="Road">Road</option>
                        <option value="Avenue">Avenue</option>
                        <option value="Drive">Drive</option>
                        <option value="Lane">Lane</option>
                        <option value="Court">Court</option>
                        <option value="Crescent">Crescent</option>
                        <option value="Place">Place</option>
                        <option value="Boulevard">Boulevard</option>
                        <option value="Terrace">Terrace</option>
                        <option value="Parade">Parade</option>
                        <option value="Close">Close</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Suburb</label>
                      <input
                        value={dialogForm.suburb}
                        onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, suburb: event.target.value } : prev))}
                      />
                    </div>
                    <div className="field">
                      <label>State</label>
                      <select
                        value={dialogForm.state}
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, state: event.target.value as AuState } : prev))
                        }
                      >
                        <option value="ACT">Australian Capital Territory</option>
                        <option value="NSW">New South Wales</option>
                        <option value="NT">Northern Territory</option>
                        <option value="QLD">Queensland</option>
                        <option value="SA">South Australia</option>
                        <option value="TAS">Tasmania</option>
                        <option value="VIC">Victoria</option>
                        <option value="WA">Western Australia</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Postcode</label>
                      <input
                        value={dialogForm.postcode}
                        maxLength={4}
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        placeholder="3000"
                        title="Postcode must be 4 digits"
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, postcode: toDigits(event.target.value, 4) } : prev))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Mode</label>
                      <select
                        value={dialogForm.lessonMode}
                        onChange={(event) =>
                          setDialogForm((prev) =>
                            prev ? { ...prev, lessonMode: event.target.value as DialogForm["lessonMode"] } : prev
                          )
                        }
                      >
                        <option value="in_person">In-person</option>
                        <option value="video">Video</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Skill level</label>
                      <select
                        value={dialogForm.skillLevel}
                        onChange={(event) =>
                          setDialogForm((prev) =>
                            prev ? { ...prev, skillLevel: event.target.value as DialogForm["skillLevel"] } : prev
                          )
                        }
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Duration</label>
                      <select
                        value={dialogForm.durationChoice}
                        onChange={(event) =>
                          setDialogForm((prev) =>
                            prev ? { ...prev, durationChoice: event.target.value as DurationChoice } : prev
                          )
                        }
                      >
                        <option value="min30">30 minutes</option>
                        <option value="min60">60 minutes</option>
                        <option value="custom">Other amount</option>
                      </select>
                    </div>
                    {dialogForm.durationChoice === "custom" ? (
                      <div className="field">
                        <label>Custom Duration (minutes)</label>
                        <input
                          value={dialogForm.customDurationMinutes}
                          maxLength={3}
                          inputMode="numeric"
                          pattern="[0-9]{2,3}"
                          placeholder="e.g. 45"
                          onChange={(event) =>
                            setDialogForm((prev) =>
                              prev ? { ...prev, customDurationMinutes: toDigits(event.target.value, 3) } : prev
                            )
                          }
                        />
                      </div>
                    ) : null}
                    <div className="field">
                      <label>Start</label>
                      <input
                        type="datetime-local"
                        value={dialogForm.startAtLocal}
                        onChange={(event) =>
                          setDialogForm((prev) => (prev ? { ...prev, startAtLocal: event.target.value } : prev))
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="dialog-col is-notes" data-motion-item="booking-dialog-notes-col">
                  <h4 data-motion-item="booking-dialog-notes-title">Notes</h4>
                  <div className="field">
                    <label>Lesson notes</label>
                    <textarea
                      className="dialog-notes"
                      value={dialogForm.notes}
                      onChange={(event) => setDialogForm((prev) => (prev ? { ...prev, notes: event.target.value } : prev))}
                    />
                  </div>
                </div>
              </div>
              <div className="dialog-actions dialog-actions-primary" data-motion-item="booking-dialog-actions-primary">
                <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={() => void saveDetails()}>
                  {busyAction === "save" ? "Saving..." : "Save details"}
                </button>
                <button className="btn btn-secondary" type="button" disabled={!!busyAction} onClick={() => void moveSelected()}>
                  {busyAction === "move" ? "Moving..." : "Move booking"}
                </button>
                <button className="btn btn-danger" type="button" disabled={!!busyAction} onClick={() => void cancelSelected()}>
                  {busyAction === "cancel" ? "Cancelling..." : selectedIsPending ? "Reject request" : "Cancel booking"}
                </button>
                {selectedIsPending ? (
                  <>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={!!busyAction}
                      onClick={() => void approveSelected("approve")}
                    >
                      {busyAction === "approve" ? "Approving..." : "Approve"}
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={!!busyAction}
                      onClick={() => void approveSelected("reject")}
                    >
                      {busyAction === "reject" ? "Rejecting..." : "Reject"}
                    </button>
                  </>
                ) : null}
                {selectedSeriesId ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void removeSeries(selectedSeriesId)}
                  >
                    Remove series
                  </button>
                ) : null}
              </div>
              <div className="dialog-actions dialog-actions-secondary" data-motion-item="booking-dialog-actions-secondary">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!!busyAction}
                  onClick={() => void sendNotification("reminder")}
                >
                  {busyAction === "reminder" ? "Sending..." : "Send reminder"}
                </button>
                <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={openEmailDialog}>
                  Email customer
                </button>
              </div>
            </form>
          </div>
          {emailDialogPresence.isMounted ? (
            <div
              className="dialog-backdrop is-secondary"
              ref={emailDialogRootRef}
              data-motion-root="admin"
              data-motion-item="email-dialog-backdrop"
              onClick={(event) => {
                event.stopPropagation();
                void closeEmailDialog();
              }}
            >
              <div
                className="dialog-panel dialog-panel-compact"
                data-motion-item="email-dialog-panel"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="dialog-head" data-motion-item="email-dialog-head">
                  <h3 data-motion-item="email-dialog-title">Email customer</h3>
                  <button className="btn btn-secondary" type="button" onClick={() => void closeEmailDialog()}>
                    Cancel
                  </button>
                </div>
                <p className="helper-text dialog-status" data-motion-item="email-dialog-status">
                  Send a tailored message to this customer.
                </p>
                <div className="field" data-motion-item="email-dialog-subject-field">
                  <label>Subject</label>
                  <input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} />
                </div>
                <div className="field" data-motion-item="email-dialog-message-field">
                  <label>Message</label>
                  <textarea value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} />
                </div>
                <div className="dialog-actions" data-motion-item="email-dialog-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void closeEmailDialog()}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!!busyAction}
                    onClick={() => void sendNotification("custom", { subject: emailSubject, message: emailMessage })}
                  >
                    {busyAction === "custom" ? "Sending..." : "Send email"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
