"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useNoticeTween } from "@/components/motion/use-notice-tween";
import type { SetupCheck, SetupReadiness } from "@/lib/setup";

type SetupWizardProps = {
  initialReadiness: SetupReadiness;
};

type SetupStatusResponse = {
  readiness?: SetupReadiness;
};

type SetupInitializeResponse = {
  error?: string;
  nextPath?: string;
  readiness?: SetupReadiness;
  details?: {
    fieldErrors?: Record<string, string[]>;
  };
};

/**
 * Renders one requirement-check row with a severity status chip.
 */
function SetupCheckRow({ check }: { check: SetupCheck }) {
  return (
    <li className={`setup-check setup-check-${check.status}`}>
      <div className="setup-check-row">
        <strong>{check.title}</strong>
        <span className={`setup-status-pill setup-status-${check.status}`}>{check.status}</span>
      </div>
      <p>{check.detail}</p>
    </li>
  );
}

/**
 * First-run setup wizard UI for re-running checks and creating first admin.
 */
export function SetupWizard({ initialReadiness }: SetupWizardProps) {
  const router = useRouter();
  const [readiness, setReadiness] = useState<SetupReadiness>(initialReadiness);
  const [isRefreshingChecks, setIsRefreshingChecks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const errorNoticeRef = useNoticeTween(Boolean(error));

  const summary = useMemo(() => {
    return `${readiness.passCount} passed, ${readiness.warnCount} warnings, ${readiness.failCount} failures`;
  }, [readiness.failCount, readiness.passCount, readiness.warnCount]);

  /**
   * Pulls latest setup checks from the server.
   */
  async function refreshChecks() {
    setIsRefreshingChecks(true);
    setError("");

    try {
      const response = await fetch("/api/setup/status", {
        method: "GET"
      });
      const body = (await response.json()) as SetupStatusResponse;

      if (!response.ok || !body.readiness) {
        setError("Could not refresh setup checks.");
        return;
      }

      setReadiness(body.readiness);
    } catch {
      setError("Could not refresh setup checks.");
    } finally {
      setIsRefreshingChecks(false);
    }
  }

  /**
   * Submits first-admin credentials and initializes setup.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      displayName: String(form.get("displayName") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      confirmPassword: String(form.get("confirmPassword") || "")
    };

    try {
      const response = await fetch("/api/setup/initialize", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json()) as SetupInitializeResponse;

      if (!response.ok) {
        if (body.readiness) {
          setReadiness(body.readiness);
        }

        const fieldErrorMessage = Object.values(body.details?.fieldErrors || {})
          .flat()
          .filter(Boolean)
          .join(" ")
          .trim();

        setError(fieldErrorMessage || body.error || "Setup initialization failed.");
        return;
      }

      router.push(body.nextPath || "/admin/bookings");
      router.refresh();
    } catch {
      setError("Setup initialization failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="setup-wizard" data-motion-item="setup-wizard">
      <div className="setup-summary" data-motion-item="setup-summary">
        <p className="helper-text">Setup checks: {summary}</p>
        <button className="btn btn-secondary" type="button" onClick={refreshChecks} disabled={isRefreshingChecks || isSubmitting}>
          {isRefreshingChecks ? "Refreshing checks..." : "Re-run checks"}
        </button>
      </div>

      <ul className="setup-check-list" data-motion-item="setup-check-list">
        {readiness.checks.map((check) => (
          <SetupCheckRow key={check.id} check={check} />
        ))}
      </ul>

      <form className="form-grid" onSubmit={onSubmit} data-motion-item="setup-form">
        <div className="field">
          <label htmlFor="setup-display-name">Display name</label>
          <input id="setup-display-name" name="displayName" type="text" required autoComplete="name" />
        </div>

        <div className="field">
          <label htmlFor="setup-email">Admin email</label>
          <input id="setup-email" name="email" type="email" required autoComplete="username" />
        </div>

        <div className="field">
          <label htmlFor="setup-password">Password</label>
          <input id="setup-password" name="password" type="password" required autoComplete="new-password" />
        </div>

        <div className="field">
          <label htmlFor="setup-confirm-password">Confirm password</label>
          <input id="setup-confirm-password" name="confirmPassword" type="password" required autoComplete="new-password" />
        </div>

        <p className="helper-text form-required-note">
          Password policy: 12+ chars, uppercase, lowercase, number, symbol.
        </p>

        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting || !readiness.canInitialize}>
            {isSubmitting ? "Initializing..." : "Initialize setup"}
          </button>
        </div>
      </form>

      {!readiness.canInitialize ? (
        <p className="notice" data-motion-item="setup-blocked-notice">
          Setup is blocked until all failing checks are resolved.
        </p>
      ) : null}

      {error ? (
        <p className="notice error" ref={errorNoticeRef} data-motion-item="setup-error-notice">
          {error}
        </p>
      ) : null}
    </div>
  );
}
