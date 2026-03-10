"use client";

import { useState, useEffect } from "react";
import { AdminCard } from "@/components/admin/ui/admin-card";
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
        if (response.ok) {
          const data = await response.json();
          setTemplates(data.templates);
        }
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
    <div className="form-grid">
      <AdminCard className="field full">
        <h2 className="admin-settings-section-title">Invoice Content & Terms</h2>
        <p className="helper-text" style={{ marginBottom: '16px' }}>
          Standardized text for payment terms, business details and footer notes on generated PDF invoices.
        </p>

        {notice ? <p className="notice success">{notice}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        <div style={{ display: 'grid', gap: '20px' }}>
          {templates.map((t) => (
            <AdminCard key={t.key} style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', textTransform: 'uppercase' }}>{t.key.replace(/_/g, ' ')}</h3>
              <AdminForm>
                <AdminField label="Content" tooltip="The actual text content for this template (supports plain text)." fullWidth>
                  <textarea value={t.content} style={{ minHeight: '120px' }} onChange={e => updateTemplate(t.key, e.target.value)} />
                </AdminField>
              </AdminForm>
            </AdminCard>
          ))}
        </div>

        <div className="button-row" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
          <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
            {saving ? "Saving..." : "Save All Content"}
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
