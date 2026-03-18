"use client";

import { useEffect, useState } from "react";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { toMoneyInput } from "@/lib/admin/formatters";
import { usePresets, type Preset } from "@/lib/admin/use-presets";
import {
  formatPresetDiscountInput,
  normalizePresetAmountInput,
  normalizePresetDiscountInput,
  serializePresetAmountInput,
  serializePresetDiscountInput,
  type PresetDiscountKind
} from "@/lib/admin/preset-inputs";

type PresetDraft = Preset & {
  unitPriceInput: string;
  discountValueInput: string;
};

type NewPresetDraft = {
  label: string;
  unitPriceInput: string;
  description: string;
  discountKind: PresetDiscountKind;
  discountValueInput: string;
};

const EMPTY_NEW_PRESET: NewPresetDraft = {
  label: "",
  unitPriceInput: "",
  description: "",
  discountKind: null,
  discountValueInput: ""
};

function toPresetDraft(preset: Preset): PresetDraft {
  return {
    ...preset,
    unitPriceInput: toMoneyInput(preset.unitPriceCents),
    discountValueInput: formatPresetDiscountInput(preset.discountKind ?? null, preset.discountValue ?? null)
  };
}

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
  const [draftPresets, setDraftPresets] = useState<PresetDraft[]>([]);
  const [newPreset, setNewPreset] = useState<NewPresetDraft>(EMPTY_NEW_PRESET);

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
    setDraftPresets(presets.map(toPresetDraft));
  }, [presets]);

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function updateDraftPreset(id: string, updater: (draft: PresetDraft) => PresetDraft) {
    setDraftPresets((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  function normalizeDraftPresetAmount(id: string) {
    const preset = draftPresets.find((item) => item.id === id);
    if (!preset) return;

    const result = normalizePresetAmountInput(preset.unitPriceInput);
    if (result.error) {
      setError(`Price: ${result.error}`);
      return;
    }

    setError("");
    updateDraftPreset(id, (item) => ({ ...item, unitPriceInput: result.input }));
  }

  function normalizeDraftPresetDiscount(id: string) {
    const preset = draftPresets.find((item) => item.id === id);
    if (!preset) return;

    const result = normalizePresetDiscountInput(preset.discountKind ?? null, preset.discountValueInput);
    if (result.error) {
      setError(`Discount value: ${result.error}`);
      return;
    }

    setError("");
    updateDraftPreset(id, (item) => ({ ...item, discountValueInput: result.input }));
  }

  function normalizeNewPresetAmount() {
    const result = normalizePresetAmountInput(newPreset.unitPriceInput);
    if (result.error) {
      setError(`Price: ${result.error}`);
      return;
    }

    setError("");
    setNewPreset((prev) => ({ ...prev, unitPriceInput: result.input }));
  }

  function normalizeNewPresetDiscount() {
    const result = normalizePresetDiscountInput(newPreset.discountKind, newPreset.discountValueInput);
    if (result.error) {
      setError(`Discount value: ${result.error}`);
      return;
    }

    setError("");
    setNewPreset((prev) => ({ ...prev, discountValueInput: result.input }));
  }

  function buildPresetPayload(draft: {
    label: string;
    description: string;
    unitPriceInput: string;
    discountKind?: PresetDiscountKind;
    discountValueInput: string;
  }): Partial<Preset> | null {
    const unitPrice = serializePresetAmountInput(draft.unitPriceInput);
    if (unitPrice.error || unitPrice.value === null) {
      setError(`Price: ${unitPrice.error || "Enter a valid amount."}`);
      return null;
    }

    const discountKind = draft.discountKind ?? null;
    const discountValue = serializePresetDiscountInput(discountKind, draft.discountValueInput);
    if (discountValue.error) {
      setError(`Discount value: ${discountValue.error}`);
      return null;
    }

    return {
      label: draft.label.trim(),
      description: draft.description,
      unitPriceCents: unitPrice.value,
      discountKind,
      discountValue: discountValue.value
    };
  }

  /** Creates a brand new preset from the add form. */
  async function addPreset() {
    if (!newPreset.label?.trim()) {
      setError("Label is required.");
      return;
    }
    clearMessages();

    const payload = buildPresetPayload(newPreset);
    if (!payload) {
      return;
    }

    const result = await savePresetApi(payload);
    if (result) {
      setNotice("Preset added.");
      setNewPreset(EMPTY_NEW_PRESET);
      void reloadPresets();
    }
  }

  /** Persists edits for one existing preset row. */
  async function updatePreset(id: string) {
    const preset = draftPresets.find((item) => item.id === id);
    if (!preset) return;

    clearMessages();

    const payload = buildPresetPayload(preset);
    if (!payload) {
      return;
    }

    const result = await savePresetApi(payload, id);
    if (result) {
      setNotice("Preset updated.");
      void reloadPresets();
    }
  }

  /** Removes a preset after explicit confirmation from the admin. */
  async function deletePreset(id: string) {
    if (!window.confirm("Are you sure you want to delete this preset?")) return;
    clearMessages();
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
                onChange={(event) => {
                  clearMessages();
                  updateDraftPreset(preset.id, (item) => ({ ...item, label: event.target.value }));
                }}
              />
            </AdminField>
            <AdminField label="Price (AUD)" tooltip="Default price in Australian Dollars." required>
              <input
                value={preset.unitPriceInput}
                onChange={(event) => {
                  clearMessages();
                  updateDraftPreset(preset.id, (item) => ({ ...item, unitPriceInput: event.target.value }));
                }}
                onBlur={() => normalizeDraftPresetAmount(preset.id)}
              />
            </AdminField>
            <AdminField label="Default Description" tooltip="Pre-filled text for the invoice line item." fullWidth>
              <textarea
                className="admin-editor-textarea admin-editor-textarea-sm"
                value={preset.description}
                onChange={(event) => {
                  clearMessages();
                  updateDraftPreset(preset.id, (item) => ({ ...item, description: event.target.value }));
                }}
              />
            </AdminField>
            <AdminField label="Discount Type" tooltip="Optional default discount applied when this preset is added to an invoice.">
              <select
                value={preset.discountKind ?? ""}
                onChange={(event) => {
                  clearMessages();
                  updateDraftPreset(preset.id, (item) => ({
                    ...item,
                    discountKind: event.target.value ? (event.target.value as PresetDiscountKind) : null,
                    discountValueInput: event.target.value ? item.discountValueInput : ""
                  }));
                }}
              >
                <option value="">No discount</option>
                <option value="amount">Fixed amount</option>
                <option value="percent">Percentage</option>
              </select>
            </AdminField>
            <AdminField label="Discount Value" tooltip="Amount discounts use AUD. Percentage discounts use %." fullWidth>
              <input
                placeholder={preset.discountKind === "percent" ? "10%" : "0.00"}
                value={preset.discountValueInput}
                disabled={!preset.discountKind}
                onChange={(event) => {
                  clearMessages();
                  updateDraftPreset(preset.id, (item) => ({ ...item, discountValueInput: event.target.value }));
                }}
                onBlur={() => normalizeDraftPresetDiscount(preset.id)}
              />
            </AdminField>
            <div className="field full">
              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={() => void updatePreset(preset.id)}>
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
              onChange={(event) => {
                clearMessages();
                setNewPreset((prev) => ({ ...prev, label: event.target.value }));
              }}
            />
          </AdminField>
          <AdminField label="Price (AUD)" tooltip="Default price in Australian Dollars.">
            <input
              placeholder="0.00"
              value={newPreset.unitPriceInput}
              onChange={(event) => {
                clearMessages();
                setNewPreset((prev) => ({ ...prev, unitPriceInput: event.target.value }));
              }}
              onBlur={normalizeNewPresetAmount}
            />
          </AdminField>
          <AdminField label="Default Description" tooltip="Pre-filled text for the invoice line item." fullWidth>
            <textarea
              className="admin-editor-textarea admin-editor-textarea-sm"
              placeholder="Line item text..."
              value={newPreset.description}
              onChange={(event) => {
                clearMessages();
                setNewPreset((prev) => ({ ...prev, description: event.target.value }));
              }}
            />
          </AdminField>
          <AdminField label="Discount Type" tooltip="Optional default discount applied when this preset is used.">
            <select
              value={newPreset.discountKind ?? ""}
              onChange={(event) => {
                clearMessages();
                setNewPreset((prev) => ({
                  ...prev,
                  discountKind: event.target.value ? (event.target.value as PresetDiscountKind) : null,
                  discountValueInput: event.target.value ? prev.discountValueInput : ""
                }));
              }}
            >
              <option value="">No discount</option>
              <option value="amount">Fixed amount</option>
              <option value="percent">Percentage</option>
            </select>
          </AdminField>
          <AdminField label="Discount Value" tooltip="Amount discounts use AUD. Percentage discounts use %." fullWidth>
            <input
              placeholder={newPreset.discountKind === "percent" ? "10%" : "0.00"}
              value={newPreset.discountValueInput}
              disabled={!newPreset.discountKind}
              onChange={(event) => {
                clearMessages();
                setNewPreset((prev) => ({ ...prev, discountValueInput: event.target.value }));
              }}
              onBlur={normalizeNewPresetDiscount}
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
