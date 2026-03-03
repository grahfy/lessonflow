"use client";

import { useState, useEffect } from "react";
import { parseAudInputToCents } from "@/lib/invoices/currency";
import { toMoneyInput } from "@/lib/admin/formatters";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type ProductPreset = {
  id: string;
  label: string;
  description: string;
  unitPriceCents: number;
};

/**
 * Interface for managing whitelabel product presets (items reused in invoices).
 */
export function AdminPresetsEditor() {
  const [presets, setPresets] = useState<ProductPreset[]>([]);
  const [newPreset, setNewPreset] = useState<Partial<ProductPreset>>({ label: "", description: "", unitPriceCents: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/presets");
        if (response.ok) {
          const data = await response.json();
          setPresets(data.presets);
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
      const response = await fetch("/api/admin/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets })
      });
      if (response.ok) {
        setNotice("Presets saved successfully.");
      } else {
        setError("Failed to save presets.");
      }
    } catch {
      setError("An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  function addPreset() {
    if (!newPreset.label) return;
    const id = `new-${Date.now()}`;
    setPresets([...presets, { ...newPreset, id } as ProductPreset]);
    setNewPreset({ label: "", description: "", unitPriceCents: 0 });
  }

  function updatePreset(id: string, patch: Partial<ProductPreset>) {
    setPresets(presets.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function deletePreset(id: string) {
    if (!window.confirm("Remove this preset?")) return;
    setPresets(presets.filter(p => p.id !== id));
  }

  if (loading) return <p className="helper-text">Loading presets...</p>;

  return (
    <div className="form-grid">
      <AdminCard className="field full">
        <h2 className="admin-settings-section-title">Product Presets</h2>
        <p className="helper-text" style={{ marginBottom: '16px' }}>
          Standardized price points and descriptions for common billing scenarios.
        </p>

        {notice ? <p className="notice success">{notice}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        <div style={{ display: 'grid', gap: '16px' }}>
          {presets.map((p) => (
            <AdminCard key={p.id} style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--line)' }}>
              <AdminForm>
                <AdminField label="Label" required>
                  <input value={p.label} onChange={e => updatePreset(p.id, { label: e.target.value })} />
                </AdminField>
                <AdminField label="Price (AUD)" required>
                  <input value={toMoneyInput(p.unitPriceCents)} onChange={e => updatePreset(p.id, { unitPriceCents: parseAudInputToCents(e.target.value).cents || 0 })} />
                </AdminField>
                <AdminField label="Default Description" fullWidth>
                  <textarea value={p.description} style={{ minHeight: '60px' }} onChange={e => updatePreset(p.id, { description: e.target.value })} />
                </AdminField>
                <div className="field full">
                  <div className="button-row">
                    <button className="btn btn-danger" onClick={() => deletePreset(p.id)}>Delete Preset</button>
                  </div>
                </div>
              </AdminForm>
            </AdminCard>
          ))}

          <AdminCard style={{ border: '1px dashed var(--line)', background: 'transparent' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Add New Preset</h3>
            <AdminForm>
              <AdminField label="Label">
                <input placeholder="e.g. 10 Week Term" value={newPreset.label} onChange={e => setNewPreset(prev => ({ ...prev, label: e.target.value }))} />
              </AdminField>
              <AdminField label="Price (AUD)">
                <input placeholder="0.00" value={toMoneyInput(newPreset.unitPriceCents || 0)} onChange={e => setNewPreset(prev => ({ ...prev, unitPriceCents: parseAudInputToCents(e.target.value).cents || 0 }))} />
              </AdminField>
              <AdminField label="Default Description" fullWidth>
                <textarea placeholder="Line item text..." value={newPreset.description} style={{ minHeight: '60px' }} onChange={e => setNewPreset(prev => ({ ...prev, description: e.target.value }))} />
              </AdminField>
              <div className="field full">
                <button className="btn btn-secondary" onClick={addPreset}>Add Preset</button>
              </div>
            </AdminForm>
          </AdminCard>
        </div>

        <div className="button-row" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
          <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
            {saving ? "Saving..." : "Save All Presets"}
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
