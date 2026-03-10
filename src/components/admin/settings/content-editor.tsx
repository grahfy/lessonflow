"use client";

import { useState, useEffect } from "react";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type ContentSection = {
  key: string;
  pagePath: string;
  sectionKey: string;
  contentText: string;
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
          const data = (await response.json()) as {
            content?: Array<{ pagePath?: string; sectionKey?: string; content?: unknown }>;
          };
          const nextSections = Array.isArray(data.content)
            ? data.content
                .filter(
                  (section): section is { pagePath: string; sectionKey: string; content: unknown } =>
                    typeof section?.pagePath === "string" && typeof section?.sectionKey === "string"
                )
                .map((section) => ({
                  key: `${section.pagePath}::${section.sectionKey}`,
                  pagePath: section.pagePath,
                  sectionKey: section.sectionKey,
                  contentText: JSON.stringify(section.content ?? {}, null, 2)
                }))
            : [];
          setSections(nextSections);
        } else {
          setError("Failed to load content.");
        }
      } catch {
        setError("Failed to load content.");
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
      if (sections.length === 0) {
        setNotice("No content sections to save.");
        return;
      }

      const parsedSections: Array<{ pagePath: string; sectionKey: string; content: unknown }> = [];
      for (const section of sections) {
        try {
          parsedSections.push({
            pagePath: section.pagePath,
            sectionKey: section.sectionKey,
            content: JSON.parse(section.contentText)
          });
        } catch {
          setError(`Invalid JSON in ${section.pagePath} / ${section.sectionKey}.`);
          return;
        }
      }

      const responses = await Promise.all(
        parsedSections.map((section) =>
          fetch("/api/admin/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(section)
          })
        )
      );

      if (responses.some((response) => !response.ok)) {
        setError("Failed to save content.");
        return;
      }

      setNotice("Content saved successfully.");
    } catch {
      setError("An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(key: string, patch: Partial<ContentSection>) {
    setSections((prev) => prev.map((section) => (section.key === key ? { ...section, ...patch } : section)));
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
                <AdminField label="Page Path" tooltip="The URL path where this content is used." fullWidth>
                  <input value={section.pagePath} readOnly />
                </AdminField>
                <AdminField label="Section Key" tooltip="Unique identifier for this specific content block." fullWidth>
                  <input value={section.sectionKey} readOnly />
                </AdminField>
                <AdminField label="Section Content (JSON)" tooltip="The structured text or data for this section (Edit carefully!)." fullWidth>
                  <textarea
                    value={section.contentText}
                    style={{ minHeight: '220px', fontFamily: 'monospace' }}
                    onChange={(event) => updateSection(section.key, { contentText: event.target.value })}
                  />
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
