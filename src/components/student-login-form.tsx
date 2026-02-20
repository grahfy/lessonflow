"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { useNoticeTween } from "@/components/motion/use-notice-tween";

/**
 * Handles student credential login using full name + postcode + generated password.
 */
export function StudentLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const errorNoticeRef = useNoticeTween(Boolean(error));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "");
    const postcode = String(form.get("postcode") || "").replace(/\D/g, "").slice(0, 4);
    const password = String(form.get("password") || "");

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
