"use client";

import { useState, useEffect } from "react";
import { useNoticeTween } from "@/components/motion/use-notice-tween";

interface InvoiceTemplate {
  logoUrl: string | null;
  accentColor: string | null;
  footerText: string | null;
  headerInfo: string | null;
}

export function AdminInvoiceTemplateEditor() {
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#2247d8");
  const [footerText, setFooterText] = useState("");
  const [headerInfo, setHeaderInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const noticeRef = useNoticeTween(Boolean(notice));
  const errorRef = useNoticeTween(Boolean(error));

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/invoice-template`);
        const body = await res.json();
        if (body.ok && body.template) {
          const t = body.template as InvoiceTemplate;
          setLogoUrl(t.logoUrl || "");
          setAccentColor(t.accentColor || "#2247d8");
          setFooterText(t.footerText || "");
          setHeaderInfo(t.headerInfo || "");
        }
      } catch {
        setError("Failed to load invoice template.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/invoice-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl,
          accentColor,
          footerText,
          headerInfo
        })
      });
      const body = await res.json();
      if (body.ok) {
        setNotice("Saved invoice template.");
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
    <div className="admin-invoice-editor">
      {notice && <p className="notice success" ref={noticeRef}>{notice}</p>}
      {error && <p className="notice error" ref={errorRef}>{error}</p>}

      {loading ? (
        <p className="notice">Loading template...</p>
      ) : (
        <section className="admin-card">
          <h2 className="admin-settings-section-title">Invoice Customization</h2>
          <div className="form-grid">
            <div className="field">
              <label>Accent Color (Hex)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: '40px', padding: '0', height: '40px' }} />
                <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#2247d8" />
              </div>
            </div>
            <div className="field">
              <label>Custom Invoice Logo URL (Optional)</label>
              <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="/images/company-logo-invoice.webp" />
            </div>
            <div className="field full">
              <label>Custom Header Info (Overrides default contact info)</label>
              <textarea 
                value={headerInfo} 
                onChange={(e) => setHeaderInfo(e.target.value)} 
                rows={4}
                placeholder="Business Address&#10;City, State Postcode&#10;Phone Number"
              />
            </div>
            <div className="field full">
              <label>Invoice Footer Text</label>
              <textarea 
                value={footerText} 
                onChange={(e) => setFooterText(e.target.value)} 
                rows={3}
                placeholder="Thank you for your business. Terms and conditions apply."
              />
            </div>
            <div className="field full">
              <button className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
                {saving ? "Saving..." : "Save Invoice Settings"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
