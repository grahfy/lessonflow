"use client";

import { useState, useEffect } from "react";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type InvoiceTemplateState = {
  logoUrl: string;
  accentColor: string;
  headerInfo: string;
  footerText: string;
};

/**
 * Whitelabel interface for editing invoice-related content (notes, terms).
 */
export function AdminInvoiceTemplateEditor() {
  const [template, setTemplate] = useState<InvoiceTemplateState>({
    logoUrl: "",
    accentColor: "#2247d8",
    headerInfo: "",
    footerText: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/invoice-template");
        if (!response.ok) {
          setError("Failed to load invoice templates.");
          return;
        }
        const data = (await response.json()) as {
          template?: Partial<InvoiceTemplateState> | null;
        };
        const nextTemplate = data.template ?? {};
        setTemplate({
          logoUrl: nextTemplate.logoUrl ?? "",
          accentColor: nextTemplate.accentColor ?? "#2247d8",
          headerInfo: nextTemplate.headerInfo ?? "",
          footerText: nextTemplate.footerText ?? ""
        });
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
      const response = await fetch("/api/admin/invoice-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
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

  function updateTemplate<K extends keyof InvoiceTemplateState>(key: K, value: InvoiceTemplateState[K]) {
    setTemplate((current) => ({
      ...current,
      [key]: value
    }));
  }

  if (loading) return <p className="helper-text">Loading invoice templates...</p>;

  return (
    <AdminEditorSection
      title="Invoice Content & Terms"
      description="Standardized text for payment terms, business details and footer notes on generated PDF invoices."
      notice={notice}
      error={error}
      listClassName="admin-editor-list-two-column"
      actions={
          <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
            {saving ? "Saving..." : "Save All Content"}
          </button>
      }
    >
      <AdminEditorPanel title="Branding" subdued>
        <AdminForm>
          <AdminField label="Logo URL" tooltip="Logo used in invoice PDFs and HTML renders." fullWidth>
            <input
              value={template.logoUrl}
              onChange={(event) => updateTemplate("logoUrl", event.target.value)}
            />
          </AdminField>
          <AdminField label="Accent Color" tooltip="Primary accent used for invoice headings and table highlights." fullWidth>
            <input
              value={template.accentColor}
              onChange={(event) => updateTemplate("accentColor", event.target.value)}
            />
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>

      <AdminEditorPanel title="Header Info" subdued>
        <AdminForm>
          <AdminField label="Content" tooltip="Line-separated business details shown near the top of invoices." fullWidth>
            <textarea
              className="admin-editor-textarea"
              value={template.headerInfo}
              onChange={(event) => updateTemplate("headerInfo", event.target.value)}
            />
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>

      <AdminEditorPanel title="Footer Terms" subdued>
        <AdminForm>
          <AdminField label="Content" tooltip="Footer copy shown at the bottom of invoices, such as payment terms or notes." fullWidth>
            <textarea
              className="admin-editor-textarea"
              value={template.footerText}
              onChange={(event) => updateTemplate("footerText", event.target.value)}
            />
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>
    </AdminEditorSection>
  );
}
