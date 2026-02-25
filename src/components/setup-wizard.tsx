"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type EnvVar = {
  key: string;
  title: string;
  description: string;
  placeholder: string;
  isRequired: boolean;
  isSecret: boolean;
  currentValue: string;
};

type EnvConfigResponse = {
  ok: boolean;
  envVars?: EnvVar[];
};

type EnvSaveResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

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
 * First-run setup wizard client for readiness checks, env configuration, and initial admin create.
 *
 * The browser handles UX state while the server remains the source of truth for readiness checks
 * (DB connectivity, filesystem access, env validation) and initialization.
 */
export function SetupWizard({ initialReadiness }: SetupWizardProps) {
  const router = useRouter();
  const [readiness, setReadiness] = useState<SetupReadiness>(initialReadiness);
  const [isRefreshingChecks, setIsRefreshingChecks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [envConfigOpen, setEnvConfigOpen] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [isLoadingEnvVars, setIsLoadingEnvVars] = useState(false);
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [envSaveError, setEnvSaveError] = useState("");
  const [envSaveSuccess, setEnvSaveSuccess] = useState("");
  const [envFieldErrors, setEnvFieldErrors] = useState<Record<string, string>>({});

  const errorNoticeRef = useNoticeTween(Boolean(error));

  const summary = useMemo(() => {
    return `${readiness.passCount} passed, ${readiness.warnCount} warnings, ${readiness.failCount} failures`;
  }, [readiness.failCount, readiness.passCount, readiness.warnCount]);

  async function refreshChecks() {
    setIsRefreshingChecks(true);
    setError("");

    try {
      // Status is server-derived because many checks cannot be safely/accurately evaluated client-side.
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

  const loadEnvVars = useCallback(async () => {
    setIsLoadingEnvVars(true);
    setEnvSaveError("");
    setEnvSaveSuccess("");

    try {
      // Load env metadata lazily when the config section is expanded to keep initial setup render
      // focused on readiness results.
      const response = await fetch("/api/setup/env", {
        method: "GET"
      });
      const body = (await response.json()) as EnvConfigResponse;

      if (!response.ok || !body.envVars) {
        setEnvSaveError("Could not load environment configuration.");
        return;
      }

      setEnvVars(body.envVars);
    } catch {
      setEnvSaveError("Could not load environment configuration.");
    } finally {
      setIsLoadingEnvVars(false);
    }
  }, []);

  async function saveEnvConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingEnv(true);
    setEnvSaveError("");
    setEnvSaveSuccess("");
    setEnvFieldErrors({});

    const form = event.currentTarget;
    // Flatten form inputs into the API contract used by /api/setup/configure.
    const payload: Record<string, string> = {};

    for (const envVar of envVars) {
      const input = form.elements.namedItem(envVar.key) as HTMLInputElement;
      if (input) {
        payload[envVar.key] = input.value;
      }
    }

    try {
      const response = await fetch("/api/setup/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json()) as EnvSaveResponse;

      if (!response.ok) {
        if (body.fieldErrors) {
          setEnvFieldErrors(body.fieldErrors);
        }
        setEnvSaveError(body.error || "Failed to save configuration.");
        return;
      }

      setEnvSaveSuccess(body.message || "Configuration saved.");
      refreshChecks();
    } catch {
      setEnvSaveError("Failed to save configuration.");
    } finally {
      setIsSavingEnv(false);
    }
  }

  useEffect(() => {
    if (envConfigOpen && envVars.length === 0) {
      loadEnvVars();
    }
  }, [envConfigOpen, envVars.length, loadEnvVars]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const form = event.currentTarget;
    const payload = {
      displayName: String((form.elements.namedItem("displayName") as HTMLInputElement)?.value || ""),
      email: String((form.elements.namedItem("email") as HTMLInputElement)?.value || ""),
      password: String((form.elements.namedItem("password") as HTMLInputElement)?.value || ""),
      confirmPassword: String((form.elements.namedItem("confirmPassword") as HTMLInputElement)?.value || "")
    };

    try {
      // Server initialization re-checks readiness and password policy before creating the first admin.
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

      <div className="env-config-section">
        <button
          type="button"
          className="env-config-toggle"
          onClick={() => setEnvConfigOpen(!envConfigOpen)}
          aria-expanded={envConfigOpen}
        >
          <span className="env-config-toggle-icon">{envConfigOpen ? "▼" : "▶"}</span>
          <span>Environment Configuration</span>
        </button>

        {envConfigOpen && (
          <div className="env-config-content">
            {isLoadingEnvVars ? (
              <p className="helper-text">Loading environment variables...</p>
            ) : (
              <form onSubmit={saveEnvConfig}>
                {envVars.map((envVar) => (
                  <div key={envVar.key} className="field">
                    <label htmlFor={`env-${envVar.key}`}>
                      {envVar.title}
                      {envVar.isRequired && <span className="required-mark">*</span>}
                      {envVar.isSecret && <span className="secret-mark"> (secret)</span>}
                    </label>
                    <p className="field-description">{envVar.description}</p>
                    <input
                      id={`env-${envVar.key}`}
                      name={envVar.key}
                      type={envVar.isSecret ? "password" : "text"}
                      placeholder={envVar.placeholder}
                      defaultValue={envVar.currentValue === "***SET***" ? "" : envVar.currentValue}
                      required={envVar.isRequired}
                      className={envFieldErrors[envVar.key] ? "input-error" : ""}
                    />
                    {envFieldErrors[envVar.key] && (
                      <p className="field-error">{envFieldErrors[envVar.key]}</p>
                    )}
                  </div>
                ))}

                {envSaveError && (
                  <p className="notice error">{envSaveError}</p>
                )}
                {envSaveSuccess && (
                  <p className="notice success">{envSaveSuccess}</p>
                )}

                <div className="button-row">
                  <button className="btn btn-primary" type="submit" disabled={isSavingEnv}>
                    {isSavingEnv ? "Saving..." : "Save Configuration"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

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
