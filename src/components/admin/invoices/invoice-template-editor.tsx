"use client";

import { useState, useEffect } from "react";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type InvoiceTemplate = {
  key: string;
  content: string;
};

/**
 * Whitelabel interface for editing invoice-related content (notes, terms).
 */
export function AdminInvoiceTemplateEditor() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/invoice-templates");
        if (!response.ok) {
          setError("Failed to load invoice templates.");
          return;
        }
        const data = (await response.json()) as { templates?: InvoiceTemplate[] };
        setTemplates(Array.isArray(data.templates) ? data.templates : []);
      } catch {
        setError("Failed to load invoice templates.");
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
      const response = await fetch("/api/admin/invoice-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates })
      });
      if (response.ok) {
        setNotice("Invoice templates saved successfully.");
      } else {
        setError("Failed to save templates.");
      }
    } catch {
      setError("An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  function updateTemplate(key: string, content: string) {
    setTemplates(templates.map(t => t.key === key ? { ...t, content } : t));
  }

  if (loading) return <p className="helper-text">Loading invoice templates...</p>;

  return (
    <AdminEditorSection
      title="Invoice Content & Terms"
      description="Standardized text for payment terms, business details and footer notes on generated PDF invoices."
      notice={notice}
      error={error}
      actions={
          <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
            {saving ? "Saving..." : "Save All Content"}
          </button>
      }
    >
      {templates.map((template) => (
        <AdminEditorPanel key={template.key} title={template.key.replace(/_/g, " ")} subdued>
          <AdminForm>
            <AdminField label="Content" tooltip="The actual text content for this template (supports plain text)." fullWidth>
              <textarea
                className="admin-editor-textarea"
                value={template.content}
                onChange={(event) => updateTemplate(template.key, event.target.value)}
              />
            </AdminField>
          </AdminForm>
        </AdminEditorPanel>
      ))}
    </AdminEditorSection>
  );
}
