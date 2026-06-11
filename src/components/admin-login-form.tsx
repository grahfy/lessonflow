"use client";

import { FormEvent, useState } from "react";

import { CaptchaField, useCaptcha } from "@/components/captcha";
import { useNoticeTween } from "@/components/motion/use-notice-tween";
import { invalidateCustomerEmailAlertsSessionCache } from "@/lib/admin/customer-email-alerts";

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
      setError("Please complete the CAPTCHA challenge.");
      void captcha.regenerate();
      return;
    }

    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    const website = String(form.get("website") || "");

    let response: Response;
    try {
      // Session cookie is set server-side; this request only submits credentials.
      response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          website,
          ...captcha.getPayload()
        })
      });
    } catch {
      setLoading(false);
      setError("Login failed. Please check your connection and try again.");
      await captcha.regenerate();
      return;
    }

    setLoading(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      const errorCode = body?.code;
      const errorMessage = body?.error || "Login failed. Check your email and password.";
      
      // Check if this is a CAPTCHA-related error
      const isCaptchaError = errorCode && [
        "HONEYPOT_FILLED",
        "CAPTCHA_RATE_LIMITED",
        "MISSING",
        "NOT_FOUND",
        "EXPIRED",
        "INVALID"
      ].includes(errorCode);
      
      if (isCaptchaError) {
        // Use onServerError to auto-refresh the CAPTCHA challenge
        captcha.onServerError(errorMessage);
      } else {
        setError(errorMessage);
      }
      return;
    }
    await captcha.regenerate();

    // Use a full navigation so the first admin page/data requests always include the newly set
    // httpOnly session cookie.
    invalidateCustomerEmailAlertsSessionCache();
    window.location.assign("/admin");
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
            aria-describedby="admin-password-toggle"
            required
          />
          <button
            type="button"
            id="admin-password-toggle"
            className="btn btn-sm password-visibility-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <CaptchaField idPrefix="admin-login" captcha={captcha} motionItem="admin-login-captcha-field" />
      <div className="button-row" data-motion-item="admin-login-actions">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </div>
      {error ? (
        <p className="notice error" role="alert" ref={errorNoticeRef} data-motion-item="admin-login-error-notice">
          {error}
        </p>
      ) : null}
    </form>
  );
}
