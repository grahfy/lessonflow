/**
 * Admin Configuration & Whitelabel Console
 * 
 * Provides a unified interface for managing application-wide settings, 
 * ranging from branding (Logos/Names) to financial policies (GST/Bank Details) 
 * and technical secrets (API Keys/Secrets).
 * 
 * DESIGN RATIONALE:
 * 1. Environment-Backed: Many settings map directly to `.env` variables 
 *    on the server. This allows for persistent configuration that survives 
 *    code deployments.
 * 2. Tabbed Logic: High-complexity settings are partitioned into "Branding", 
 *    "System", "Invoices", and "Content" to reduce cognative load.
 * 3. Security: Secret fields (like `SMTP_PASS`) are masked (displayed as ***SET***) 
 *    when hydrated from the server to prevent accidental exposure 
 *    in the UI.
 * 4. Atomic Updates: Validation ensures critical fields (like Admin Email) 
 *    trigger a re-authentication flow if changed to maintain session integrity.
 */

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminTabNav } from "@/components/admin/ui/admin-tab-nav";
import { AdminPresetsEditor } from "@/components/admin/settings/presets-editor";
import { AdminContentEditor } from "@/components/admin/settings/content-editor";
import { AdminEmailSignatureEditor } from "@/components/admin/settings/email-signature-editor";
import { AdminGeoblockingSettingsEditor } from "@/components/admin/settings/geoblocking-settings-editor";
import { AdminLessonPricingEditor } from "@/components/admin/settings/lesson-pricing-editor";
import { AdminNotificationSettingsEditor } from "@/components/admin/settings/notification-settings-editor";
import { AdminEmailTemplateEditor } from "@/components/admin/settings/email-template-editor";
import { AdminInvoiceTemplateEditor } from "@/components/admin/invoices/invoice-template-editor";
import { CustomerEmailAlertStatus } from "@/components/admin/settings/customer-email-alert-status";
import { Tooltip } from "@/components/admin/ui/tooltip";

import { invalidateCustomerEmailAlertsSessionCache } from "@/lib/admin/customer-email-alerts";
import { useSettings, type EnvVarField } from "@/lib/admin/use-settings";

type TabKey = "branding" | "pages" | "emails" | "invoices" | "products" | "lesson-pricing" | "system";

const SETTINGS_TABS: Array<{ key: TabKey; label: string; tooltip: string }> = [
  { key: "branding", label: "Branding", tooltip: "Configure brand names, logos, and contact information." },
  { key: "pages", label: "Pages", tooltip: "Edit content for the student portal and legal pages." },
  { key: "emails", label: "Emails", tooltip: "Customize email templates sent to students and staff." },
  { key: "invoices", label: "Invoices", tooltip: "Manage invoice numbering, payment terms, and visual templates." },
  { key: "products", label: "Products", tooltip: "Configure catalog items like tuition types and textbooks." },
  { key: "lesson-pricing", label: "Lesson Info / Prices", tooltip: "Manage lesson durations and prices used by admin invoicing and booking workflows." },
  { key: "system", label: "System", tooltip: "Advanced configuration for databases, security, and email delivery routes." }
];

const HIDDEN_GMAIL_ALERT_ENV_KEYS = new Set([
  "ADMIN_CUSTOMER_EMAIL_ALERTS_PROVIDER",
  "ADMIN_CUSTOMER_EMAIL_ALERTS_ENABLED"
]);

/**
 * Main Client Component for the Admin Settings route.
 */
