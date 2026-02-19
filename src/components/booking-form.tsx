"use client";

import { FormEvent, useState } from "react";

type BookingState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function BookingForm() {
  const [state, setState] = useState<BookingState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setState({ status: "idle" });

    const form = new FormData(event.currentTarget);
    const startRaw = String(form.get("requestedStartAt") || "");
    const recurrenceRaw = String(form.get("recurrenceEndAt") || "");

    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      address: String(form.get("address") || ""),
      lessonMode: String(form.get("lessonMode") || ""),
      skillLevel: String(form.get("skillLevel") || ""),
      lessonDuration: String(form.get("lessonDuration") || ""),
      requestedStartAt: new Date(startRaw).toISOString(),
      notes: String(form.get("notes") || ""),
      isRecurring,
      recurrenceEndAt: isRecurring && recurrenceRaw ? new Date(recurrenceRaw).toISOString() : undefined
    };

    const response = await fetch("/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setLoading(false);
    if (!response.ok) {
      setState({
        status: "error",
        message: "Booking could not be submitted. Check required fields and selected date."
      });
      return;
    }

    event.currentTarget.reset();
    setIsRecurring(false);
    setState({
      status: "success",
      message: "Booking request submitted. The owner has been emailed and will approve your request."
    });
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="book-name">Name</label>
        <input id="book-name" name="name" required />
      </div>
      <div className="field">
        <label htmlFor="book-email">Email</label>
        <input id="book-email" type="email" name="email" required />
      </div>
      <div className="field">
        <label htmlFor="book-phone">Phone</label>
        <input id="book-phone" name="phone" required />
      </div>
      <div className="field">
        <label htmlFor="book-address">Address</label>
        <input id="book-address" name="address" required />
      </div>
      <div className="field">
        <label htmlFor="book-mode">In-person or video</label>
        <select id="book-mode" name="lessonMode" required defaultValue="in_person">
          <option value="in_person">In-person</option>
          <option value="video">Video</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="book-level">Skill level</label>
        <select id="book-level" name="skillLevel" required defaultValue="beginner">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="book-duration">Lesson duration</label>
        <select id="book-duration" name="lessonDuration" required defaultValue="min60">
          <option value="min30">30 minutes</option>
          <option value="min60">60 minutes</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="book-start">Requested start</label>
        <input id="book-start" type="datetime-local" name="requestedStartAt" required />
      </div>

      <div className="field full">
        <label htmlFor="book-notes">Notes (optional)</label>
        <textarea id="book-notes" name="notes" />
      </div>

      <div className="field full">
        <label htmlFor="book-recurring">
          <input
            id="book-recurring"
            type="checkbox"
            checked={isRecurring}
            onChange={(event) => setIsRecurring(event.target.checked)}
          />{" "}
          Weekly recurring booking
        </label>
      </div>

      {isRecurring ? (
        <div className="field full">
          <label htmlFor="book-recurring-end">Recurrence end date</label>
          <input id="book-recurring-end" type="datetime-local" name="recurrenceEndAt" required />
        </div>
      ) : null}

      <div className="button-row">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Request Booking"}
        </button>
      </div>

      {state.status === "success" ? <p className="notice success">{state.message}</p> : null}
      {state.status === "error" ? <p className="notice error">{state.message}</p> : null}
    </form>
  );
}
