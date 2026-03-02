"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminHeader } from "@/components/admin-header";
import { AdminPresetsEditor } from "@/components/admin-presets-editor";
import { AdminContentEditor } from "@/components/admin-content-editor";
import { AdminEmailTemplateEditor } from "@/components/admin-email-template-editor";
import { AdminInvoiceTemplateEditor } from "@/components/admin-invoice-template-editor";

type EnvVarField = {
  key: string;
  title: string;
  description: string;
  placeholder: string;
  isRequired: boolean;
  isSecret: boolean;
  currentValue: string;
};

type AdminSettingsResponse = {
  ok: boolean;
  error?: string;
  admin?: {
    id: string;
    email: string;
    displayName: string;
  };
  envVars?: EnvVarField[];
};

type AdminSettingsSaveResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  requiresReauth?: boolean;
  nextPath?: string;
};

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  return (await response.json().catch(() => null)) as T | null;
}

type TabKey = "branding" | "pages" | "emails" | "invoices" | "products" | "system";

/**
 * Refactored Admin Settings with multi-tab layout for full whitelabel control.
 */
export function AdminSettingsClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("branding");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [envVars, setEnvVars] = useState<EnvVarField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [, setAdminEmail] = useState<string>("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");

  const groupedVars = useMemo(() => {
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

    const byKey = new Map(envVars.map((item) => [item.key, item]));
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

    const uncategorized = envVars.filter((item) => !seen.has(item.key));
    if (uncategorized.length > 0) {
      ordered.push({ title: "Other Config", tab: "system", items: uncategorized });
    }

    return ordered;
  }, [envVars]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setNotice("");

      try {
        const response = await fetch("/api/admin/settings", { method: "GET" });
        const body = await readJsonSafe<AdminSettingsResponse>(response);

        if (response.status === 401) {
          router.push("/admin/login");
          router.refresh();
          return;
        }

        if (!response.ok || !body?.envVars || !body.admin) {
          setError(body?.error || "Unable to load admin settings.");
          return;
        }

        if (cancelled) {
          return;
        }

        setEnvVars(body.envVars);
        setValues(
          Object.fromEntries(
            body.envVars.map((item) => [item.key, item.currentValue === "***SET***" ? "" : item.currentValue])
          )
        );
        setAdminEmail(body.admin.email);
      } catch {
        if (!cancelled) {
          setError("Unable to load admin settings.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    setFieldErrors({});

    if (adminPassword || confirmAdminPassword) {
      if (adminPassword !== confirmAdminPassword) {
        setFieldErrors({ ADMIN_PASSWORD_CONFIRM: "Passwords do not match." });
        setSaving(false);
        return;
      }
    }

    const payload = {
      env: Object.fromEntries(envVars.map((item) => [item.key, values[item.key] ?? ""])),
      adminPassword: adminPassword.trim().length > 0 ? adminPassword : ""
    };

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const body = await readJsonSafe<AdminSettingsSaveResponse>(response);

      if (response.status === 401) {
        router.push("/admin/login");
        router.refresh();
        return;
      }

      if (!response.ok || !body?.ok) {
        setFieldErrors(body?.fieldErrors || {});
        setError(body?.error || "Unable to save settings.");
        return;
      }

      setNotice(body.message || "Settings saved.");
      setAdminPassword("");
      setConfirmAdminPassword("");

      if (payload.env.ADMIN_EMAIL) {
        setAdminEmail(String(payload.env.ADMIN_EMAIL));
      }

      if (body.requiresReauth) {
        setNotice(`${body.message || "Settings saved."} Admin email changed, please sign in again.`);
        window.setTimeout(() => {
          router.push(body.nextPath || "/admin/login");
          router.refresh();
        }, 1200);
      }
    } catch {
      setError("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const renderEnvFields = (tab: TabKey) => {
    const groupsInTab = groupedVars.filter(g => g.tab === tab);
    if (groupsInTab.length === 0) return null;

    return (
      <div className="admin-card form-grid">
        {groupsInTab.map((group) => (
          <div key={group.title} className="field full">
            <div className="admin-settings-section">
              <h2 className="admin-settings-section-title">{group.title}</h2>
              <div className="form-grid">
                {group.items.map((envVar) => {
                  const fieldError = fieldErrors[envVar.key];
                  const isSecret = envVar.isSecret;
                  const placeholder =
                    isSecret && envVar.currentValue === "***SET***"
                      ? `${envVar.placeholder || ""} (leave blank to keep current value)`
                      : envVar.placeholder;

                  return (
                    <div key={envVar.key} className="field">
                      <label htmlFor={`admin-setting-${envVar.key}`}>
                        {envVar.title}
                        {envVar.isRequired ? <span className="required-mark">*</span> : null}
                        {envVar.isSecret ? <span className="secret-mark"> (secret)</span> : null}
                      </label>
                      <p className="field-description">{envVar.description}</p>
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
                      {fieldError ? <p className="field-error">{fieldError}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div className="field full">
          <div className="button-row">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => {
              const form = document.createElement('form');
              const event = { preventDefault: () => {}, currentTarget: form } as unknown as FormEvent<HTMLFormElement>;
              void onSubmit(event);
            }}>
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <AdminHeader title="Admin Configuration" />

      <div className="admin-card booking-row">
        <div className="site-nav">
          <button className={`btn ${activeTab === "branding" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("branding")}>Branding</button>
          <button className={`btn ${activeTab === "pages" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("pages")}>Pages</button>
          <button className={`btn ${activeTab === "emails" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("emails")}>Emails</button>
          <button className={`btn ${activeTab === "invoices" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("invoices")}>Invoices</button>
          <button className={`btn ${activeTab === "products" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("products")}>Products</button>
          <button className={`btn ${activeTab === "system" ? "btn-primary" : "btn-secondary"}`} onClick={() => setActiveTab("system")}>System</button>
        </div>
      </div>

      {error ? <p className="notice error">{error}</p> : null}
      {notice ? <p className="notice success">{notice}</p> : null}
      {loading ? <p className="notice">Loading...</p> : null}

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
              <div className="admin-card">
                <h2 className="admin-settings-section-title">Admin Password</h2>
                <div className="form-grid">
                  <div className="field">
                    <label>New Password</label>
                    <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Confirm Password</label>
                    <input type="password" value={confirmAdminPassword} onChange={e => setConfirmAdminPassword(e.target.value)} />
                  </div>
                  <div className="field full">
                    <button className="btn btn-primary" onClick={() => {
                      const form = document.createElement('form');
                      const event = { preventDefault: () => {}, currentTarget: form } as unknown as FormEvent<HTMLFormElement>;
                      void onSubmit(event);
                    }}>Update Credentials</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