export function AdminSettingsClient() {
  const router = useRouter();
  
  // Local UI State
  const [activeTab, setActiveTab] = useState<TabKey>("branding");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasLoadedInitialSettings, setHasLoadedInitialSettings] = useState(false);
  
  // Form State
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  // Password Rotation State
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  // -- DATA HOOK --
  const { 
    settings, 
    loading, 
    saving, 
    load: loadSettings, 
    save: saveSettingsApi 
  } = useSettings({ onAuthError, onError: setError });
  const isSettingsWorkspaceLoading = loading || !hasLoadedInitialSettings;

  useEffect(() => {
    let cancelled = false;

    void loadSettings().finally(() => {
      if (!cancelled) {
        setHasLoadedInitialSettings(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  /** Hydrate form values from server settings once loaded. */
  useEffect(() => {
    if (settings?.envVars) {
      setValues(
        Object.fromEntries(
          settings.envVars.map((item) => [
            item.key, 
            item.currentValue === "***SET***" ? "" : item.currentValue
          ])
        )
      );
    }
  }, [settings]);

  /**
   * Grouping Logic
   * RATIONALE: We manually group environment variables into logical UI sections
   * to ensure a structured, user-friendly configuration experience.
   */
  const groupedVars = useMemo(() => {
    if (!settings?.envVars) return [];
    
    const groups: Array<{ title: string; keys: string[]; tab: TabKey }> = [
      {
        title: "Branding & Identity",
        tab: "branding",
        keys: [
          "NEXT_PUBLIC_BRAND_NAME",
          "NEXT_PUBLIC_PRIMARY_SUBJECT",
          "NEXT_PUBLIC_PRIMARY_LOCATION",
          "NEXT_PUBLIC_LOGO_URL",
          "NEXT_PUBLIC_INVOICE_LOGO_URL",
          "NEXT_PUBLIC_FAVICON_URL",
          "NEXT_PUBLIC_CONTACT_PHONE",
          "NEXT_PUBLIC_CONTACT_ADDRESS"
        ]
      },
      {
        title: "Core System",
        tab: "system",
        keys: ["DATABASE_URL", "NEXT_PUBLIC_SITE_URL", "ADMIN_EMAIL"]
      },
      {
        title: "Email Delivery",
        tab: "system",
        keys: [
          "GMAIL_CLIENT_ID",
          "GMAIL_CLIENT_SECRET",
          "GMAIL_REFRESH_TOKEN",
          "GMAIL_USER_EMAIL",
          "IMAP_HOST",
          "IMAP_PORT",
          "IMAP_USER",
          "IMAP_PASS",
          "IMAP_TLS",
          "IMAP_MAILBOX",
          "SMTP_HOST",
          "SMTP_PORT",
          "SMTP_USER",
          "SMTP_PASS",
          "SMTP_FROM"
        ]
      },
      {
        title: "Security & Encryption",
        tab: "system",
        keys: [
          "ADMIN_SESSION_SECRET", 
          "STUDENT_SESSION_SECRET", 
          "STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY", 
          "CRON_SECRET"
        ]
      },
      {
        title: "Invoices & Payments (Taxation)",
        tab: "invoices",
        keys: [
          "INVOICE_BUSINESS_NAME",
          "INVOICE_BUSINESS_ABN",
          "INVOICE_BANK_NAME",
          "INVOICE_BANK_BSB",
          "INVOICE_BANK_ACCOUNT_NAME",
          "INVOICE_BANK_ACCOUNT_NUMBER",
          "INVOICE_PAYMENT_TERMS_DAYS",
          "INVOICE_GST_REGISTERED",
          "INVOICE_DEFAULT_TAX_MODE",
          "INVOICE_CREDIT_NOTE_PREFIX",
          "NEXT_PUBLIC_DEFAULT_CURRENCY"
        ]
      },
      {
        title: "Student Portal (Access Control)",
        tab: "system",
        keys: ["STUDENT_SESSION_MAX_AGE_SECONDS", "STUDENT_PORTAL_PASSWORD_LENGTH"]
      }
    ];

    const byKey = new Map(settings.envVars.map((item) => [item.key, item]));
    const seen = new Set<string>();

    const ordered = groups
      .map((group) => ({
        title: group.title,
        tab: group.tab,
        items: group.keys.map((key) => byKey.get(key)).filter((item): item is EnvVarField => Boolean(item))
      }))
      .filter((group) => group.items.length > 0);

    for (const group of ordered) {
      for (const item of group.items) seen.add(item.key);
    }

    // Capture any dynamically added variables that weren't manually categorized.
    const uncategorized = settings.envVars.filter((item) => !seen.has(item.key) && !HIDDEN_GMAIL_ALERT_ENV_KEYS.has(item.key));
    if (uncategorized.length > 0) {
      ordered.push({ title: "Additional Config", tab: "system", items: uncategorized });
    }

    return ordered;
  }, [settings]);

  const activeTabConfig = useMemo(
    () => SETTINGS_TABS.find((tab) => tab.key === activeTab) ?? SETTINGS_TABS[0],
    [activeTab]
  );
  const activeGroupCount = useMemo(
    () => groupedVars.filter((group) => group.tab === activeTab).length,
    [activeTab, groupedVars]
  );
  const activeFieldCount = useMemo(
    () =>
      groupedVars
        .filter((group) => group.tab === activeTab)
        .reduce((total, group) => total + group.items.length, 0),
    [activeTab, groupedVars]
  );

  /** Finalizes form submission and handles re-auth consequences. */
  async function handleSave() {
    setFieldErrors({});
    setError("");
    setNotice("");

    // Validate password identity before sending to server
    if (adminPassword || confirmAdminPassword) {
      if (adminPassword !== confirmAdminPassword) {
        setFieldErrors({ ADMIN_PASSWORD_CONFIRM: "Passwords do not match." });
        return;
      }
    }

    const payload = {
      env: Object.fromEntries((settings?.envVars || []).map((item) => [item.key, values[item.key] ?? ""])),
      adminPassword: adminPassword.trim().length > 0 ? adminPassword : ""
    };

    const body = await saveSettingsApi(payload);
    if (!body) return;

    if (!body.ok) {
      setFieldErrors(body.fieldErrors || {});
      setError(body.message || "Unable to save settings.");
      return;
    }

    setNotice(body.message || "Settings saved.");
    setAdminPassword("");
    setConfirmAdminPassword("");

    // Handle logout if the email/password was changed
    if (body.requiresReauth) {
      setNotice(`${body.message || "Settings saved."} Identity changed, please sign in again.`);
      window.setTimeout(() => {
        router.push(body.nextPath || "/admin/login");
        router.refresh();
      }, 1200);
    } else {
      invalidateCustomerEmailAlertsSessionCache();
      void loadSettings();
    }
  }

  /** Renders the environment variable form fields for a specific tab. */
  const renderEnvFields = (tab: TabKey) => {
    const groupsInTab = groupedVars.filter(g => g.tab === tab);
    if (groupsInTab.length === 0) return null;

    return (
      <AdminCard className="form-grid">
        {groupsInTab.map((group) => (
          <div key={group.title} className="field full">
            <div className="admin-settings-section">
              <h2 className="admin-settings-section-title">{group.title}</h2>
              {/* Specialized status row for inbox-backed customer email alerts */}
              {group.title === "Email Delivery" && <CustomerEmailAlertStatus />}
              
              <AdminForm>
                {group.items.map((envVar) => {
                  const fieldError = fieldErrors[envVar.key];
                  const isSecret = envVar.isSecret;
                  const isBoolean = envVar.inputType === "boolean";
                  const isSelect = envVar.inputType === "select";
                  const defaultValue =
                    isBoolean || isSelect
                      ? envVar.placeholder || (isBoolean ? "false" : envVar.options?.[0]?.value || "")
                      : "";
                  const resolvedValue = values[envVar.key] || envVar.currentValue || defaultValue;
                  const placeholder =
                    isSecret && envVar.currentValue === "***SET***"
                      ? `${envVar.placeholder || ""} (leave blank to keep current value)`
                      : envVar.placeholder;

                  return (
                    <AdminField
                      key={envVar.key}
                      label={envVar.title}
                      required={envVar.isRequired}
                      tooltip={envVar.description}
                      error={fieldError}
                      htmlFor={`admin-setting-${envVar.key}`}
                    >
                      {isBoolean ? (
                        <label className="admin-inline-checkbox" htmlFor={`admin-setting-${envVar.key}`}>
                          <input
                            id={`admin-setting-${envVar.key}`}
                            name={envVar.key}
                            type="checkbox"
                            checked={resolvedValue === "true"}
                            onChange={(event) =>
                              setValues((prev) => ({
                                ...prev,
                                [envVar.key]: event.target.checked ? "true" : "false"
                              }))
                            }
                          />
                          Enabled
                        </label>
                      ) : isSelect ? (
                        <select
                          id={`admin-setting-${envVar.key}`}
                          name={envVar.key}
                          value={resolvedValue}
                          onChange={(event) =>
                            setValues((prev) => ({
                              ...prev,
                              [envVar.key]: event.target.value
                            }))
                          }
                          className={fieldError ? "input-error" : ""}
                        >
                          {(envVar.options || []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`admin-setting-${envVar.key}`}
                          name={envVar.key}
                          type={envVar.isSecret ? "password" : "text"}
                          placeholder={placeholder}
                          value={values[envVar.key] ?? ""}
                          onChange={(event) =>
                            setValues((prev) => ({
                              ...prev,
                              [envVar.key]: event.target.value
                            }))
                          }
                          className={fieldError ? "input-error" : ""}
                          autoComplete="off"
                        />
                      )}
                    </AdminField>
                  );
                })}
              </AdminForm>
            </div>
          </div>
        ))}

        <div className="field full">
          <div className="button-row">
            <Tooltip content="Apply and save changes to these settings.">
              <button className="btn btn-primary" type="button" disabled={saving} onClick={handleSave}>
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            </Tooltip>
          </div>
        </div>
      </AdminCard>
    );
  };

  return (
    <AdminShell 
      title="Admin Configuration" 
      error={error} 
      notice={notice} 
      loading={isSettingsWorkspaceLoading} 
      className="admin-shell-settings"
    >
      <div className="admin-layout-content is-scrollable">
        <div className="admin-settings-sticky-stack">
          <AdminCard className="admin-toolbar-card admin-actions-card admin-workspace-panel admin-settings-workspace">
            <div className="admin-workspace-head">
              <div className="admin-workspace-copy">
                <p className="admin-inline-field">Configuration Console</p>
                <h2 className="admin-workspace-title">{activeTabConfig.label}</h2>
                <p className="helper-text admin-workspace-summary">{activeTabConfig.tooltip}</p>
                <div className="admin-workspace-chip-row" aria-label="Settings workspace context">
                  <span className="admin-workspace-chip">
                    {isSettingsWorkspaceLoading ? "Loading sections" : `${activeGroupCount} section${activeGroupCount === 1 ? "" : "s"} in view`}
                  </span>
                  <span className="admin-workspace-chip">
                    {isSettingsWorkspaceLoading ? "Loading fields" : `${activeFieldCount} environment field${activeFieldCount === 1 ? "" : "s"}`}
                  </span>
                  <span className="admin-workspace-chip">{isSettingsWorkspaceLoading ? "Hydrating settings" : saving ? "Save in progress" : "Draft edits local"}</span>
                </div>
              </div>
              <div className="admin-workspace-actions">
                <Tooltip content="Apply and save configuration changes for this admin section.">
                  <button className="btn btn-primary" type="button" disabled={saving || isSettingsWorkspaceLoading} onClick={handleSave}>
                    {saving ? "Saving..." : "Save Configuration"}
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="admin-workspace-stats" aria-label="Configuration summary">
              <div className="admin-workspace-stat">
                <span className="admin-workspace-stat-label">Current tab</span>
                <strong>{activeTabConfig.label}</strong>
              </div>
              <div className="admin-workspace-stat">
                <span className="admin-workspace-stat-label">Visible groups</span>
                <strong>{isSettingsWorkspaceLoading ? "—" : activeGroupCount}</strong>
              </div>
              <div className="admin-workspace-stat">
                <span className="admin-workspace-stat-label">Visible fields</span>
                <strong>{isSettingsWorkspaceLoading ? "—" : activeFieldCount}</strong>
              </div>
              <div className="admin-workspace-stat">
                <span className="admin-workspace-stat-label">Config tabs</span>
                <strong>{SETTINGS_TABS.length}</strong>
              </div>
            </div>
          </AdminCard>

          <AdminCard className="admin-toolbar-card admin-tab-toolbar booking-row admin-actions-bar">
            <AdminTabNav activeKey={activeTab} items={SETTINGS_TABS} onChange={setActiveTab} />
          </AdminCard>
        </div>

        {!loading && (
          <>
            {/* 1. Branding Tab (Logo, Name, etc) */}
            {activeTab === "branding" && renderEnvFields("branding")}
            
            {/* 2. Content Pages Editor (Terms, Lessons) */}
            {activeTab === "pages" && <AdminContentEditor />}
            
            {/* 3. Email Templates (Audit Logs, Receipts) */}
            {activeTab === "emails" && (
              <>
                <AdminNotificationSettingsEditor />
                <AdminEmailSignatureEditor />
                <AdminEmailTemplateEditor />
              </>
            )}
            
            {/* 4. Invoice Branding & Numbering */}
            {activeTab === "invoices" && (
              <>
                {renderEnvFields("invoices")}
                <AdminInvoiceTemplateEditor />
              </>
            )}
            
            {/* 5. Product Presets (Textbooks, Tuition) */}
            {activeTab === "products" && <AdminPresetsEditor />}

            {/* 6. Lesson duration and pricing catalog */}
            {activeTab === "lesson-pricing" && <AdminLessonPricingEditor />}
            
            {/* 7. System & Security Console */}
            {activeTab === "system" && (
              <>
                {renderEnvFields("system")}
                <AdminGeoblockingSettingsEditor />
                <AdminCard>
                  <h2 className="admin-settings-section-title">Admin Password Management</h2>
                  <AdminForm>
                    <AdminField label="New Password" tooltip="Required only if changing the admin password.">
                      <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} autoComplete="new-password" />
                    </AdminField>
                    <AdminField label="Confirm New Password" tooltip="Must match the new password above." error={fieldErrors.ADMIN_PASSWORD_CONFIRM}>
                      <input type="password" value={confirmAdminPassword} onChange={e => setConfirmAdminPassword(e.target.value)} autoComplete="new-password" />
                    </AdminField>
                    <div className="field full">
                      <Tooltip content="Update the administrator password. This will require you to log in again.">
                        <button className="btn btn-primary" onClick={handleSave}>Rotate Credentials</button>
                      </Tooltip>
                    </div>
                  </AdminForm>
                </AdminCard>
              </>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
