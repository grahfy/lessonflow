"use client";

import { FormEvent, useEffect, useState } from "react";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { CaptchaField, useCaptcha } from "@/components/captcha";

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
  // RATIONALE: durationType and lessonMode are kept as state to drive conditional UI rendering
  // (e.g., custom duration input) and validation messaging.
  const [durationType, setDurationType] = useState<"min30" | "min60" | "custom">("min60");
  const [lessonMode, setLessonMode] = useState<"in_person" | "video">("in_person");
  const captcha = useCaptcha();

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
    const formElement = event.currentTarget;

    // Require a loaded CAPTCHA challenge and a non-empty answer before any API call.
    if (!captcha.validateAnswer()) {
      setState({
        status: "error",
        message: "Please complete the CAPTCHA challenge before requesting a booking."
      });
      void captcha.regenerate();
      return;
    }

    setLoading(true);
    setState({ status: "idle" });

    try {
      /**
       * GEOLOCATION CHECK
       * RATIONALE: To prevent unqualified leads and international spam, we verify the 
       * user's country via their IP address before allowing form submission.
       */
      const geoResponse = await fetch("/api/geo");
      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        // Strict restriction to Australia (AU)
        if (geoData.country && geoData.country !== "AU") {
          setState({
            status: "error",
            message: "Currently only AU residents are applicable for lessons."
          });
          setLoading(false);
          await captcha.regenerate();
          return;
        }
      }

      const form = new FormData(formElement);
      const firstName = String(form.get("firstName") || "").trim();
      const lastName = String(form.get("lastName") || "").trim();
      // Combine name for backward compatibility with database schema
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      const startRaw = String(form.get("requestedStartAt") || "");
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
        setLoading(false);
        return;
      }

      /**
       * SIMPLIFIED PAYLOAD
       * RATIONALE: UI has been simplified to reduce friction. Removed address fields 
       * are defaulted to empty strings to maintain compatibility with existing 
       * database constraints and downstream logic.
       */
      const requestPayload = {
        firstName,
        lastName,
        name: fullName,
        email: String(form.get("email") || ""),
        phone: phoneDigits,
        postcode: String(form.get("postcode") || ""),
        lessonMode: String(form.get("lessonMode") || ""),
        skillLevel: String(form.get("skillLevel") || ""),
        lessonDuration: durationType === "min30" ? "min30" : "min60",
        customDurationMinutes,
        requestedStartAt: requestedStartAtDate.toISOString(),
        notes: String(form.get("notes") || ""),
        // Address fields are now sent as empty strings from public UI
        country: "Australia",
        unitNumber: "",
        houseNumber: "",
        streetName: "",
        streetType: "",
        suburb: "",
        state: "VIC",
        // Recurring bookings are disabled for the public form
        isRecurring: false,
        recurrenceEndAt: undefined
      };

      let response: Response;
      try {
        // The booking request endpoint persists the request and then notifies the owner by email.
        response = await fetch("/api/booking-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...requestPayload,
            ...captcha.getPayload()
          })
        });
      } catch {
        setState({
          status: "error",
          message: "Booking could not be submitted right now. Please try again, or contact us by phone or email."
        });
        await captcha.regenerate();
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
        await captcha.regenerate();
        return;
      }

      formElement.reset();
      setDurationType("min60");
      setLessonMode("in_person");
      await captcha.regenerate();
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
      await captcha.regenerate();
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
        <label htmlFor="book-last-name">Last Name *</label>
        <input id="book-last-name" name="lastName" required />
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-email">Email *</label>
        <input id="book-email" type="email" name="email" required />
      </div>
      <div className="field field-compact" data-motion-item="booking-field">
        <label htmlFor="book-phone">Phone *</label>
        <Tooltip content="Enter a 10-digit Australian phone number without spaces.">
          <input
            id="book-phone"
            name="phone"
            required
            maxLength={10}
            inputMode="numeric"
            pattern="[0-9]{10}"
            placeholder="10 digits"
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 10);
            }}
          />
        </Tooltip>
      </div>
      <div className="field field-compact" data-motion-item="booking-field">
        <label htmlFor="book-postcode">Postcode *</label>
        <Tooltip content="Enter your 4-digit Australian postcode.">
          <input
            id="book-postcode"
            name="postcode"
            required
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]{4}"
            placeholder="3000"
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
            }}
          />
        </Tooltip>
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-mode">Mode *</label>
        <select
          id="book-mode"
          name="lessonMode"
          required
          value={lessonMode}
          onChange={(event) => {
            const nextMode = event.target.value as "in_person" | "video";
            setLessonMode(nextMode);
          }}
        >
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

      <CaptchaField idPrefix="booking" captcha={captcha} motionItem="booking-captcha-field" />

      <div className="button-row" data-motion-item="booking-actions">
        <Tooltip content="Submit this booking request. We will confirm availability after review.">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Request Booking"}
          </button>
        </Tooltip>
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
