"use client";

import { useEffect, useState } from "react";

import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import {
  DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES,
  NOTIFICATION_CATEGORY_DEFINITIONS,
  type NotificationCategory,
  type NotificationCategoryPreferences,
  type NotificationSettingsState
} from "@/lib/email/notification-settings-contract";

type NotificationSettingsFormState = {
  globalAutomatedEmailEnabled: boolean;
  categoryPreferences: NotificationCategoryPreferences;
  automaticInvoiceRemindersEnabled: boolean;
  invoiceReminderFirstDelayDays: string;
  invoiceReminderResendIntervalDays: string;
  updatedAt: string | null;
};

const EMPTY_NOTIFICATION_SETTINGS: NotificationSettingsFormState = {
  globalAutomatedEmailEnabled: true,
  categoryPreferences: DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES,
  automaticInvoiceRemindersEnabled: true,
  invoiceReminderFirstDelayDays: "7",
  invoiceReminderResendIntervalDays: "7",
  updatedAt: null
};

function toFormState(input?: Partial<NotificationSettingsState>): NotificationSettingsFormState {
  return {
    globalAutomatedEmailEnabled: input?.globalAutomatedEmailEnabled ?? true,
    categoryPreferences: {
      ...DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES,
      ...(input?.categoryPreferences ?? {})
    },
    automaticInvoiceRemindersEnabled: input?.automaticInvoiceRemindersEnabled ?? true,
    invoiceReminderFirstDelayDays: String(input?.invoiceReminderFirstDelayDays ?? 7),
    invoiceReminderResendIntervalDays: String(input?.invoiceReminderResendIntervalDays ?? 7),
    updatedAt: input?.updatedAt ?? null
  };
}

export function AdminNotificationSettingsEditor() {
  const [settings, setSettings] = useState<NotificationSettingsFormState>(EMPTY_NOTIFICATION_SETTINGS);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    async function load() {
      try {
        const response = await safeFetch("/api/admin/notification-settings", { cache: "no-store" });
        if (!response.ok) {
          await handleApiError(response, "Failed to load notification settings.");
          return;
        }

        const data = (await response.json()) as {
          notificationSettings?: Partial<NotificationSettingsState>;
        };

        setSettings(toFormState(data.notificationSettings));
      } catch {
        setError("Failed to load notification settings.");
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
      const response = await safeFetch("/api/admin/notification-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalAutomatedEmailEnabled: settings.globalAutomatedEmailEnabled,
          categoryPreferences: settings.categoryPreferences,
          automaticInvoiceRemindersEnabled: settings.automaticInvoiceRemindersEnabled,
          invoiceReminderFirstDelayDays: settings.invoiceReminderFirstDelayDays,
          invoiceReminderResendIntervalDays: settings.invoiceReminderResendIntervalDays
        })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: Record<string, string>;
        } | null;
        setFieldErrors(data?.fieldErrors || {});
        await handleApiError(response, data?.error || "Failed to save notification settings.");
        return;
      }

      const data = (await response.json()) as {
        notificationSettings?: Partial<NotificationSettingsState>;
      };
      setSettings(toFormState(data.notificationSettings));
      setNotice("Notification settings saved.");
    } catch {
      setError("Failed to save notification settings.");
    } finally {
      setSaving(false);
    }
  }

  function updateCategory(category: NotificationCategory, value: boolean) {
    setSettings((current) => ({
      ...current,
      categoryPreferences: {
        ...current.categoryPreferences,
        [category]: value
      }
    }));
  }

  if (loading) {
    return <p className="helper-text">Loading notification settings...</p>;
  }

  return (
    <AdminEditorSection
      title="Notification Delivery Controls"
      description="Control automated and system-triggered outbound emails without changing environment configuration. Manual admin-sent emails are not affected by these toggles."
      notice={notice}
      error={error}
      listClassName="admin-editor-list-two-column"
      actions={
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void saveSettings()}>
          {saving ? "Saving..." : "Save Notification Settings"}
        </button>
      }
    >
      <AdminEditorPanel title="Global Automated Email Policy" subdued>
        <AdminForm>
          <AdminField
            label="Enable automated/system emails"
            tooltip="Turns automated contact, booking, digest, report, and automatic invoice reminder emails on or off in one place."
            fullWidth
          >
            <label className="admin-inline-checkbox">
              <input
                type="checkbox"
                checked={settings.globalAutomatedEmailEnabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    globalAutomatedEmailEnabled: event.target.checked
                  }))
                }
              />
              Automated notifications enabled
            </label>
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>

      <AdminEditorPanel title="Automated Categories" subdued>
        <AdminForm>
          {NOTIFICATION_CATEGORY_DEFINITIONS.map((category) => (
            <AdminField
              key={category.key}
              label={category.label}
              description={category.description}
              fullWidth
            >
              <label className="admin-inline-checkbox">
                <input
                  type="checkbox"
                  checked={settings.categoryPreferences[category.key]}
                  onChange={(event) => updateCategory(category.key, event.target.checked)}
                />
                Enabled
              </label>
            </AdminField>
          ))}
        </AdminForm>
      </AdminEditorPanel>

      <AdminEditorPanel title="Automatic Invoice Reminders" subdued>
        <AdminForm>
          <AdminField
            label="Enable automatic reminders"
            description="This affects scheduled and owner-batch reminder runs. Manual single-invoice reminders remain available."
            fullWidth
          >
            <label className="admin-inline-checkbox">
              <input
                type="checkbox"
                checked={settings.automaticInvoiceRemindersEnabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    automaticInvoiceRemindersEnabled: event.target.checked
                  }))
                }
              />
              Automatic invoice reminders enabled
            </label>
          </AdminField>

          <AdminField
            label="First reminder delay"
            description="How many overdue days must pass before the first automatic reminder is sent."
            error={fieldErrors.invoiceReminderFirstDelayDays}
          >
            <input
              type="number"
              min={1}
              max={365}
              value={settings.invoiceReminderFirstDelayDays}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  invoiceReminderFirstDelayDays: event.target.value
                }))
              }
            />
          </AdminField>

          <AdminField
            label="Resend interval"
            description="How many days the system waits before each follow-up automatic reminder."
            error={fieldErrors.invoiceReminderResendIntervalDays}
          >
            <input
              type="number"
              min={1}
              max={365}
              value={settings.invoiceReminderResendIntervalDays}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  invoiceReminderResendIntervalDays: event.target.value
                }))
              }
            />
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>
    </AdminEditorSection>
  );
}
