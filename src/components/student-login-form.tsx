"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { useNoticeTween } from "@/components/motion/use-notice-tween";
import { useCaptcha } from "@/components/captcha";

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
      setError("Please answer the math question correctly.");
      captcha.regenerate();
      return;
    }
    
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "");
    const postcode = String(form.get("postcode") || "").replace(/\D/g, "").slice(0, 4);
    const password = String(form.get("password") || "");

    // Student login is verified server-side against normalized name/postcode plus portal password.
    const response = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, postcode, password })
    });

    setLoading(false);
    if (!response.ok) {
      setError("Login failed. Check your full name, postcode, and password.");
      return;
    }

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
      <div className="field field-compact" data-motion-item="student-login-postcode-field">
        <label htmlFor="student-postcode">Postcode</label>
        <input
          id="student-postcode"
          name="postcode"
          required
          maxLength={4}
          inputMode="numeric"
          pattern="[0-9]{4}"
          title="Postcode must be exactly 4 digits."
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
          }}
        />
      </div>
      <div className="field full" data-motion-item="student-login-password-field">
        <label htmlFor="student-password">Password</label>
        <input id="student-password" type="password" name="password" autoComplete="current-password" required />
      </div>
      <div className="field full" data-motion-item="student-login-captcha-field">
        <label htmlFor="student-captcha">
          Security question: {captcha.captcha?.question}
        </label>
        <input
          id="student-captcha"
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
      <div className="button-row" data-motion-item="student-login-actions">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in to portal"}
        </button>
      </div>
      {error ? (
        <p className="notice error" ref={errorNoticeRef} data-motion-item="student-login-error-notice">
          {error}
        </p>
      ) : null}
    </form>
  );
}
