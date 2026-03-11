"use client";

import { useEffect, useState } from "react";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
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
  const [draftPresets, setDraftPresets] = useState<Preset[]>([]);
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

  useEffect(() => {
    setDraftPresets(presets);
  }, [presets]);

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
    const preset = draftPresets.find((item) => item.id === id);
    if (!preset) return;

    setError("");
    setNotice("");
    const result = await savePresetApi({ ...preset, ...patch }, id);
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
    <AdminEditorSection
      title="Product Presets"
      description="Standardized price points and descriptions for common billing scenarios."
      notice={notice}
      error={error}
      listClassName="admin-editor-list-two-column"
    >
      {draftPresets.map((preset) => (
        <AdminEditorPanel key={preset.id} subdued>
          <AdminForm>
            <AdminField label="Label" tooltip="Short name for this preset (e.g. '1 Hour Lesson')." required>
              <input
                value={preset.label}
                onChange={(event) =>
                  setDraftPresets((current) =>
                    current.map((item) => (item.id === preset.id ? { ...item, label: event.target.value } : item))
                  )
                }
              />
            </AdminField>
            <AdminField label="Price (AUD)" tooltip="Default price in Australian Dollars." required>
              <input
                value={toMoneyInput(preset.unitPriceCents)}
                onChange={(event) =>
                  setDraftPresets((current) =>
                    current.map((item) =>
                      item.id === preset.id
                        ? { ...item, unitPriceCents: parseAudInputToCents(event.target.value).cents || 0 }
                        : item
                    )
                  )
                }
              />
            </AdminField>
            <AdminField label="Default Description" tooltip="Pre-filled text for the invoice line item." fullWidth>
              <textarea
                className="admin-editor-textarea admin-editor-textarea-sm"
                value={preset.description}
                onChange={(event) =>
                  setDraftPresets((current) =>
                    current.map((item) => (item.id === preset.id ? { ...item, description: event.target.value } : item))
                  )
                }
              />
            </AdminField>
            <div className="field full">
              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={() => void updatePreset(preset.id, {})}>
                  Save Preset
                </button>
                <button className="btn btn-danger" type="button" onClick={() => void deletePreset(preset.id)}>
                  Delete Preset
                </button>
              </div>
            </div>
          </AdminForm>
        </AdminEditorPanel>
      ))}

      <AdminEditorPanel title="Add New Preset" dashed>
        <AdminForm>
          <AdminField label="Label" tooltip="Short name for the new preset.">
            <input
              placeholder="e.g. 10 Week Term"
              value={newPreset.label}
              onChange={(event) => setNewPreset((prev) => ({ ...prev, label: event.target.value }))}
            />
          </AdminField>
          <AdminField label="Price (AUD)" tooltip="Default price in Australian Dollars.">
            <input
              placeholder="0.00"
              value={toMoneyInput(newPreset.unitPriceCents || 0)}
              onChange={(event) =>
                setNewPreset((prev) => ({
                  ...prev,
                  unitPriceCents: parseAudInputToCents(event.target.value).cents || 0
                }))
              }
            />
          </AdminField>
          <AdminField label="Default Description" tooltip="Pre-filled text for the invoice line item." fullWidth>
            <textarea
              className="admin-editor-textarea admin-editor-textarea-sm"
              placeholder="Line item text..."
              value={newPreset.description}
              onChange={(event) => setNewPreset((prev) => ({ ...prev, description: event.target.value }))}
            />
          </AdminField>
          <div className="field full">
            <button className="btn btn-secondary" type="button" onClick={() => void addPreset()}>
              Add Preset
            </button>
          </div>
        </AdminForm>
      </AdminEditorPanel>
    </AdminEditorSection>
  );
}
