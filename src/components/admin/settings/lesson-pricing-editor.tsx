"use client";

import { useEffect, useState } from "react";

import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import { toMoneyInput } from "@/lib/admin/formatters";
import { parseMoneyInputToCents } from "@/lib/invoices/currency";
import { type LessonPricingOptionState } from "@/lib/lesson-pricing-contract";

type LessonPricingRow = {
  key: string;
  durationMinutes: string;
  priceInput: string;
  isActive: boolean;
};

function createRow(input?: Partial<LessonPricingOptionState>): LessonPricingRow {
  return {
    key: input?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    durationMinutes: input?.durationMinutes ? String(input.durationMinutes) : "",
    priceInput: typeof input?.priceCents === "number" ? toMoneyInput(input.priceCents) : "0.00",
    isActive: input?.isActive ?? true
  };
}

function toRows(options: LessonPricingOptionState[]): LessonPricingRow[] {
  return options.length > 0 ? options.map((option) => createRow(option)) : [createRow()];
}

export function AdminLessonPricingEditor() {
  const [rows, setRows] = useState<LessonPricingRow[]>([createRow()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    async function load() {
      try {
        const response = await safeFetch("/api/admin/lesson-pricing", { cache: "no-store" });
        if (!response.ok) {
          await handleApiError(response, "Failed to load lesson pricing.");
          return;
        }

        const data = (await response.json()) as {
          lessonPricingSettings?: {
            lessonPricingOptions?: LessonPricingOptionState[];
          };
        };
        setRows(toRows(data.lessonPricingSettings?.lessonPricingOptions ?? []));
      } catch {
        setError("Failed to load lesson pricing.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [handleApiError, safeFetch]);

  function updateRow(key: string, patch: Partial<LessonPricingRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function validateRows() {
    const nextErrors: Record<string, string> = {};
    const seenDurations = new Set<number>();

    rows.forEach((row, index) => {
      const duration = Number.parseInt(row.durationMinutes.trim(), 10);
      if (!Number.isInteger(duration) || duration < 15 || duration > 300) {
        nextErrors[`durationMinutes.${index}`] = "Use a whole-minute duration between 15 and 300.";
      } else if (seenDurations.has(duration)) {
        nextErrors[`durationMinutes.${index}`] = "Each lesson duration can only appear once.";
      } else {
        seenDurations.add(duration);
      }

      const cents = parseMoneyInputToCents(row.priceInput, "AUD").cents;
      if (cents === null || cents < 0) {
        nextErrors[`priceInput.${index}`] = "Enter a valid non-negative price.";
      }
    });

    return nextErrors;
  }

  async function saveRows() {
    setSaving(true);
    setError("");
    setNotice("");
    const nextErrors = validateRows();
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSaving(false);
      return;
    }

    try {
      const response = await safeFetch("/api/admin/lesson-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonPricingOptions: rows.map((row) => ({
            durationMinutes: Number.parseInt(row.durationMinutes.trim(), 10),
            priceCents: parseMoneyInputToCents(row.priceInput, "AUD").cents || 0,
            isActive: row.isActive
          }))
        })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: Record<string, string>;
        } | null;
        setFieldErrors(data?.fieldErrors || {});
        await handleApiError(response, data?.error || "Failed to save lesson pricing.");
        return;
      }

      const data = (await response.json()) as {
        lessonPricingSettings?: {
          lessonPricingOptions?: LessonPricingOptionState[];
        };
      };
      setRows(toRows(data.lessonPricingSettings?.lessonPricingOptions ?? []));
      setNotice("Lesson pricing saved.");
    } catch {
      setError("Failed to save lesson pricing.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="helper-text">Loading lesson pricing...</p>;
  }

  return (
    <AdminEditorSection
      title="Lesson Info / Prices"
      description="Manage the lesson durations and prices used by admin invoices and admin booking forms. Changes apply immediately."
      notice={notice}
      error={error}
      actions={
        <div className="button-row">
          <button className="btn btn-secondary" type="button" onClick={() => setRows((current) => [...current, createRow()])}>
            Add Lesson Row
          </button>
          <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void saveRows()}>
            {saving ? "Saving..." : "Save Lesson Pricing"}
          </button>
        </div>
      }
    >
      {rows.map((row, index) => (
        <AdminEditorPanel key={row.key} title={`Lesson ${index + 1}`} subdued>
          <AdminForm className="dialog-form-grid">
            <AdminField
              label="Duration (minutes)"
              description="Choose the billable lesson length for this row."
              error={fieldErrors[`durationMinutes.${index}`]}
            >
              <input
                value={row.durationMinutes}
                onChange={(event) => updateRow(row.key, { durationMinutes: event.target.value.replace(/\D/g, "").slice(0, 3) })}
              />
            </AdminField>
            <AdminField
              label="Price"
              description="Stored in cents and shown here as a decimal amount."
              error={fieldErrors[`priceInput.${index}`]}
            >
              <input value={row.priceInput} onChange={(event) => updateRow(row.key, { priceInput: event.target.value })} />
            </AdminField>
            <AdminField label="Active" description="Inactive rows stay in settings but are hidden from active invoicing and booking choices.">
              <label className="admin-inline-checkbox">
                <input
                  type="checkbox"
                  checked={row.isActive}
                  onChange={(event) => updateRow(row.key, { isActive: event.target.checked })}
                />
                Enabled
              </label>
            </AdminField>
            <div className="field full">
              <div className="button-row">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={index === 0}
                  onClick={() =>
                    setRows((current) => {
                      const next = [...current];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next;
                    })
                  }
                >
                  Move Up
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={index === rows.length - 1}
                  onClick={() =>
                    setRows((current) => {
                      const next = [...current];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      return next;
                    })
                  }
                >
                  Move Down
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={rows.length === 1}
                  onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
                >
                  Remove
                </button>
              </div>
            </div>
          </AdminForm>
        </AdminEditorPanel>
      ))}
    </AdminEditorSection>
  );
}
