"use client";

import { useState, useEffect } from "react";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";

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
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    async function load() {
      try {
        const response = await safeFetch("/api/admin/email-templates");
        if (!response.ok) {
          await handleApiError(response, "Failed to load templates.");
          return;
        }

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
      } catch {
        setError("Failed to load templates.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [safeFetch, handleApiError]);

  async function saveAll() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (templates.length === 0) {
        setNotice("No templates to save.");
        return;
      }

      const response = await safeFetch("/api/admin/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templates: templates.map((template) => ({
            templateKey: template.key,
            subject: template.subject,
            htmlBody: template.body
          }))
        })
      });

      if (!response.ok) {
        await handleApiError(response, "Failed to save templates.");
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
    setTemplates((current) => current.map((template) => (
      template.key === key ? { ...template, ...patch } : template
    )));
  }

  if (loading) return <p className="helper-text">Loading templates...</p>;

  return (
    <AdminEditorSection
      title="Email Templates"
      description={<>Customize the subjects and content of automated system emails. Use {"{{ placeholders }}"} for dynamic content.</>}
      notice={notice}
      error={error}
      listClassName="admin-editor-list-two-column"
      actions={
          <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
            {saving ? "Saving..." : "Save All Templates"}
          </button>
      }
    >
      {templates.map((template) => (
        <AdminEditorPanel key={template.key} title={template.key.replace(/_/g, " ")} subdued>
          <AdminForm>
            <AdminField label="Subject" tooltip="The subject line of this automated email." required fullWidth>
              <input value={template.subject} onChange={(event) => updateTemplate(template.key, { subject: event.target.value })} />
            </AdminField>
            <AdminField label="Body" tooltip="The HTML content of the email." required fullWidth>
              <textarea
                className="admin-editor-codearea admin-email-template-codearea"
                value={template.body}
                onChange={(event) => updateTemplate(template.key, { body: event.target.value })}
              />
            </AdminField>
          </AdminForm>
        </AdminEditorPanel>
      ))}
    </AdminEditorSection>
  );
}
