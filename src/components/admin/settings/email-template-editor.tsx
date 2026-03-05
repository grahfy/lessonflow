"use client";

import { useState, useEffect } from "react";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type EmailTemplate = {
  key: string;
  subject: string;
  body: string;
};

/**
 * Whitelabel interface for editing system email templates.
 */
export function AdminEmailTemplateEditor() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/email-templates");
        if (response.ok) {
          const data = (await response.json()) as {
            templates?: Array<{ templateKey?: string; subject?: string; htmlBody?: string }>;
          };
          const nextTemplates = Array.isArray(data.templates)
            ? data.templates
                .filter(
                  (template): template is { templateKey: string; subject: string; htmlBody: string } =>
                    typeof template?.templateKey === "string" &&
                    typeof template?.subject === "string" &&
                    typeof template?.htmlBody === "string"
                )
                .map((template) => ({
                  key: template.templateKey,
                  subject: template.subject,
                  body: template.htmlBody
                }))
            : [];
          setTemplates(nextTemplates);
        } else {
          setError("Failed to load templates.");
        }
      } catch {
        setError("Failed to load templates.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function saveAll() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (templates.length === 0) {
        setNotice("No templates to save.");
        return;
      }

      const responses = await Promise.all(
        templates.map((template) =>
          fetch("/api/admin/email-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateKey: template.key,
              subject: template.subject,
              htmlBody: template.body
            })
          })
        )
      );

      if (responses.some((response) => !response.ok)) {
        setError("Failed to save templates.");
        return;
      }

      setNotice("Email templates saved successfully.");
    } catch {
      setError("An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  function updateTemplate(key: string, patch: Partial<EmailTemplate>) {
    setTemplates(templates.map(t => t.key === key ? { ...t, ...patch } : t));
  }

  if (loading) return <p className="helper-text">Loading templates...</p>;

  return (
    <div className="form-grid">
      <AdminCard className="field full">
        <h2 className="admin-settings-section-title">Email Templates</h2>
        <p className="helper-text" style={{ marginBottom: '16px' }}>
          Customize the subjects and content of automated system emails. Use {"{{ placeholders }}"} for dynamic content.
        </p>

        {notice ? <p className="notice success">{notice}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        <div style={{ display: 'grid', gap: '20px' }}>
          {templates.map((t) => (
            <AdminCard key={t.key} style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.key.replace(/_/g, ' ')}</h3>
              <AdminForm>
                <AdminField label="Subject" required fullWidth>
                  <input value={t.subject} onChange={e => updateTemplate(t.key, { subject: e.target.value })} />
                </AdminField>
                <AdminField label="Body" required fullWidth>
                  <textarea value={t.body} style={{ minHeight: '200px', fontFamily: 'monospace' }} onChange={e => updateTemplate(t.key, { body: e.target.value })} />
                </AdminField>
              </AdminForm>
            </AdminCard>
          ))}
        </div>

        <div className="button-row" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
          <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
            {saving ? "Saving..." : "Save All Templates"}
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
