"use client";

import { useEffect, useState } from "react";

import { CountryMultiSelect } from "@/components/country-multi-select";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import {
  buildDefaultGeoblockingSettingsState,
  type GeoblockingSettingsState,
  type UnknownCountryModeValue
} from "@/lib/geoblocking-settings-contract";

type GeoblockingSettingsFormState = {
  allowedCountries: string[];
  unknownCountryMode: UnknownCountryModeValue;
  updatedAt: string | null;
};

function toFormState(input?: Partial<GeoblockingSettingsState>): GeoblockingSettingsFormState {
  const defaults = buildDefaultGeoblockingSettingsState();

  return {
    allowedCountries: input?.allowedCountries ?? defaults.allowedCountries,
    unknownCountryMode: input?.unknownCountryMode ?? defaults.unknownCountryMode,
    updatedAt: input?.updatedAt ?? null
  };
}

export function AdminGeoblockingSettingsEditor() {
  const [settings, setSettings] = useState<GeoblockingSettingsFormState>(() => toFormState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    async function load() {
      try {
        const response = await safeFetch("/api/admin/geoblocking-settings", { cache: "no-store" });
        if (!response.ok) {
          await handleApiError(response, "Failed to load geoblocking settings.");
          return;
        }

        const data = (await response.json()) as {
          geoblockingSettings?: Partial<GeoblockingSettingsState>;
        };

        setSettings(toFormState(data.geoblockingSettings));
      } catch {
        setError("Failed to load geoblocking settings.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [handleApiError, safeFetch]);

  async function saveSettings() {
    setSaving(true);
    setError("");
    setNotice("");
    setFieldErrors({});

    try {
      const response = await safeFetch("/api/admin/geoblocking-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedCountries: settings.allowedCountries,
          unknownCountryMode: settings.unknownCountryMode
        })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: Record<string, string>;
        } | null;
        setFieldErrors(data?.fieldErrors || {});
        await handleApiError(response, data?.error || "Failed to save geoblocking settings.");
        return;
      }

      const data = (await response.json()) as {
        geoblockingSettings?: Partial<GeoblockingSettingsState>;
      };
      setSettings(toFormState(data.geoblockingSettings));
      setNotice("Geoblocking settings saved.");
    } catch {
      setError("Failed to save geoblocking settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="helper-text">Loading geoblocking settings...</p>;
  }

  return (
    <AdminEditorSection
      title="Geoblocking"
      description="Control which countries can submit public booking and contact forms. Changes apply immediately without a service restart."
      notice={notice}
      error={error}
      actions={
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void saveSettings()}>
          {saving ? "Saving..." : "Save Geoblocking Settings"}
        </button>
      }
    >
      <AdminEditorPanel title="Allowed Countries" subdued>
        <AdminForm>
          <AdminField
            label="Country allowlist"
            description="Only visitors from these countries can submit the public booking and contact forms."
            error={fieldErrors.allowedCountries}
            fullWidth
          >
            <CountryMultiSelect
              selectedCodes={settings.allowedCountries}
              onChange={(allowedCountries) =>
                setSettings((current) => ({
                  ...current,
                  allowedCountries
                }))
              }
            />
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>

      <AdminEditorPanel title="Unknown Country Policy" subdued>
        <AdminForm>
          <AdminField
            label="Lookup fallback"
            description="Choose the default when the request IP cannot be resolved to a country."
            error={fieldErrors.unknownCountryMode}
            fullWidth
          >
            <div className="setup-radio-group">
              <label className="admin-inline-checkbox">
                <input
                  type="radio"
                  name="admin-unknownCountryMode"
                  value="allow"
                  checked={settings.unknownCountryMode === "allow"}
                  onChange={() =>
                    setSettings((current) => ({
                      ...current,
                      unknownCountryMode: "allow"
                    }))
                  }
                />
                Allow the submission when lookup fails
              </label>
              <label className="admin-inline-checkbox">
                <input
                  type="radio"
                  name="admin-unknownCountryMode"
                  value="block"
                  checked={settings.unknownCountryMode === "block"}
                  onChange={() =>
                    setSettings((current) => ({
                      ...current,
                      unknownCountryMode: "block"
                    }))
                  }
                />
                Block the submission when lookup fails
              </label>
            </div>
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>
    </AdminEditorSection>
  );
}
