"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CountryMultiSelect } from "@/components/country-multi-select";
import { useNoticeTween } from "@/components/motion/use-notice-tween";
import type { SetupCheck, SetupReadiness } from "@/lib/setup";
import { buildDefaultGeoblockingSettingsState } from "@/lib/geoblocking-settings-contract";
import { SETUP_ACCESS_TOKEN_HEADER } from "@/lib/setup-access-constants";

type SetupWizardProps = {
  initialReadiness: SetupReadiness;
  setupAccessToken?: string | null;
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

/** Displays one readiness check result from the server-side setup evaluation. */
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
export function SetupWizard({ initialReadiness, setupAccessToken = null }: SetupWizardProps) {
  const router = useRouter();
  const initialGeoblockingState = useMemo(() => buildDefaultGeoblockingSettingsState(), []);
  const [readiness, setReadiness] = useState<SetupReadiness>(initialReadiness);
  const [isRefreshingChecks, setIsRefreshingChecks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>(initialGeoblockingState.allowedCountries);
  const [unknownCountryMode, setUnknownCountryMode] = useState<"allow" | "block">(
    initialGeoblockingState.unknownCountryMode
  );

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

  const buildSetupHeaders = useCallback((contentType?: string): HeadersInit => {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers["content-type"] = contentType;
    }
    if (setupAccessToken) {
      headers[SETUP_ACCESS_TOKEN_HEADER] = setupAccessToken;
    }
    return headers;
  }, [setupAccessToken]);

  /** Refreshes server-derived readiness checks without resetting the whole page. */
  async function refreshChecks() {
    setIsRefreshingChecks(true);
    setError("");

    try {
      // Status is server-derived because many checks cannot be safely/accurately evaluated client-side.
      const response = await fetch("/api/setup/status", {
        method: "GET",
        headers: buildSetupHeaders()
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
        method: "GET",
        headers: buildSetupHeaders()
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
  }, [buildSetupHeaders]);

  /**
   * Persists the editable environment variable values shown in the setup panel.
   *
   * RATIONALE: The browser only submits string values keyed by env var name; the
   * server owns secret handling, validation, and writing the effective config.
   */
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
        headers: buildSetupHeaders("application/json"),
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
      // NOTE: The env editor is lazy-loaded so first paint can focus on setup
      // readiness instead of immediately fetching every configurable variable.
      loadEnvVars();
    }
  }, [envConfigOpen, envVars.length, loadEnvVars]);

  /** Creates the first admin after the server revalidates readiness and policy. */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const form = event.currentTarget;
    const payload = {
      displayName: String((form.elements.namedItem("displayName") as HTMLInputElement)?.value || ""),
      email: String((form.elements.namedItem("email") as HTMLInputElement)?.value || ""),
      password: String((form.elements.namedItem("password") as HTMLInputElement)?.value || ""),
      confirmPassword: String((form.elements.namedItem("confirmPassword") as HTMLInputElement)?.value || ""),
      allowedCountries: selectedCountries,
      unknownCountryMode
    };

    try {
      // Server initialization re-checks readiness and password policy before creating the first admin.
      const response = await fetch("/api/setup/initialize", {
        method: "POST",
        headers: buildSetupHeaders("application/json"),
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

        // RATIONALE: Field-level validation can come back as a map, but the
        // setup shell still needs a compact summary message for the notice area.
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

        <div className="field full">
          <label htmlFor="setup-allowed-countries">Allowed countries</label>
          <p className="field-description">
            New installs start unrestricted. Narrow the countries here if you want public booking and contact submissions
            limited from day one.
          </p>
          <CountryMultiSelect
            selectedCodes={selectedCountries}
            onChange={setSelectedCountries}
            summaryWhenEmpty="Choose allowed countries"
          />
        </div>

        <div className="field full">
          <label>Unknown country lookups</label>
          <p className="field-description">
            Choose what happens when the request IP cannot be resolved to a country code.
          </p>
          <div className="setup-radio-group">
            <label className="admin-inline-checkbox">
              <input
                type="radio"
                name="unknownCountryMode"
                value="allow"
                checked={unknownCountryMode === "allow"}
                onChange={() => setUnknownCountryMode("allow")}
              />
              Allow the submission when lookup fails
            </label>
            <label className="admin-inline-checkbox">
              <input
                type="radio"
                name="unknownCountryMode"
                value="block"
                checked={unknownCountryMode === "block"}
                onChange={() => setUnknownCountryMode("block")}
              />
              Block the submission when lookup fails
            </label>
          </div>
        </div>

        <p className="helper-text form-required-note">
          Password policy: 12+ chars, uppercase, lowercase, number, symbol.
        </p>

        <div className="button-row">
          <button
            className="btn btn-primary"
            type="submit"
            disabled={isSubmitting || !readiness.canInitialize || selectedCountries.length === 0}
          >
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

      {readiness.canInitialize && selectedCountries.length === 0 ? (
        <p className="notice" data-motion-item="setup-geoblocking-notice">
          Select at least one allowed country before finishing setup.
        </p>
      ) : null}
    </div>
  );
}
