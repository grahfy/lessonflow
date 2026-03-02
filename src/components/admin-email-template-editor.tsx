"use client";

import { useState, useEffect } from "react";
import { useNoticeTween } from "@/components/motion/use-notice-tween";

type TemplateDef = {
  key: string;
  label: string;
  placeholders: string[];
};

const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: "customer_booking_reminder",
    label: "Customer Lesson Reminder",
    placeholders: ["customerName", "lessonTime", "brandName"]
  },
  {
    key: "customer_booking_status",
    label: "Booking Status Update",
    placeholders: ["customerName", "status", "lessonTime", "brandName"]
  },
  {
    key: "customer_invoice",
    label: "Invoice Sent",
    placeholders: ["customerName", "invoiceNumber", "totalAmount", "dueDate", "brandName"]
  }
];

interface EmailTemplate {
  templateKey: string;
  subject: string;
  htmlBody: string;
}

export function AdminEmailTemplateEditor() {
  const [selectedKey, setSelectedKey] = useState(TEMPLATE_DEFS[0].key);
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const noticeRef = useNoticeTween(Boolean(notice));
  const errorRef = useNoticeTween(Boolean(error));

  const currentDef = TEMPLATE_DEFS.find(d => d.key === selectedKey)!;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/email-templates`);
        const body = await res.json();
        if (body.ok) {
          const t = (body.templates as EmailTemplate[]).find((item) => item.templateKey === selectedKey);
          if (t) {
            setSubject(t.subject);
            setHtmlBody(t.htmlBody);
          } else {
            setSubject("");
            setHtmlBody("");
          }
        }
      } catch {
        setError("Failed to load template.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [selectedKey]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: selectedKey,
          subject,
          htmlBody
        })
      });
      const body = await res.json();
      if (body.ok) {
        setNotice(`Saved ${currentDef.label}.`);
      } else {
        setError(String(body.error || "Failed to save."));
      }
    } catch {
      setError("Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-email-editor">
      <div className="admin-card">
        <div className="field">
          <label>Select Template to Edit</label>
          <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
            {TEMPLATE_DEFS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
      </div>

      {notice && <p className="notice success" ref={noticeRef}>{notice}</p>}
      {error && <p className="notice error" ref={errorRef}>{error}</p>}

      {loading ? (
        <p className="notice">Loading template...</p>
      ) : (
        <section className="admin-card">
          <h2 className="admin-settings-section-title">{currentDef.label}</h2>
          <div className="form-grid">
            <div className="field full">
              <label>Email Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Lesson Reminder: {{lessonTime}}" />
            </div>
            <div className="field full">
              <label>Email Body (HTML)</label>
              <textarea 
                value={htmlBody} 
                onChange={(e) => setHtmlBody(e.target.value)} 
                rows={12}
                placeholder="Hi {{customerName}}, your lesson is at {{lessonTime}}..."
              />
            </div>
            <div className="field full">
              <p className="helper-text">
                Available placeholders: {currentDef.placeholders.map((p, idx) => (
                  <span key={p}>
                    <code>{"{{"}{p}{"}}"}</code>
                    {idx < currentDef.placeholders.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            </div>
            <div className="field full">
              <button className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
