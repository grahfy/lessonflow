"use client";

import { FormEvent, useState } from "react";

import { useNoticeTween } from "@/components/motion/use-notice-tween";
import { useCaptcha } from "@/components/captcha";

type ContactState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function ContactForm() {
  const [state, setState] = useState<ContactState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const successNoticeRef = useNoticeTween(state.status === "success");
  const errorNoticeRef = useNoticeTween(state.status === "error");
  const captcha = useCaptcha();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    if (!captcha.validateAnswer()) {
      setState({ status: "error", message: "Please answer the math question correctly." });
      captcha.regenerate();
      return;
    }
    
    setLoading(true);
    setState({ status: "idle" });

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      message: String(form.get("message") || "")
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result.error === "string"
            ? result.error
            : "We could not send your message. Please check fields and try again.";
        setState({ status: "error", message });
        return;
      }

      event.currentTarget.reset();
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
        <input id="contact-name" name="name" required />
      </div>

      <div className="field" data-motion-item="contact-email-field">
        <label htmlFor="contact-email">Email</label>
        <input id="contact-email" type="email" name="email" required />
      </div>

      <div className="field full" data-motion-item="contact-phone-field">
        <label htmlFor="contact-phone">Phone (optional)</label>
        <input id="contact-phone" name="phone" />
      </div>

      <div className="field full" data-motion-item="contact-message-field">
        <label htmlFor="contact-message">Message</label>
        <textarea id="contact-message" name="message" required />
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
