"use client";

import { FormEvent, useEffect, useState } from "react";

type BookingState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

/**
 * Public booking-request form.
 *
 * Submissions create pending booking requests that are manually approved by the owner/admin before
 * becoming confirmed bookings. The UI therefore focuses on validation and expectation-setting.
 */
export function BookingForm() {
  const [state, setState] = useState<BookingState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [durationType, setDurationType] = useState<"min30" | "min60" | "custom">("min60");

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setState({ status: "idle" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setState({ status: "idle" });
    const formElement = event.currentTarget;

    try {
      const form = new FormData(formElement);
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

      const requestedStartAtDate = new Date(startRaw);
      if (Number.isNaN(requestedStartAtDate.getTime())) {
        setState({
          status: "error",
          message: "Please choose a valid booking start date and time."
        });
        return;
      }

      const recurrenceEndAtDate =
        isRecurring && recurrenceRaw ? new Date(recurrenceRaw) : null;
      if (isRecurring && recurrenceRaw && recurrenceEndAtDate && Number.isNaN(recurrenceEndAtDate.getTime())) {
        setState({
          status: "error",
          message: "Please choose a valid recurrence end date and time."
        });
        return;
      }

      // Build the API payload in the same shape used by `/api/booking-requests`.
      const requestPayload = {
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
        requestedStartAt: requestedStartAtDate.toISOString(),
        notes: String(form.get("notes") || ""),
        isRecurring,
        recurrenceEndAt: recurrenceEndAtDate ? recurrenceEndAtDate.toISOString() : undefined
      };

      let response: Response;
      try {
        // The booking request endpoint persists the request and then notifies the owner by email.
        response = await fetch("/api/booking-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload)
        });
      } catch {
        setState({
          status: "error",
          message: "Booking could not be submitted right now. Please try again, or contact us by phone or email."
        });
        return;
      }

      let responsePayload: { id?: string; error?: string; deliveryStatus?: string } | null = null;
      try {
        responsePayload = (await response.json()) as { id?: string; error?: string; deliveryStatus?: string };
      } catch {
        responsePayload = null;
      }

      // Saved-request responses can still be returned as 503 when owner notification delivery is
      // degraded. Treat those as a user-visible success so the requester gets confirmation.
      if (!response.ok && !(response.status === 503 && typeof responsePayload?.id === "string")) {
        setState({
          status: "error",
          message: responsePayload?.error || "Booking could not be submitted. Check required fields and selected date."
        });
        return;
      }

      formElement.reset();
      setIsRecurring(false);
      setDurationType("min60");
      setState({
        status: "success",
        message:
          "Booking submission is pending. We will get back to you via email or phone within 24 hours regarding booking confirmation."
      });
    } catch {
      setState({
        status: "error",
        message: "Booking could not be submitted right now. Please try again, or contact us by phone or email."
      });
    } finally {
      setLoading(false);
    }
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

      {state.status !== "idle" ? (
        <div
          className="dialog-backdrop is-secondary"
          role="presentation"
          onClick={() => setState({ status: "idle" })}
        >
          <div
            className="dialog-panel dialog-panel-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-submit-status-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <h3 id="book-submit-status-title">
                {state.status === "success" ? "Booking Request Submitted" : "Booking Request Error"}
              </h3>
            </div>
            <p
              className={`dialog-status notice ${state.status === "success" ? "success" : "error"}`}
              data-motion-item={state.status === "success" ? "booking-success-notice" : "booking-error-notice"}
              role={state.status === "success" ? "status" : "alert"}
              aria-live={state.status === "success" ? "polite" : "assertive"}
            >
              {state.message}
            </p>
            <div className="dialog-actions dialog-actions-secondary">
              <button className="btn btn-primary" type="button" onClick={() => setState({ status: "idle" })}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
