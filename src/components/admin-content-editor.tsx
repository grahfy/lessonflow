"use client";

import { useState, useEffect } from "react";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type ContentSection = {
  key: string;
  title: string;
  body: string;
};

/**
 * Whitelabel interface for editing public-facing page content (FAQs, Home, etc).
 */
export function AdminContentEditor() {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/content");
        if (response.ok) {
          const data = await response.json();
          setSections(data.sections);
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
      const response = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections })
      });
      if (response.ok) {
        setNotice("Content saved successfully.");
      } else {
        setError("Failed to save content.");
      }
    } catch {
      setError("An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(key: string, patch: Partial<ContentSection>) {
    setSections(sections.map(s => s.key === key ? { ...s, ...patch } : s));
  }

  if (loading) return <p className="helper-text">Loading content...</p>;

  return (
    <div className="form-grid">
      <AdminCard className="field full">
        <h2 className="admin-settings-section-title">Page Content</h2>
        <p className="helper-text" style={{ marginBottom: '16px' }}>
          Edit the text shown on public-facing pages of the platform.
        </p>

        {notice ? <p className="notice success">{notice}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        <div style={{ display: 'grid', gap: '20px' }}>
          {sections.map((section) => (
            <AdminCard key={section.key} style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--line)' }}>
              <AdminForm>
                <AdminField label="Section Title" fullWidth>
                  <input value={section.title} onChange={e => updateSection(section.key, { title: e.target.value })} />
                </AdminField>
                <AdminField label="Body Content (Markdown/HTML)" fullWidth>
                  <textarea value={section.body} style={{ minHeight: '200px' }} onChange={e => updateSection(section.key, { body: e.target.value })} />
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
