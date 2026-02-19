"use client";

import { FormEvent, useState } from "react";

type ContactState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function ContactForm() {
  const [state, setState] = useState<ContactState>({ status: "idle" });
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setState({ status: "idle" });

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      message: String(form.get("message") || "")
    };

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setLoading(false);
    if (!response.ok) {
      setState({
        status: "error",
        message: "We could not send your message. Please check fields and try again."
      });
      return;
    }

    event.currentTarget.reset();
    setState({
      status: "success",
      message: "Thanks. Your message has been sent and the studio owner has been notified."
    });
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="contact-name">Name</label>
        <input id="contact-name" name="name" required />
      </div>

      <div className="field">
        <label htmlFor="contact-email">Email</label>
        <input id="contact-email" type="email" name="email" required />
      </div>

      <div className="field full">
        <label htmlFor="contact-phone">Phone (optional)</label>
        <input id="contact-phone" name="phone" />
      </div>

      <div className="field full">
        <label htmlFor="contact-message">Message</label>
        <textarea id="contact-message" name="message" required />
      </div>

      <div className="button-row">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Message"}
        </button>
      </div>

      {state.status === "success" ? <p className="notice success">{state.message}</p> : null}
      {state.status === "error" ? <p className="notice error">{state.message}</p> : null}
    </form>
  );
}
