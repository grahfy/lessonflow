"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Tooltip } from "@/components/admin/ui/tooltip";
import { CaptchaField, useCaptcha } from "@/components/captcha";
import { TweenLink } from "@/components/motion/tween-link";
import { useNoticeTween } from "@/components/motion/use-notice-tween";

/**
 * Handles student credential login using full name + postcode + generated password.
 */
export function StudentLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const errorNoticeRef = useNoticeTween(Boolean(error));
  const captcha = useCaptcha();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    // CAPTCHA reduces trivial automated attempts before the server-side rate limit is engaged.
    if (!captcha.validateAnswer()) {
      setError("Please complete the CAPTCHA challenge.");
      void captcha.regenerate();
      return;
    }
    
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "");
    const postcode = String(form.get("postcode") || "").replace(/\D/g, "").slice(0, 4);
    const password = String(form.get("password") || "");
    const website = String(form.get("website") || "");

    // Student login is verified server-side against normalized name/postcode plus portal password.
    const response = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        postcode,
        password,
        website,
        ...captcha.getPayload()
      })
    });

    setLoading(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "Login failed. Check your full name, postcode, and password.");
      await captcha.regenerate();
      return;
    }
    await captcha.regenerate();

    // Full page transition is not required here because the client router refresh will read the
    // newly set httpOnly cookie on the next server request.
    router.push("/student/portal");
    router.refresh();
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} data-motion-item="student-login-form">
      <div className="field full" data-motion-item="student-login-full-name-field">
        <label htmlFor="student-full-name">Full name</label>
        <input id="student-full-name" name="fullName" autoComplete="name" required />
      </div>
      <div className="student-login-credentials-row" data-motion-item="student-login-credentials-row">
        <div className="field field-compact" data-motion-item="student-login-postcode-field">
          <label htmlFor="student-postcode">Postcode</label>
          <Tooltip content="Enter your 4-digit Australian postcode.">
            <input
              id="student-postcode"
              name="postcode"
              required
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]{4}"
              onInput={(event) => {
                event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
              }}
            />
          </Tooltip>
        </div>
        <div className="field" data-motion-item="student-login-password-field">
          <label htmlFor="student-password">Password</label>
          <input id="student-password" type="password" name="password" autoComplete="current-password" required />
        </div>
      </div>
      <CaptchaField idPrefix="student-login" captcha={captcha} motionItem="student-login-captcha-field" />
      <div className="button-row" data-motion-item="student-login-actions">
        <Tooltip content="Sign in using your full name, postcode, and portal password.">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in to portal"}
          </button>
        </Tooltip>
      </div>
      <p className="helper-text student-login-legal-links" data-motion-item="student-login-legal-links">
        <TweenLink href="/privacy">Privacy Policy</TweenLink>
        <span aria-hidden="true">•</span>
        <TweenLink href="/terms-of-service">Terms of Service</TweenLink>
      </p>
      {error ? (
        <p className="notice error" role="alert" ref={errorNoticeRef} data-motion-item="student-login-error-notice">
          {error}
        </p>
      ) : null}
    </form>
  );
}
