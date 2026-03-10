"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { AdminPresetsEditor } from "@/components/admin/settings/presets-editor";
import { AdminContentEditor } from "@/components/admin/settings/content-editor";
import { AdminEmailTemplateEditor } from "@/components/admin/settings/email-template-editor";
import { AdminInvoiceTemplateEditor } from "@/components/admin/invoices/invoice-template-editor";
import { GmailStatus } from "@/components/admin/settings/gmail-status";

import { useSettings, type EnvVarField } from "@/lib/admin/use-settings";

type TabKey = "branding" | "pages" | "emails" | "invoices" | "products" | "system";

/**
 * Refactored Admin Settings with multi-tab layout for full whitelabel control.
 * Uses centralized hooks and UI components.
 */
export function AdminSettingsClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("branding");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  const { settings, loading, saving, load: loadSettings, save: saveSettingsApi } = useSettings({ onAuthError, onError: setError });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings?.envVars) {
      setValues(
        Object.fromEntries(
          settings.envVars.map((item) => [item.key, item.currentValue === "***SET***" ? "" : item.currentValue])
        )
      );
    }
  }, [settings]);

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
          "SMTP_HOST",
          "SMTP_PORT",
          "SMTP_USER",
          "SMTP_PASS",
          "SMTP_FROM"
        ]
      },
      {
        title: "Security",
        tab: "system",
        keys: ["ADMIN_SESSION_SECRET", "STUDENT_SESSION_SECRET", "STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY", "CRON_SECRET"]
      },
      {
        title: "Invoices & Payments",
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
        title: "Student Portal Settings",
        tab: "system",
        keys: ["STUDENT_SESSION_MAX_AGE_SECONDS", "STUDENT_PORTAL_PASSWORD_LENGTH"]
      }
    ];

    const byKey = new Map(settings.envVars.map((item) => [item.key, item]));
    const seen = new Set<string>();

    const ordered: Array<{ title: string; tab: TabKey; items: EnvVarField[] }> = groups
      .map((group) => ({
        title: group.title,
        tab: group.tab,
        items: group.keys.map((key) => byKey.get(key)).filter((item): item is EnvVarField => Boolean(item))
      }))
      .filter((group) => group.items.length > 0);

    for (const group of ordered) {
      for (const item of group.items) {
        seen.add(item.key);
      }
    }

    const uncategorized = settings.envVars.filter((item) => !seen.has(item.key));
    if (uncategorized.length > 0) {
      ordered.push({ title: "Other Config", tab: "system", items: uncategorized });
    }

    return ordered;
  }, [settings]);

  async function handleSave() {
    setFieldErrors({});
    setError("");
    setNotice("");

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

    if (body.requiresReauth) {
      setNotice(`${body.message || "Settings saved."} Admin email changed, please sign in again.`);
      window.setTimeout(() => {
        router.push(body.nextPath || "/admin/login");
        router.refresh();
      }, 1200);
    } else {
      void loadSettings();
    }
  }

  const renderEnvFields = (tab: TabKey) => {
    const groupsInTab = groupedVars.filter(g => g.tab === tab);
    if (groupsInTab.length === 0) return null;

    return (
      <AdminCard className="form-grid">
        {groupsInTab.map((group) => (
          <div key={group.title} className="field full">
            <div className="admin-settings-section">
              <h2 className="admin-settings-section-title">{group.title}</h2>
              {group.title === "Email Delivery" && <GmailStatus />}
              <AdminForm>
                {group.items.map((envVar) => {
                  const fieldError = fieldErrors[envVar.key];
                  const isSecret = envVar.isSecret;
                  const placeholder =
                    isSecret && envVar.currentValue === "***SET***"
                      ? `${envVar.placeholder || ""} (leave blank to keep current value)`
                      : envVar.placeholder;

                  return (
                    <AdminField
                      key={envVar.key}
                      label={envVar.title}
                      required={envVar.isRequired}
                      description={envVar.description}
                      error={fieldError}
                      htmlFor={`admin-setting-${envVar.key}`}
                    >
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
                    </AdminField>
                  );
                })}
              </AdminForm>
            </div>
          </div>
        ))}

        <div className="field full">
          <div className="button-row">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </div>
      </AdminCard>
    );
  };

  return (
    <AdminShell title="Admin Configuration" error={error} notice={notice} loading={loading} className="admin-shell-settings">
      <div className="admin-layout-content is-scrollable">
        <AdminCard className="booking-row">
          <div className="site-nav">
            <button className={`btn ${activeTab === "branding" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("branding")}>Branding</button>
            <button className={`btn ${activeTab === "pages" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("pages")}>Pages</button>
            <button className={`btn ${activeTab === "emails" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("emails")}>Emails</button>
            <button className={`btn ${activeTab === "invoices" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("invoices")}>Invoices</button>
            <button className={`btn ${activeTab === "products" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("products")}>Products</button>
            <button className={`btn ${activeTab === "system" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("system")}>System</button>
          </div>
        </AdminCard>

        {!loading && (
          <>
            {activeTab === "branding" && renderEnvFields("branding")}
            {activeTab === "pages" && <AdminContentEditor />}
            {activeTab === "emails" && <AdminEmailTemplateEditor />}
            {activeTab === "invoices" && (
              <>
                {renderEnvFields("invoices")}
                <AdminInvoiceTemplateEditor />
              </>
            )}
            {activeTab === "products" && <AdminPresetsEditor />}
            {activeTab === "system" && (
              <>
                {renderEnvFields("system")}
                <AdminCard>
                  <h2 className="admin-settings-section-title">Admin Password</h2>
                  <AdminForm>
                    <AdminField label="New Password">
                      <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} />
                    </AdminField>
                    <AdminField label="Confirm Password">
                      <input type="password" value={confirmAdminPassword} onChange={e => setConfirmAdminPassword(e.target.value)} />
                    </AdminField>
                    <div className="field full">
                      <button className="btn btn-primary" onClick={handleSave}>Update Credentials</button>
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
