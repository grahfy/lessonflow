"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";

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

/**
 * Admin environment/settings editor that reuses the setup env catalog but runs behind admin auth.
 */
export function AdminSettingsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [envVars, setEnvVars] = useState<EnvVarField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [adminDisplayName, setAdminDisplayName] = useState<string>("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");

  const envOwnerEmail = values.ADMIN_EMAIL || "";
  const ownerEmailDiffersFromLogin = Boolean(adminEmail && envOwnerEmail && adminEmail.toLowerCase() !== envOwnerEmail.toLowerCase());

  const groupedVars = useMemo(() => {
    const groups: Array<{ title: string; keys: string[] }> = [
      {
        title: "Core",
        keys: ["DATABASE_URL", "NEXT_PUBLIC_SITE_URL", "ADMIN_EMAIL"]
      },
      {
        title: "Email Delivery",
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
        keys: ["ADMIN_SESSION_SECRET", "STUDENT_SESSION_SECRET", "STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY", "CRON_SECRET"]
      },
      {
        title: "Invoices",
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
          "INVOICE_CREDIT_NOTE_PREFIX"
        ]
      },
      {
        title: "Student Portal",
        keys: ["STUDENT_SESSION_MAX_AGE_SECONDS", "STUDENT_PORTAL_PASSWORD_LENGTH"]
      }
    ];

    const byKey = new Map(envVars.map((item) => [item.key, item]));
    const seen = new Set<string>();

    const ordered: Array<{ title: string; items: EnvVarField[] }> = groups
      .map((group) => ({
        title: group.title,
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
      ordered.push({ title: "Other", items: uncategorized });
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
        setAdminDisplayName(body.admin.displayName);
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

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

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

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <div className="admin-card booking-row admin-header-row">
        <h1 className="admin-console-title">Admin Configuration</h1>
        <div className="booking-row">
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/bookings")}>
            Bookings
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/invoices")}>
            Invoices
          </button>
          <AdminDeployUpdatesButton />
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/reports")}>
            Reports
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </div>

      <div className="admin-card">
        <p className="helper-text">
          Edit supported environment settings and sync admin login credentials to the database. Saving writes the project <code>.env</code>; restart the app to apply most runtime changes.
        </p>
        <p className="helper-text">
          Signed in as <strong>{adminDisplayName || "Admin"}</strong> ({adminEmail || "..."})
        </p>
        {ownerEmailDiffersFromLogin ? (
          <p className="notice">
            Owner email in settings (<strong>{envOwnerEmail}</strong>) differs from the current login email (<strong>{adminEmail}</strong>). Saving will sync the admin DB login email to the Owner Email field.
          </p>
        ) : null}
      </div>

      {error ? <p className="notice error">{error}</p> : null}
      {notice ? <p className="notice success">{notice}</p> : null}
      {loading ? <p className="notice">Loading...</p> : null}

      {!loading && envVars.length > 0 ? (
        <form className="admin-card form-grid" onSubmit={onSubmit}>
          {groupedVars.map((group) => (
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
            <div className="admin-settings-section">
              <h2 className="admin-settings-section-title">Admin Login Credentials (DB Sync)</h2>
              <p className="helper-text">
                The Owner Email field above is synced to the signed-in admin account on save. Enter a new password below only if you want to rotate the admin login password as well.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="admin-settings-password">New Admin Password (optional)</label>
                  <input
                    id="admin-settings-password"
                    type="password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Leave blank to keep existing password"
                    className={fieldErrors.ADMIN_PASSWORD ? "input-error" : ""}
                  />
                  {fieldErrors.ADMIN_PASSWORD ? <p className="field-error">{fieldErrors.ADMIN_PASSWORD}</p> : null}
                </div>
                <div className="field">
                  <label htmlFor="admin-settings-password-confirm">Confirm New Admin Password</label>
                  <input
                    id="admin-settings-password-confirm"
                    type="password"
                    value={confirmAdminPassword}
                    onChange={(event) => setConfirmAdminPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat the new password"
                    className={fieldErrors.ADMIN_PASSWORD_CONFIRM ? "input-error" : ""}
                  />
                  {fieldErrors.ADMIN_PASSWORD_CONFIRM ? <p className="field-error">{fieldErrors.ADMIN_PASSWORD_CONFIRM}</p> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="field full">
            <div className="button-row">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Admin Configuration"}
              </button>
              <button className="btn btn-secondary" type="button" disabled={saving} onClick={() => router.push("/admin/bookings")}>
                Back to Bookings
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
