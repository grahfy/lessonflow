"use client";

import { useEffect, useState } from "react";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { basisPointsToPercentageInput, parseAudInputToCents, parsePercentageInputToBasisPoints } from "@/lib/invoices/currency";
import { toMoneyInput } from "@/lib/admin/formatters";
import { usePresets, type Preset } from "@/lib/admin/use-presets";

/**
 * Editor for product/invoice presets.
 *
 * RATIONALE: Presets are maintained as a lightweight admin-managed catalog, but
 * the editor keeps local draft state so owners can type freely before sending a
 * save/delete mutation for a specific row.
 */
export function AdminPresetsEditor() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftPresets, setDraftPresets] = useState<Preset[]>([]);
  const [newPreset, setNewPreset] = useState<Partial<Preset>>({
    label: "",
    unitPriceCents: 0,
    description: "",
    discountKind: null,
    discountValue: null
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
    // NOTE: Mirror server presets into local editable rows so text/money inputs
    // remain responsive without mutating the hook's source data directly.
    setDraftPresets(presets);
  }, [presets]);

  /** Creates a brand new preset from the add form. */
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
      setNewPreset({ label: "", unitPriceCents: 0, description: "", discountKind: null, discountValue: null });
      void reloadPresets();
    }
  }

  /** Persists edits for one existing preset row. */
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

  /** Removes a preset after explicit confirmation from the admin. */
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
            <AdminField label="Discount Type" tooltip="Optional default discount applied when this preset is added to an invoice.">
              <select
                value={preset.discountKind ?? ""}
                onChange={(event) =>
                  setDraftPresets((current) =>
                    current.map((item) =>
                      item.id === preset.id
                        ? {
                            ...item,
                            discountKind: event.target.value ? (event.target.value as Preset["discountKind"]) : null,
                            discountValue: event.target.value ? item.discountValue ?? 0 : null
                          }
                        : item
                    )
                  )
                }
              >
                <option value="">No discount</option>
                <option value="amount">Fixed amount</option>
                <option value="percent">Percentage</option>
              </select>
            </AdminField>
            <AdminField label="Discount Value" tooltip="Amount discounts use AUD. Percentage discounts use %." fullWidth>
              <input
                placeholder={preset.discountKind === "percent" ? "10%" : "0.00"}
                value={
                  preset.discountKind === "percent"
                    ? basisPointsToPercentageInput(preset.discountValue ?? 0)
                    : toMoneyInput(preset.discountValue ?? 0)
                }
                disabled={!preset.discountKind}
                onChange={(event) =>
                  setDraftPresets((current) =>
                    current.map((item) => {
                      if (item.id !== preset.id) {
                        return item;
                      }

                      if (item.discountKind === "percent") {
                        return {
                          ...item,
                          discountValue: parsePercentageInputToBasisPoints(event.target.value).basisPoints ?? 0
                        };
                      }

                      return {
                        ...item,
                        discountValue: parseAudInputToCents(event.target.value).cents ?? 0
                      };
                    })
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
          <AdminField label="Discount Type" tooltip="Optional default discount applied when this preset is used.">
            <select
              value={newPreset.discountKind ?? ""}
              onChange={(event) =>
                setNewPreset((prev) => ({
                  ...prev,
                  discountKind: event.target.value ? (event.target.value as Preset["discountKind"]) : null,
                  discountValue: event.target.value ? prev.discountValue ?? 0 : null
                }))
              }
            >
              <option value="">No discount</option>
              <option value="amount">Fixed amount</option>
              <option value="percent">Percentage</option>
            </select>
          </AdminField>
          <AdminField label="Discount Value" tooltip="Amount discounts use AUD. Percentage discounts use %." fullWidth>
            <input
              placeholder={newPreset.discountKind === "percent" ? "10%" : "0.00"}
              value={
                newPreset.discountKind === "percent"
                  ? basisPointsToPercentageInput(newPreset.discountValue ?? 0)
                  : toMoneyInput(newPreset.discountValue ?? 0)
              }
              disabled={!newPreset.discountKind}
              onChange={(event) =>
                setNewPreset((prev) => ({
                  ...prev,
                  discountValue:
                    prev.discountKind === "percent"
                      ? parsePercentageInputToBasisPoints(event.target.value).basisPoints ?? 0
                      : parseAudInputToCents(event.target.value).cents ?? 0
                }))
              }
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
