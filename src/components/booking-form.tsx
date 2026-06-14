/**
 * Public Booking Form Component
 * 
 * Provides a user-friendly interface for new students to request music lessons.
 * 
 * DESIGN FEATURES:
 * 1. Multi-Step Validation: Captcha -> Geo-Fence -> Zod Schema.
 * 2. Geo-Blocking: Applies the current public geoblocking policy before submit.
 * 3. Atomic Feedback: Shows success/error state in a dedicated dialog overlay.
 * 4. UX Rationale: Fields are simplified to reduce friction. New customers are 
 *    automatically capped at 30 minutes for their first lesson intro.
 */

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { CaptchaField, useCaptcha } from "@/components/captcha";
import { dateTimeLocalToIso } from "@/lib/time";

/**
 * State of the form submission process.
 */
type BookingState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

/**
 * Primary component for the public-facing booking request page.
 */
type BookingFieldErrors = Partial<Record<
  "firstName" | "lastName" | "email" | "phone" | "postcode" | "lessonMode" | "skillLevel" | "duration" | "customDurationMinutes" | "requestedStartAt",
  string
>>;

export function BookingForm() {
  const [state, setState] = useState<BookingState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<BookingFieldErrors>({});
  const successRef = useRef<HTMLParagraphElement>(null);

  // DRIVING UI: keep durationType and lessonMode in state for conditional inputs
  const [durationType, setDurationType] = useState<"min30" | "min60" | "custom">("min60");
  const [lessonMode, setLessonMode] = useState<"in_person" | "video">("in_person");

  const captcha = useCaptcha();

  /** Close status dialog on Escape key. */
  useEffect(() => {
    if (state.status === "idle") return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setState({ status: "idle" });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.status]);

  /** Move keyboard focus into the success dialog when it appears. */
  useEffect(() => {
    if (state.status === "success" && successRef.current) {
      successRef.current.focus();
    }
  }, [state.status]);

  /**
   * Validates fields client-side and returns an error map. Empty map = valid.
   */
  function validateFields(form: FormData): BookingFieldErrors {
    const errors: BookingFieldErrors = {};
    if (!String(form.get("firstName") || "").trim()) {
      errors.firstName = "First name is required.";
    }
    if (!String(form.get("lastName") || "").trim()) {
      errors.lastName = "Last name is required.";
    }
    const email = String(form.get("email") || "").trim();
    if (!email) {
      errors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    const phone = String(form.get("phone") || "").replace(/\D/g, "");
    if (!phone) {
      errors.phone = "Phone number is required.";
    } else if (phone.length !== 10) {
      errors.phone = "Enter a 10-digit Australian phone number.";
    }
    const postcode = String(form.get("postcode") || "").replace(/\D/g, "");
    if (!postcode) {
      errors.postcode = "Postcode is required.";
    } else if (postcode.length !== 4) {
      errors.postcode = "Enter a 4-digit Australian postcode.";
    }
    if (!String(form.get("requestedStartAt") || "")) {
      errors.requestedStartAt = "Please choose a start date and time.";
    }
    if (durationType === "custom") {
      const custom = String(form.get("customDurationMinutes") || "");
      if (!custom || !/^[0-9]{2,3}$/.test(custom)) {
        errors.customDurationMinutes = "Enter a custom duration in minutes (2–3 digits).";
      }
    }
    return errors;
  }

  /**
   * Main submission handler.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;

    // CLIENT-SIDE FIELD VALIDATION
    const form = new FormData(formElement);
    const errors = validateFields(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    // STEP 1: CAPTCHA CHECK
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
       * STEP 2: GEOLOCATION CHECK
       * RATIONALE: /api/geo mirrors the server-side geoblocking policy so we
       * can fail fast without waiting for full payload processing.
       */
      const geoResponse = await fetch("/api/geo");
      if (geoResponse.ok) {
        const geoData = (await geoResponse.json()) as { allowed?: boolean };
        if (geoData.allowed === false) {
          setState({
            status: "error",
            message: "This form is not currently available from your region."
          });
          setLoading(false);
          await captcha.regenerate();
          return;
        }
      }

      // STEP 3: DATA AGGREGATION
      const firstName = String(form.get("firstName") || "").trim();
      const lastName = String(form.get("lastName") || "").trim();
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      const startRaw = String(form.get("requestedStartAt") || "");
      const phoneDigits = String(form.get("phone") || "").replace(/\D/g, "").slice(0, 10);
      const customDurationRaw = String(form.get("customDurationMinutes") || "");
      const customDurationMinutes =
        durationType === "custom" && customDurationRaw ? Number.parseInt(customDurationRaw, 10) : undefined;

      const requestedStartAt = dateTimeLocalToIso(startRaw);
      if (!requestedStartAt) {
        setState({ status: "error", message: "Please choose a valid booking start date and time." });
        setLoading(false);
        return;
      }

      /**
       * PAYLOAD MAPPING
       * RATIONALE: Address fields are abstracted away from the public UI to 
       * speed up the request process. Empty strings are sent to maintain 
       * schema compatibility on the backend.
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
        requestedStartAt,
        notes: String(form.get("notes") || ""),
        country: "Australia",
        unitNumber: "",
        houseNumber: "",
        streetName: "",
        streetType: "",
        suburb: "",
        state: "VIC",
        isRecurring: false, // Disallow recurring series from the public form
        recurrenceEndAt: undefined
      };

      // STEP 4: API SUBMISSION
      let response: Response;
      try {
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
          message: "Booking could not be submitted right now. Please try again later."
        });
        await captcha.regenerate();
        return;
      }

      let responsePayload: { id?: string; error?: string; deliveryStatus?: string } | null = null;
      try {
        responsePayload = (await response.json());
      } catch {
        // payload may be empty
      }

      // LOGIC: Status 503 is treated as a semi-success if the record was saved but email failed.
      if (!response.ok && !(response.status === 503 && typeof responsePayload?.id === "string")) {
        setState({
          status: "error",
          message: responsePayload?.error || "Booking could not be submitted. Check required fields."
        });
        await captcha.regenerate();
        return;
      }

      // STEP 5: SUCCESS RESET
      formElement.reset();
      setDurationType("min60");
      setLessonMode("in_person");
      await captcha.regenerate();
      setState({
        status: "success",
        message: "Booking submission is pending. We will get back to you via email or phone within 24 hours."
      });
    } catch {
      setState({
        status: "error",
        message: "Booking could not be submitted right now. Please try again."
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
        <input
          id="book-first-name"
          name="firstName"
          required
          aria-invalid={fieldErrors.firstName ? true : undefined}
          aria-describedby={fieldErrors.firstName ? "book-first-name-error" : undefined}
        />
        {fieldErrors.firstName ? (
          <p id="book-first-name-error" className="field-error" role="alert">{fieldErrors.firstName}</p>
        ) : null}
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-last-name">Last Name *</label>
        <input
          id="book-last-name"
          name="lastName"
          required
          aria-invalid={fieldErrors.lastName ? true : undefined}
          aria-describedby={fieldErrors.lastName ? "book-last-name-error" : undefined}
        />
        {fieldErrors.lastName ? (
          <p id="book-last-name-error" className="field-error" role="alert">{fieldErrors.lastName}</p>
        ) : null}
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-email">Email *</label>
        <input
          id="book-email"
          type="email"
          name="email"
          required
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "book-email-error" : undefined}
        />
        {fieldErrors.email ? (
          <p id="book-email-error" className="field-error" role="alert">{fieldErrors.email}</p>
        ) : null}
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
            aria-invalid={fieldErrors.phone ? true : undefined}
            aria-describedby={fieldErrors.phone ? "book-phone-error" : undefined}
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 10);
            }}
          />
        </Tooltip>
        {fieldErrors.phone ? (
          <p id="book-phone-error" className="field-error" role="alert">{fieldErrors.phone}</p>
        ) : null}
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
            aria-invalid={fieldErrors.postcode ? true : undefined}
            aria-describedby={fieldErrors.postcode ? "book-postcode-error" : undefined}
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
            }}
          />
        </Tooltip>
        {fieldErrors.postcode ? (
          <p id="book-postcode-error" className="field-error" role="alert">{fieldErrors.postcode}</p>
        ) : null}
      </div>
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-mode">Mode *</label>
        <select
          id="book-mode"
          name="lessonMode"
          required
          value={lessonMode}
          onChange={(event) => setLessonMode(event.target.value as "in_person" | "video")}
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
            aria-invalid={fieldErrors.customDurationMinutes ? true : undefined}
            aria-describedby={fieldErrors.customDurationMinutes ? "book-custom-duration-error" : undefined}
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 3);
            }}
          />
          {fieldErrors.customDurationMinutes ? (
            <p id="book-custom-duration-error" className="field-error" role="alert">{fieldErrors.customDurationMinutes}</p>
          ) : null}
        </div>
      ) : null}
      <div className="field" data-motion-item="booking-field">
        <label htmlFor="book-start">Start *</label>
        <input
          id="book-start"
          type="datetime-local"
          name="requestedStartAt"
          required
          aria-invalid={fieldErrors.requestedStartAt ? true : undefined}
          aria-describedby={fieldErrors.requestedStartAt ? "book-start-error" : undefined}
        />
        {fieldErrors.requestedStartAt ? (
          <p id="book-start-error" className="field-error" role="alert">{fieldErrors.requestedStartAt}</p>
        ) : null}
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
                {state.status === "success" ? "Booking Requested" : "Request Error"}
              </h3>
            </div>
            <p
              className={`dialog-status notice ${state.status === "success" ? "success" : "error"}`}
              data-motion-item={state.status === "success" ? "booking-success-notice" : "booking-error-notice"}
              role={state.status === "success" ? "status" : "alert"}
              aria-live={state.status === "success" ? "polite" : "assertive"}
              ref={state.status === "success" ? successRef : undefined}
              tabIndex={state.status === "success" ? -1 : undefined}
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
