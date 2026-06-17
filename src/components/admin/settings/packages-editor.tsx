"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { toMoneyInput } from "@/lib/admin/formatters";
import { usePackages, type LessonPackage } from "@/lib/admin/use-packages";
import { normalizePresetAmountInput, serializePresetAmountInput } from "@/lib/admin/preset-inputs";

type PackageDraft = LessonPackage & {
  priceInput: string;
};

type NewPackageDraft = {
  label: string;
  description: string;
  lessonCount: string;
  durationMinutes: string;
  priceInput: string;
  validityDays: string;
};

const EMPTY_NEW_PACKAGE: NewPackageDraft = {
  label: "",
  description: "",
  lessonCount: "",
  durationMinutes: "",
  priceInput: "",
  validityDays: ""
};

function toPackageDraft(pkg: LessonPackage): PackageDraft {
  return {
    ...pkg,
    priceInput: toMoneyInput(pkg.priceCents)
  };
}

/** Parses an optional positive-integer text field; returns undefined when blank. */
function parseOptionalInt(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) return undefined;
  return value;
}

/**
 * Editor for prepaid lesson packages.
 *
 * RATIONALE: Mirrors {@link AdminPresetsEditor} — packages are an admin-managed
 * catalog defining how many lessons a purchase grants, at which duration, and
 * how long the resulting credits remain valid.
 */
