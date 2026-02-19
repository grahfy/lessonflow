"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Booking = {
  id: string;
  name: string;
  email: string;
  phone: string;
  lessonMode: string;
  skillLevel: string;
  lessonDuration: string;
  status: string;
  startAt: string;
  seriesId: string | null;
};

type PendingRequest = {
  id: string;
  name: string;
  email: string;
  lessonMode: string;
  lessonDuration: string;
  requestedStartAt: string;
};

type CalendarView = "day" | "week" | "month";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function AdminBookingsClient() {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>("week");
  const [date, setDate] = useState<string>(toDateInputValue(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const rangeLabel = useMemo(() => `${view.toUpperCase()} VIEW`, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [bookingRes, pendingRes] = await Promise.all([
      fetch(`/api/admin/bookings?view=${view}&date=${date}`, { cache: "no-store" }),
      fetch("/api/admin/booking-requests", { cache: "no-store" })
    ]);
    if (!bookingRes.ok || !pendingRes.ok) {
      setLoading(false);
      setError("Unable to load admin data. Please sign in again.");
      return;
    }
    const bookingData = await bookingRes.json();
    const pendingData = await pendingRes.json();
    setBookings(bookingData.rows || []);
    setPending(pendingData.rows || []);
    setLoading(false);
  }, [date, view]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [load]);

  async function approve(id: string, action: "approve" | "reject") {
    const response = await fetch(`/api/admin/booking-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    if (response.ok) {
      load();
    }
  }

  async function updateBooking(id: string, action: "cancel" | "move") {
    if (action === "move") {
      const raw = window.prompt("Enter new lesson date/time (YYYY-MM-DDTHH:mm):");
      if (!raw) {
        return;
      }
      const newStartAt = new Date(raw).toISOString();
      const response = await fetch(`/api/admin/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, newStartAt })
      });
      if (response.ok) {
        load();
      }
      return;
    }

    const response = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    if (response.ok) {
      load();
    }
  }

  async function removeSeries(seriesId: string) {
    const response = await fetch(`/api/admin/booking-series/${seriesId}`, {
      method: "DELETE"
    });
    if (response.ok) {
      load();
    }
  }

  async function addManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      address: String(form.get("address") || ""),
      lessonMode: String(form.get("lessonMode") || ""),
      skillLevel: String(form.get("skillLevel") || ""),
      lessonDuration: String(form.get("lessonDuration") || ""),
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
    if (response.ok) {
      formElement.reset();
      load();
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="admin-shell">
      <div className="admin-card booking-row">
        <h1 style={{ marginRight: "auto", fontSize: "1.3rem" }}>Owner Booking Console</h1>
        <button className="btn btn-secondary" onClick={logout}>
          Sign out
        </button>
      </div>

      <div className="admin-card booking-row">
        <strong>{rangeLabel}</strong>
        <label>
          View{" "}
          <select value={view} onChange={(e) => setView(e.target.value as CalendarView)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <label>
          Base date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {error ? <p className="notice error">{error}</p> : null}
      {loading ? <p className="notice">Loading...</p> : null}

      <div className="admin-grid">
        <div className="admin-card">
          <h2>Bookings</h2>
          <div className="booking-list">
            {bookings.map((booking) => (
              <div className="booking-item" key={booking.id}>
                <p>
                  <strong>{booking.name}</strong> - {new Date(booking.startAt).toLocaleString("en-AU")} -{" "}
                  {booking.lessonDuration === "min30" ? "30m" : "60m"} ({booking.lessonMode})
                </p>
                <p>Status: {booking.status}</p>
                <div className="booking-row">
                  <button className="btn btn-secondary" onClick={() => updateBooking(booking.id, "move")}>
                    Move
                  </button>
                  <button className="btn btn-secondary" onClick={() => updateBooking(booking.id, "cancel")}>
                    Cancel
                  </button>
                  {booking.seriesId ? (
                    <button className="btn btn-secondary" onClick={() => removeSeries(booking.seriesId!)}>
                      Remove Series
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!bookings.length ? <p className="helper-text">No bookings for selected range.</p> : null}
          </div>
        </div>

        <div className="admin-card">
          <h2>Pending Approvals</h2>
          <div className="booking-list">
            {pending.map((item) => (
              <div className="booking-item" key={item.id}>
                <p>
                  <strong>{item.name}</strong> - {new Date(item.requestedStartAt).toLocaleString("en-AU")}
                </p>
                <p>
                  {item.lessonDuration === "min30" ? "30m" : "60m"} / {item.lessonMode}
                </p>
                <div className="booking-row">
                  <button className="btn btn-primary" onClick={() => approve(item.id, "approve")}>
                    Approve
                  </button>
                  <button className="btn btn-secondary" onClick={() => approve(item.id, "reject")}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!pending.length ? <p className="helper-text">No pending requests.</p> : null}
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h2>Add Manual Booking</h2>
        <form className="form-grid" onSubmit={addManualBooking}>
          <div className="field">
            <label>Name</label>
            <input name="name" required />
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" required />
          </div>
          <div className="field">
            <label>Phone</label>
            <input name="phone" required />
          </div>
          <div className="field">
            <label>Address</label>
            <input name="address" required />
          </div>
          <div className="field">
            <label>Mode</label>
            <select name="lessonMode" defaultValue="in_person">
              <option value="in_person">In-person</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div className="field">
            <label>Skill level</label>
            <select name="skillLevel" defaultValue="beginner">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div className="field">
            <label>Duration</label>
            <select name="lessonDuration" defaultValue="min60">
              <option value="min30">30 minutes</option>
              <option value="min60">60 minutes</option>
            </select>
          </div>
          <div className="field">
            <label>Start</label>
            <input name="requestedStartAt" type="datetime-local" required />
          </div>
          <div className="field">
            <label>
              <input type="checkbox" name="isRecurring" /> Weekly recurring
            </label>
          </div>
          <div className="field">
            <label>Recurrence end</label>
            <input name="recurrenceEndAt" type="datetime-local" />
          </div>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? "Adding..." : "Add booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
