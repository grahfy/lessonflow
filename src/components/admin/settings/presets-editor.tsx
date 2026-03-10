"use client";

import { useState } from "react";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { parseAudInputToCents } from "@/lib/invoices/currency";
import { toMoneyInput } from "@/lib/admin/formatters";
import { usePresets, type Preset } from "@/lib/admin/use-presets";

/**
 * Editor for product/invoice presets.
 * Refactored to use centralized UI components and hooks.
 */
export function AdminPresetsEditor() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newPreset, setNewPreset] = useState<Partial<Preset>>({
    label: "",
    unitPriceCents: 0,
    description: ""
  });

  const { 
    presets, 
    loading, 
    load: reloadPresets, 
    save: savePresetApi, 
    remove: removePresetApi 
  } = usePresets({
    onError: setError,
    onAuthError: () => window.location.assign("/admin/login")
  });

  async function addPreset() {
    if (!newPreset.label?.trim()) {
      setError("Label is required.");
      return;
    }
    setError("");
    setNotice("");

    const result = await savePresetApi(newPreset);
    if (result) {
      setNotice("Preset added.");
      setNewPreset({ label: "", unitPriceCents: 0, description: "" });
      void reloadPresets();
    }
  }

  async function updatePreset(id: string, patch: Partial<Preset>) {
    setError("");
    setNotice("");
    const result = await savePresetApi(patch, id);
    if (result) {
      setNotice("Preset updated.");
      void reloadPresets();
    }
  }

  async function deletePreset(id: string) {
    if (!window.confirm("Are you sure you want to delete this preset?")) return;
    setError("");
    setNotice("");
    const success = await removePresetApi(id);
    if (success) {
      setNotice("Preset deleted.");
      void reloadPresets();
    }
  }

  if (loading && presets.length === 0) return <p className="helper-text">Loading presets...</p>;

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
                <AdminField label="Label" tooltip="Short name for this preset (e.g. '1 Hour Lesson')." required>
                  <input value={p.label} onChange={e => updatePreset(p.id, { label: e.target.value })} />
                </AdminField>
                <AdminField label="Price (AUD)" tooltip="Default price in Australian Dollars." required>
                  <input 
                    value={toMoneyInput(p.unitPriceCents)} 
                    onChange={e => updatePreset(p.id, { unitPriceCents: parseAudInputToCents(e.target.value).cents || 0 })} 
                  />
                </AdminField>
                <AdminField label="Default Description" tooltip="Pre-filled text for the invoice line item." fullWidth>
                  <textarea 
                    value={p.description} 
                    style={{ minHeight: '60px' }} 
                    onChange={e => updatePreset(p.id, { description: e.target.value })} 
                  />
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
              <AdminField label="Label" tooltip="Short name for the new preset.">
                <input 
                  placeholder="e.g. 10 Week Term" 
                  value={newPreset.label} 
                  onChange={e => setNewPreset(prev => ({ ...prev, label: e.target.value }))} 
                />
              </AdminField>
              <AdminField label="Price (AUD)" tooltip="Default price in Australian Dollars.">
                <input 
                  placeholder="0.00" 
                  value={toMoneyInput(newPreset.unitPriceCents || 0)} 
                  onChange={e => setNewPreset(prev => ({ ...prev, unitPriceCents: parseAudInputToCents(e.target.value).cents || 0 }))} 
                />
              </AdminField>
              <AdminField label="Default Description" tooltip="Pre-filled text for the invoice line item." fullWidth>
                <textarea 
                  placeholder="Line item text..." 
                  value={newPreset.description} 
                  style={{ minHeight: '60px' }} 
                  onChange={e => setNewPreset(prev => ({ ...prev, description: e.target.value }))} 
                />
              </AdminField>
              <div className="field full">
                <button className="btn btn-secondary" onClick={addPreset}>Add Preset</button>
              </div>
            </AdminForm>
          </AdminCard>
        </div>
      </AdminCard>
    </div>
  );
}
