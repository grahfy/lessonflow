"use client";

import { useState, useEffect } from "react";
import { useNoticeTween } from "@/components/motion/use-notice-tween";

type SectionDefinition = {
  key: string;
  label: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "textarea" | "list";
  }>;
};

type PageDefinition = {
  path: string;
  label: string;
  sections: SectionDefinition[];
};

const PAGES: PageDefinition[] = [
  {
    path: "/",
    label: "Home Page",
    sections: [
      {
        key: "hero",
        label: "Hero Section",
        fields: [
          { key: "kicker", label: "Kicker (Top Label)", type: "text" },
          { key: "title", label: "Title", type: "text" },
          { key: "lead", label: "Lead Text", type: "textarea" },
          { key: "visualLabel", label: "Accessibility Label for Image", type: "text" }
        ]
      },
      {
        key: "metrics",
        label: "Experience Metrics",
        fields: [
          { key: "experienceValue", label: "Experience Value (e.g. 30+)", type: "text" },
          { key: "experienceLabel", label: "Experience Label", type: "text" },
          { key: "levelsValue", label: "Levels Value", type: "text" },
          { key: "levelsLabel", label: "Levels Label", type: "text" },
          { key: "locationValue", label: "Location Value", type: "text" },
          { key: "locationLabel", label: "Location Label", type: "text" }
        ]
      },
      {
        key: "body",
        label: "Body Section",
        fields: [
          { key: "note", label: "Bottom Note", type: "textarea" }
        ]
      }
    ]
  },
  {
    path: "/lessons",
    label: "Lessons Page",
    sections: [
      {
        key: "hero",
        label: "Hero Section",
        fields: [
          { key: "kicker", label: "Kicker", type: "text" },
          { key: "title", label: "Title", type: "text" },
          { key: "lead", label: "Lead Text", type: "textarea" }
        ]
      },
      {
        key: "body",
        label: "Path Details",
        fields: [
          { key: "helperText", label: "Intro Text", type: "textarea" },
          { key: "beginnerTitle", label: "Beginner Path Title", type: "text" },
          { key: "beginnerBody", label: "Beginner Path Body", type: "textarea" },
          { key: "intermediateTitle", label: "Intermediate Path Title", type: "text" },
          { key: "intermediateBody", label: "Intermediate Path Body", type: "textarea" },
          { key: "advancedTitle", label: "Advanced Path Title", type: "text" },
          { key: "advancedBody", label: "Advanced Path Body", type: "textarea" }
        ]
      }
    ]
  }
];

interface PageContentItem {
  sectionKey: string;
  content: Record<string, string>;
}

export function AdminContentEditor() {
  const [selectedPage, setSelectedPage] = useState(PAGES[0]);
  const [content, setContent] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const noticeRef = useNoticeTween(Boolean(notice));
  const errorRef = useNoticeTween(Boolean(error));

  useEffect(() => {
    async function loadContent() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/content?pagePath=${encodeURIComponent(selectedPage.path)}`);
        const body = await res.json();
        if (body.ok) {
          const mapped: Record<string, Record<string, string>> = {};
          (body.content as PageContentItem[]).forEach((item) => {
            mapped[item.sectionKey] = item.content;
          });
          setContent(mapped);
        }
      } catch {
        setError("Failed to load page content.");
      } finally {
        setLoading(false);
      }
    }
    void loadContent();
  }, [selectedPage]);

  async function handleSave(sectionKey: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pagePath: selectedPage.path,
          sectionKey,
          content: content[sectionKey] || {}
        })
      });
      const body = await res.json();
      if (body.ok) {
        setNotice(`Saved ${sectionKey} section.`);
      } else {
        setError(String(body.error || "Failed to save."));
      }
    } catch {
      setError("Failed to save section.");
    } finally {
      setSaving(false);
    }
  }

  const updateField = (sectionKey: string, fieldKey: string, value: string) => {
    setContent(prev => ({
      ...prev,
      [sectionKey]: {
        ...(prev[sectionKey] || {}),
        [fieldKey]: value
      }
    }));
  };

  return (
    <div className="admin-content-editor">
      <div className="admin-card">
        <div className="field">
          <label>Select Page to Edit</label>
          <select 
            value={selectedPage.path} 
            onChange={(e) => setSelectedPage(PAGES.find(p => p.path === e.target.value) || PAGES[0])}
          >
            {PAGES.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {notice && <p className="notice success" ref={noticeRef}>{notice}</p>}
      {error && <p className="notice error" ref={errorRef}>{error}</p>}

      {loading ? (
        <p className="notice">Loading content...</p>
      ) : (
        selectedPage.sections.map(section => (
          <section key={section.key} className="admin-card">
            <h2 className="admin-settings-section-title">{section.label}</h2>
            <div className="form-grid">
              {section.fields.map(field => (
                <div key={field.key} className="field full">
                  <label>{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={content[section.key]?.[field.key] || ""}
                      onChange={(e) => updateField(section.key, field.key, e.target.value)}
                      rows={4}
                    />
                  ) : (
                    <input
                      type="text"
                      value={content[section.key]?.[field.key] || ""}
                      onChange={(e) => updateField(section.key, field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <div className="field full">
                <button 
                  className="btn btn-primary" 
                  disabled={saving}
                  onClick={() => void handleSave(section.key)}
                >
                  {saving ? "Saving..." : `Save ${section.label}`}
                </button>
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
