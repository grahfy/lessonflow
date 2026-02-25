"use client";

import { FormEvent, useState } from "react";

import { useNoticeTween } from "@/components/motion/use-notice-tween";
import { useCaptcha } from "@/components/captcha";

type ContactState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function getFieldErrorMessage(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    return null;
  }

  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") {
    return null;
  }

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && typeof messages[0] === "string") {
      return `${field}: ${messages[0]}`;
    }
  }

  return null;
}

export function ContactForm() {
  const [state, setState] = useState<ContactState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const successNoticeRef = useNoticeTween(state.status === "success");
  const errorNoticeRef = useNoticeTween(state.status === "error");
  const captcha = useCaptcha();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Capture the form element synchronously before any awaits. React event
    // objects do not guarantee `currentTarget` remains usable later.
    const formElement = event.currentTarget;
    
    const form = new FormData(formElement);
    const payload = {
      name: String(form.get("name") || "").trim(),
      email: String(form.get("email") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      message: String(form.get("message") || "").trim()
    };

    // Enforce trimmed required fields before sending to avoid whitespace-only
    // submissions passing browser `required` checks.
    if (!payload.name || !payload.email || !payload.message) {
      setState({
        status: "error",
        message: "Name, email, and message are required before sending."
      });
      return;
    }

    if (!captcha.validateAnswer()) {
      setState({ status: "error", message: "Please answer the math question correctly." });
      captcha.regenerate();
      return;
    }
    
    setLoading(true);
    setState({ status: "idle" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldError = getFieldErrorMessage(result);
        const apiError = result && typeof result.error === "string" ? result.error : null;
        const message =
          fieldError ?? apiError ?? "We could not send your message. Please check fields and try again.";
        setState({ status: "error", message });
        return;
      }

      formElement.reset();
      setState({
        status: "success",
        message: "Thanks. Your message has been sent and the studio owner has been notified."
      });
    } catch {
      setState({
        status: "error",
        message: "We could not send your message due to a network error. Please try again."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} data-motion-item="contact-form">
      <div className="field" data-motion-item="contact-name-field">
        <label htmlFor="contact-name">Name</label>
        <input id="contact-name" name="name" minLength={2} maxLength={120} required />
      </div>

      <div className="field" data-motion-item="contact-email-field">
        <label htmlFor="contact-email">Email</label>
        <input id="contact-email" type="email" name="email" maxLength={200} required />
      </div>

      <div className="field full" data-motion-item="contact-phone-field">
        <label htmlFor="contact-phone">Phone (optional)</label>
        <input id="contact-phone" name="phone" maxLength={40} />
      </div>

      <div className="field full" data-motion-item="contact-message-field">
        <label htmlFor="contact-message">Message</label>
        <textarea id="contact-message" name="message" minLength={10} maxLength={2000} required />
      </div>

      <div className="field full" data-motion-item="contact-captcha-field">
        <label htmlFor="contact-captcha">
          Security question: {captcha.captcha?.question}
        </label>
        <input
          id="contact-captcha"
          name="captcha"
          type="text"
          inputMode="numeric"
          required
          value={captcha.userAnswer}
          onChange={(e) => captcha.handleChange(e.currentTarget.value)}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn btn-small"
          onClick={() => captcha.regenerate()}
        >
          New question
        </button>
      </div>

      <div className="button-row" data-motion-item="contact-actions">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Message"}
        </button>
      </div>

      {state.status === "success" ? (
        <p className="notice success" ref={successNoticeRef} data-motion-item="contact-success-notice">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="notice error" ref={errorNoticeRef} data-motion-item="contact-error-notice">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
