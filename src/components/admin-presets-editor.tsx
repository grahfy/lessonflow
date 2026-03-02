"use client";

import { FormEvent, useEffect, useState } from "react";

type InvoiceProductPreset = {
  id: string;
  label: string;
  description: string;
  unitPriceCents: number;
  isActive: boolean;
  sortOrder: number;
};

/**
 * Editor for invoice product presets (lesson packages).
 */
export function AdminPresetsEditor() {
  const [presets, setPresets] = useState<InvoiceProductPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  // Form state for creating/editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriceDollars, setFormPriceDollars] = useState("");
  const [formSortOrder, setFormSortOrder] = useState("0");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/presets");
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to load presets.");
      }
      setPresets(body.presets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load presets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(preset: InvoiceProductPreset) {
    setEditingId(preset.id);
    setFormLabel(preset.label);
    setFormDescription(preset.description);
    setFormPriceDollars((preset.unitPriceCents / 100).toString());
    setFormSortOrder(preset.sortOrder.toString());
    setNotice("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setFormLabel("");
    setFormDescription("");
    setFormPriceDollars("");
    setFormSortOrder("0");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const priceCents = Math.round(parseFloat(formPriceDollars) * 100);
    if (isNaN(priceCents)) {
      setError("Invalid price.");
      setSaving(false);
      return;
    }

    const payload = {
      label: formLabel,
      description: formDescription,
      unitPriceCents: priceCents,
      sortOrder: parseInt(formSortOrder, 10) || 0
    };

    try {
      const url = editingId ? `/api/admin/presets/${editingId}` : "/api/admin/presets";
      const method = editingId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to save preset.");
      }

      setNotice(editingId ? "Preset updated." : "Preset created.");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preset.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePreset(id: string) {
    if (!window.confirm("Are you sure you want to delete this preset?")) {
      return;
    }

    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/presets/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to delete preset.");
      }
      setNotice("Preset deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete preset.");
    }
  }

  return (
    <div className="admin-presets-editor">
      <div className="admin-card">
        <h2 className="admin-settings-section-title">Manage Lesson Presets</h2>
        <p className="helper-text">
          Define lesson packages that can be quickly added to invoices. Presets appear in the &quot;Add product preset&quot; dropdown in the invoice editor.
        </p>
      </div>

      {error ? <p className="notice error">{error}</p> : null}
      {notice ? <p className="notice success">{notice}</p> : null}

      <div className="admin-grid">
        <section className="admin-card">
          <h3>Current Presets</h3>
          {loading ? (
            <p className="notice">Loading presets...</p>
          ) : presets.length === 0 ? (
            <p className="helper-text">No presets found. Create one using the form.</p>
          ) : (
            <div className="list">
              {presets.map((preset) => (
                <div key={preset.id} className="booking-item">
                  <div className="booking-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong>{preset.label}</strong>
                      <p className="helper-text">{preset.description}</p>
                      <p className="helper-text" style={{ color: "var(--ink-0)" }}>
                        ${(preset.unitPriceCents / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="booking-row">
                      <button className="btn btn-secondary" onClick={() => startEdit(preset)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" onClick={() => void deletePreset(preset.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-card">
          <h3>{editingId ? "Edit Preset" : "Add New Preset"}</h3>
          <form className="form-grid" onSubmit={(e) => void onSubmit(e)}>
            <div className="field full">
              <label htmlFor="preset-label">Label (shown in dropdown)</label>
              <input
                id="preset-label"
                type="text"
                required
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. 5 × 1 Hour Lessons ($375)"
              />
            </div>
            <div className="field full">
              <label htmlFor="preset-description">Description (shown on invoice)</label>
              <input
                id="preset-description"
                type="text"
                required
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. 5 × 1 Hour Lessons"
              />
            </div>
            <div className="field">
              <label htmlFor="preset-price">Price ($ AUD)</label>
              <input
                id="preset-price"
                type="number"
                step="0.01"
                required
                value={formPriceDollars}
                onChange={(e) => setFormPriceDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label htmlFor="preset-sort">Sort Order</label>
              <input
                id="preset-sort"
                type="number"
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(e.target.value)}
              />
            </div>
            <div className="field full">
              <div className="button-row">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Update Preset" : "Create Preset"}
                </button>
                {editingId && (
                  <button className="btn btn-secondary" type="button" onClick={resetForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
