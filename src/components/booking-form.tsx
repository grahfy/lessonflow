"use client";

import { FormEvent, useState } from "react";

import { useNoticeTween } from "@/components/motion/use-notice-tween";

type BookingState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function BookingForm() {
  const [state, setState] = useState<BookingState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [durationType, setDurationType] = useState<"min30" | "min60" | "custom">("min60");
  const successNoticeRef = useNoticeTween(state.status === "success");
  const errorNoticeRef = useNoticeTween(state.status === "error");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setState({ status: "idle" });

    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") || "").trim();
    const middleName = String(form.get("middleName") || "").trim();
    const lastName = String(form.get("lastName") || "").trim();
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    const startRaw = String(form.get("requestedStartAt") || "");
    const recurrenceRaw = String(form.get("recurrenceEndAt") || "");
    const phoneDigits = String(form.get("phone") || "").replace(/\D/g, "").slice(0, 10);
    const customDurationRaw = String(form.get("customDurationMinutes") || "");
    const customDurationMinutes =
      durationType === "custom" && customDurationRaw ? Number.parseInt(customDurationRaw, 10) : undefined;

    const payload = {
      name: fullName,
      email: String(form.get("email") || ""),
      phone: phoneDigits,
      unitNumber: String(form.get("unitNumber") || ""),
      houseNumber: String(form.get("houseNumber") || ""),
      streetName: String(form.get("streetName") || ""),
      streetType: String(form.get("streetType") || ""),
      suburb: String(form.get("suburb") || ""),
      state: String(form.get("state") || ""),
      postcode: String(form.get("postcode") || ""),
      lessonMode: String(form.get("lessonMode") || ""),
      skillLevel: String(form.get("skillLevel") || ""),
      lessonDuration: durationType === "min30" ? "min30" : "min60",
      customDurationMinutes,
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
    setDurationType("min60");
    setState({
      status: "success",
      message: "Booking request submitted. The owner has been emailed and will approve your request."
    });
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} data-motion-item="booking-form">
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-first-name">First Name *</label>
        <input id="book-first-name" name="firstName" required />
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-middle-name">Middle Name</label>
        <input id="book-middle-name" name="middleName" />
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-last-name">Last Name *</label>
        <input id="book-last-name" name="lastName" required />
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-email">Email *</label>
        <input id="book-email" type="email" name="email" required />
      </div>
      <div className="field field-compact" data-motion-item="booking-field">
        <label htmlFor="book-phone">Phone *</label>
        <input
          id="book-phone"
          name="phone"
          required
          maxLength={10}
          inputMode="numeric"
          pattern="[0-9]{10}"
          placeholder="10 digits"
          title="Phone must be exactly 10 digits"
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 10);
          }}
        />
      </div>
      <div className="field field-compact" data-motion-item="booking-field">
        <label htmlFor="book-unit-number">Unit/Apartment</label>
        <input
          id="book-unit-number"
          name="unitNumber"
          maxLength={5}
          inputMode="numeric"
          pattern="[0-9]{1,5}"
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 5);
          }}
        />
      </div>
      <div className="field field-compact" data-motion-item="booking-field">
        <label htmlFor="book-house-number">House/Building Number *</label>
        <input
          id="book-house-number"
          name="houseNumber"
          required
          maxLength={5}
          inputMode="numeric"
          pattern="[0-9]{1,5}"
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 5);
          }}
        />
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-street-name">Street Name *</label>
        <input id="book-street-name" name="streetName" required />
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-street-type">Street Type *</label>
        <select id="book-street-type" name="streetType" required defaultValue="">
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
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-suburb">Suburb *</label>
        <input id="book-suburb" name="suburb" required />
      </div>
      <div className="field">
        <label htmlFor="book-state">State *</label>
        <select id="book-state" name="state" required defaultValue="VIC">
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
      <div className="field field-compact" data-motion-item="booking-field">
        <label htmlFor="book-postcode">Postcode *</label>
        <input
          id="book-postcode"
          name="postcode"
          required
          maxLength={4}
          inputMode="numeric"
          pattern="[0-9]{4}"
          placeholder="3000"
          title="Postcode must be 4 digits"
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
          }}
        />
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-mode">Mode *</label>
        <select id="book-mode" name="lessonMode" required defaultValue="in_person">
          <option value="in_person">In-person</option>
          <option value="video">Video</option>
        </select>
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-level">Skill Level *</label>
        <select id="book-level" name="skillLevel" required defaultValue="beginner">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-duration">Duration *</label>
        <select
          id="book-duration"
          required
          value={durationType}
          onChange={(event) => setDurationType(event.target.value as "min30" | "min60" | "custom")}
        >
          <option value="min30">30 minutes</option>
          <option value="min60">60 minutes</option>
          <option value="custom">Other amount</option>
        </select>
      </div>
      {durationType === "custom" ? (
        <div className="field field-compact" data-motion-item="booking-field">
          <label htmlFor="book-custom-duration">Custom Duration (minutes) *</label>
          <input
            id="book-custom-duration"
            name="customDurationMinutes"
            required
            maxLength={3}
            inputMode="numeric"
            pattern="[0-9]{2,3}"
            placeholder="e.g. 45"
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 3);
            }}
          />
        </div>
      ) : null}
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-start">Start *</label>
        <input id="book-start" type="datetime-local" name="requestedStartAt" required />
      </div>

      <div className="field full" data-motion-item="booking-field">
        <label htmlFor="book-notes">Notes (optional)</label>
        <textarea id="book-notes" name="notes" />
      </div>

      <div className="field full" data-motion-item="booking-field">
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
        <div className="field full" data-motion-item="booking-field">
          <label htmlFor="book-recurring-end">Recurrence end date</label>
          <input id="book-recurring-end" type="datetime-local" name="recurrenceEndAt" required />
        </div>
      ) : null}

      <div className="button-row" data-motion-item="booking-actions">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Request Booking"}
        </button>
      </div>
      <p className="helper-text form-required-note" data-motion-item="booking-required-note">
        * Required fields
      </p>

      {state.status === "success" ? (
        <p className="notice success" ref={successNoticeRef} data-motion-item="booking-success-notice">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="notice error" ref={errorNoticeRef} data-motion-item="booking-error-notice">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
