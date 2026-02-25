"use client";

import { FormEvent, useState } from "react";

import { useNoticeTween } from "@/components/motion/use-notice-tween";
import { useCaptcha } from "@/components/captcha";

/**
 * Admin login form with a lightweight anti-bot captcha.
 *
 * The server remains the source of truth for rate limiting and credential checks; this component
 * focuses on UX (captcha gating, error display, and post-login navigation).
 */
export function AdminLoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const errorNoticeRef = useNoticeTween(Boolean(error));
  const captcha = useCaptcha();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Client-side captcha reduces trivial automated noise before hitting the login API.
    if (!captcha.validateAnswer()) {
      setError("Please answer the math question correctly.");
      captcha.regenerate();
      return;
    }

    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    let response: Response;
    try {
      // Session cookie is set server-side; this request only submits credentials.
      response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
    } catch {
      setLoading(false);
      setError("Login failed. Please check your connection and try again.");
      return;
    }

    setLoading(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "Login failed. Check your email and password.");
      return;
    }

    // Use a full navigation so the first admin page/data requests always include the newly set
    // httpOnly session cookie.
    window.location.assign("/admin/bookings");
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} data-motion-item="admin-login-form">
      <div className="field full" data-motion-item="admin-login-email-field">
        <label htmlFor="admin-email">Admin email</label>
        <input id="admin-email" type="email" name="email" autoComplete="username" required />
      </div>
      <div className="field full" data-motion-item="admin-login-password-field">
        <label htmlFor="admin-password">Password</label>
        <div className="password-input-row">
          <input
            id="admin-password"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="btn btn-small password-visibility-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <div className="field full" data-motion-item="admin-login-captcha-field">
        <label htmlFor="admin-captcha">
          Security question: {captcha.captcha?.question}
        </label>
        <input
          id="admin-captcha"
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
      <div className="button-row" data-motion-item="admin-login-actions">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </div>
      {error ? (
        <p className="notice error" ref={errorNoticeRef} data-motion-item="admin-login-error-notice">
          {error}
        </p>
      ) : null}
    </form>
  );
}
