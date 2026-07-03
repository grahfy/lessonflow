"use client";

import { FormEvent, useState } from "react";

import { Tooltip } from "@/components/admin/ui/tooltip";
import { useNoticeTween } from "@/components/motion/use-notice-tween";

/**
 * Passwordless login: the student enters their email and receives a one-tap
 * magic link. No CAPTCHA and no password. The response is always generic so the
 * form never reveals whether an account exists.
 */
export function StudentMagicLinkForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const errorNoticeRef = useNoticeTween(Boolean(error));
  const sentNoticeRef = useNoticeTween(sent);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const website = String(form.get("website") || "");

    try {
      const response = await fetch("/api/student/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || "Could not send a login link. Please try again.");
        return;
      }

      // Generic, enumeration-safe confirmation regardless of whether the email matched.
      setSent(true);
    } catch {
      setError("Could not send a login link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} data-motion-item="student-magic-link-form">
      <div className="field full" data-motion-item="student-magic-link-email-field">
        <label htmlFor="student-magic-link-email">Email address</label>
        <input
          id="student-magic-link-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>
      {/* Honeypot: hidden from real users; bots that fill it get a silent no-op. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="student-magic-link-website">Leave this field empty</label>
        <input id="student-magic-link-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="button-row" data-motion-item="student-magic-link-actions">
        <Tooltip content="We'll email you a one-tap link to sign in — no password or CAPTCHA needed.">
          <button className="btn btn-secondary" type="submit" disabled={loading || sent}>
            {loading ? "Sending link..." : "Email me a login link"}
          </button>
        </Tooltip>
      </div>
      {sent ? (
        <p className="notice success" role="status" ref={sentNoticeRef} data-motion-item="student-magic-link-sent-notice">
          If an account matches that email, we&apos;ve sent a login link. Please check your inbox.
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert" ref={errorNoticeRef} data-motion-item="student-magic-link-error-notice">
          {error}
        </p>
      ) : null}
    </form>
  );
}
