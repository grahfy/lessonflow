"use client";

import { useState, useEffect } from "react";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
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

      const response = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: parsedSections })
      });

      if (!response.ok) {
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
    <AdminEditorSection
      title="Page Content"
      description="Edit the text shown on public-facing pages of the platform."
      notice={notice}
      error={error}
      actions={
          <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
            {saving ? "Saving..." : "Save All Content"}
          </button>
      }
    >
      {sections.map((section) => (
        <AdminEditorPanel key={section.key} subdued>
          <AdminForm>
            <AdminField label="Page Path" tooltip="The URL path where this content is used." fullWidth>
              <input value={section.pagePath} readOnly />
            </AdminField>
            <AdminField label="Section Key" tooltip="Unique identifier for this specific content block." fullWidth>
              <input value={section.sectionKey} readOnly />
            </AdminField>
            <AdminField label="Section Content (JSON)" tooltip="The structured text or data for this section (Edit carefully!)." fullWidth>
              <textarea
                className="admin-editor-codearea admin-editor-codearea-lg"
                value={section.contentText}
                onChange={(event) => updateSection(section.key, { contentText: event.target.value })}
              />
            </AdminField>
          </AdminForm>
        </AdminEditorPanel>
      ))}
    </AdminEditorSection>
  );
}