export function AdminPackagesEditor() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftPackages, setDraftPackages] = useState<PackageDraft[]>([]);
  const [newPackage, setNewPackage] = useState<NewPackageDraft>(EMPTY_NEW_PACKAGE);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const {
    packages,
    loading,
    load: reloadPackages,
    save: savePackageApi,
    remove: removePackageApi
  } = usePackages({
    onError: setError,
    onAuthError: () => window.location.assign("/admin/login")
  });

  useEffect(() => {
    setDraftPackages(packages.map(toPackageDraft));
  }, [packages]);

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function updateDraft(id: string, updater: (draft: PackageDraft) => PackageDraft) {
    setDraftPackages((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  function normalizeDraftPrice(id: string) {
    const pkg = draftPackages.find((item) => item.id === id);
    if (!pkg) return;
    const result = normalizePresetAmountInput(pkg.priceInput);
    if (result.error) {
      setError(`Price: ${result.error}`);
      return;
    }
    setError("");
    updateDraft(id, (item) => ({ ...item, priceInput: result.input }));
  }

  function normalizeNewPrice() {
    const result = normalizePresetAmountInput(newPackage.priceInput);
    if (result.error) {
      setError(`Price: ${result.error}`);
      return;
    }
    setError("");
    setNewPackage((prev) => ({ ...prev, priceInput: result.input }));
  }

  function buildPayload(draft: {
    label: string;
    description: string;
    lessonCount: number | string;
    durationMinutes: string | number | null;
    priceInput: string;
    validityDays: string | number | null;
    isActive?: boolean;
  }): Partial<LessonPackage> | null {
    const price = serializePresetAmountInput(draft.priceInput);
    if (price.error || price.value === null) {
      setError(`Price: ${price.error || "Enter a valid amount."}`);
      return null;
    }

    const lessonCount = typeof draft.lessonCount === "number" ? draft.lessonCount : Number(String(draft.lessonCount).trim());
    if (!Number.isInteger(lessonCount) || lessonCount < 1) {
      setError("Lesson count must be a whole number of 1 or more.");
      return null;
    }

    const durationMinutes =
      typeof draft.durationMinutes === "number"
        ? draft.durationMinutes
        : parseOptionalInt(String(draft.durationMinutes ?? ""));
    if (durationMinutes === undefined) {
      setError("Duration must be a whole number of minutes (or blank for any).");
      return null;
    }

    const validityDays =
      typeof draft.validityDays === "number"
        ? draft.validityDays
        : parseOptionalInt(String(draft.validityDays ?? ""));
    if (validityDays === undefined) {
      setError("Validity must be a whole number of days (or blank for no expiry).");
      return null;
    }

    return {
      label: draft.label.trim(),
      description: draft.description.trim() || null,
      lessonCount,
      durationMinutes,
      priceCents: price.value,
      validityDays,
      ...(draft.isActive !== undefined ? { isActive: draft.isActive } : {})
    };
  }

  async function addPackage() {
    if (!newPackage.label.trim()) {
      setError("Label is required.");
      return;
    }
    clearMessages();
    const payload = buildPayload(newPackage);
    if (!payload) return;
    const result = await savePackageApi(payload);
    if (result) {
      setNotice("Package added.");
      setNewPackage(EMPTY_NEW_PACKAGE);
      void reloadPackages();
    }
  }

  async function updatePackage(id: string) {
    const pkg = draftPackages.find((item) => item.id === id);
    if (!pkg) return;
    clearMessages();
    const payload = buildPayload({
      label: pkg.label,
      description: pkg.description ?? "",
      lessonCount: pkg.lessonCount,
      durationMinutes: pkg.durationMinutes,
      priceInput: pkg.priceInput,
      validityDays: pkg.validityDays,
      isActive: pkg.isActive
    });
    if (!payload) return;
    const result = await savePackageApi(payload, id);
    if (result) {
      setNotice("Package updated.");
      void reloadPackages();
    }
  }

  async function deletePackageConfirmed(id: string) {
    setPendingDeleteId(null);
    clearMessages();
    const success = await removePackageApi(id);
    if (success) {
      setNotice("Package deleted.");
      void reloadPackages();
    }
  }

  if (loading && packages.length === 0) return <p className="helper-text">Loading packages...</p>;

  return (
    <AdminEditorSection
      title="Lesson Packages"
      description="Prepaid bundles that grant lesson credits to a customer when their package invoice is paid."
      notice={notice}
      error={error}
      listClassName="admin-editor-list-two-column"
    >
      {draftPackages.map((pkg) => (
        <AdminEditorPanel key={pkg.id} subdued>
          <AdminForm>
            <AdminField label="Label" tooltip="Short name for this package (e.g. '10 Lesson Pack')." required>
              <input
                value={pkg.label}
                onChange={(event) => {
                  clearMessages();
                  updateDraft(pkg.id, (item) => ({ ...item, label: event.target.value }));
                }}
              />
            </AdminField>
            <AdminField label="Price (AUD)" tooltip="Total price for the whole package." required>
              <input
                value={pkg.priceInput}
                onChange={(event) => {
                  clearMessages();
                  updateDraft(pkg.id, (item) => ({ ...item, priceInput: event.target.value }));
                }}
                onBlur={() => normalizeDraftPrice(pkg.id)}
              />
            </AdminField>
            <AdminField label="Lesson Count" tooltip="How many lesson credits this package grants." required>
              <input
                inputMode="numeric"
                value={String(pkg.lessonCount)}
                onChange={(event) => {
                  clearMessages();
                  const next = Number(event.target.value);
                  updateDraft(pkg.id, (item) => ({ ...item, lessonCount: Number.isFinite(next) ? next : item.lessonCount }));
                }}
              />
            </AdminField>
            <AdminField label="Duration (mins)" tooltip="Credits only apply to bookings of this duration. Leave blank for any duration.">
              <input
                inputMode="numeric"
                value={pkg.durationMinutes === null ? "" : String(pkg.durationMinutes)}
                onChange={(event) => {
                  clearMessages();
                  const raw = event.target.value.trim();
                  updateDraft(pkg.id, (item) => ({ ...item, durationMinutes: raw === "" ? null : Number(raw) }));
                }}
              />
            </AdminField>
            <AdminField label="Validity (days)" tooltip="Days until the granted credits expire. Leave blank for no expiry." fullWidth>
              <input
                inputMode="numeric"
                value={pkg.validityDays === null ? "" : String(pkg.validityDays)}
                onChange={(event) => {
                  clearMessages();
                  const raw = event.target.value.trim();
                  updateDraft(pkg.id, (item) => ({ ...item, validityDays: raw === "" ? null : Number(raw) }));
                }}
              />
            </AdminField>
            <AdminField label="Description" tooltip="Optional description shown to admins." fullWidth>
              <textarea
                className="admin-editor-textarea admin-editor-textarea-sm"
                value={pkg.description ?? ""}
                onChange={(event) => {
                  clearMessages();
                  updateDraft(pkg.id, (item) => ({ ...item, description: event.target.value }));
                }}
              />
            </AdminField>
            <AdminField
              label="Status"
              tooltip="Inactive packages stay on record but are hidden from the grant package dropdown."
              fullWidth
            >
              <label className="helper-toggle">
                <input
                  type="checkbox"
                  checked={pkg.isActive}
                  onChange={(event) => {
                    clearMessages();
                    updateDraft(pkg.id, (item) => ({ ...item, isActive: event.target.checked }));
                  }}
                />{" "}
                Active
              </label>
            </AdminField>
            <div className="field full">
              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={() => void updatePackage(pkg.id)}>
                  Save Package
                </button>
                <button className="btn btn-danger" type="button" onClick={() => setPendingDeleteId(pkg.id)}>
                  Delete Package
                </button>
              </div>
            </div>
          </AdminForm>
        </AdminEditorPanel>
      ))}

      <AdminEditorPanel title="Add New Package" dashed>
        <AdminForm>
          <AdminField label="Label" tooltip="Short name for the new package.">
            <input
              placeholder="e.g. 10 Lesson Pack"
              value={newPackage.label}
              onChange={(event) => {
                clearMessages();
                setNewPackage((prev) => ({ ...prev, label: event.target.value }));
              }}
            />
          </AdminField>
          <AdminField label="Price (AUD)" tooltip="Total price for the whole package.">
            <input
              placeholder="0.00"
              value={newPackage.priceInput}
              onChange={(event) => {
                clearMessages();
                setNewPackage((prev) => ({ ...prev, priceInput: event.target.value }));
              }}
              onBlur={normalizeNewPrice}
            />
          </AdminField>
          <AdminField label="Lesson Count" tooltip="How many lesson credits this package grants.">
            <input
              inputMode="numeric"
              placeholder="10"
              value={newPackage.lessonCount}
              onChange={(event) => {
                clearMessages();
                setNewPackage((prev) => ({ ...prev, lessonCount: event.target.value }));
              }}
            />
          </AdminField>
          <AdminField label="Duration (mins)" tooltip="Credits only apply to this duration. Leave blank for any.">
            <input
              inputMode="numeric"
              placeholder="any"
              value={newPackage.durationMinutes}
              onChange={(event) => {
                clearMessages();
                setNewPackage((prev) => ({ ...prev, durationMinutes: event.target.value }));
              }}
            />
          </AdminField>
          <AdminField label="Validity (days)" tooltip="Days until credits expire. Leave blank for no expiry." fullWidth>
            <input
              inputMode="numeric"
              placeholder="no expiry"
              value={newPackage.validityDays}
              onChange={(event) => {
                clearMessages();
                setNewPackage((prev) => ({ ...prev, validityDays: event.target.value }));
              }}
            />
          </AdminField>
          <AdminField label="Description" tooltip="Optional description shown to admins." fullWidth>
            <textarea
              className="admin-editor-textarea admin-editor-textarea-sm"
              placeholder="Package details..."
              value={newPackage.description}
              onChange={(event) => {
                clearMessages();
                setNewPackage((prev) => ({ ...prev, description: event.target.value }));
              }}
            />
          </AdminField>
          <div className="field full">
            <button className="btn btn-secondary" type="button" onClick={() => void addPackage()}>
              Add Package
            </button>
          </div>
        </AdminForm>
      </AdminEditorPanel>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete Package"
        description="Are you sure you want to delete this package? Existing granted credits are unaffected."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void deletePackageConfirmed(pendingDeleteId!)}
        onCancel={() => setPendingDeleteId(null)}
      />
    </AdminEditorSection>
  );
}
