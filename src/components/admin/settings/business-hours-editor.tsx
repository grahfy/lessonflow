"use client";

import { useEffect, useState } from "react";

import { AdminEditorPanel, AdminEditorSection } from "@/components/admin/ui/admin-editor-section";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { BusinessHoursConfig } from "@/lib/booking/business-hours";

import styles from "./business-hours-editor.module.css";

type WeekdayHours = BusinessHoursConfig["weekdays"][number];

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Only used until the GET response arrives; the server is the source of defaults. */
function buildFallbackWeekdays(): WeekdayHours[] {
  return WEEKDAY_LABELS.map(() => ({ isOpen: false, openMinute: 9 * 60, closeMinute: 17 * 60 }));
}

/** Minute-of-day -> `<input type="time">` value. Clamped to a real day. */
function minutesToTimeInput(totalMinutes: number): string {
  const clamped = Math.min(Math.max(Math.round(totalMinutes), 0), 24 * 60);
  // A close time of exactly midnight (1440) reads back as "00:00" — native
  // time inputs have no "24:00" and business hours don't realistically run
  // that late, so this edge case is accepted rather than worked around.
  const hours = Math.floor(clamped / 60) % 24;
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** `<input type="time">` value -> minute-of-day. Unparseable input is midnight. */
function timeInputToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Owner-only editor for the school-wide `BusinessHours` singleton that the
 * student booking tab derives its available slots from (AC-49, AC-51).
 *
 * There is no per-teacher availability model: a teacher who doesn't work a
 * given weekday still shows as available unless that day is closed here.
 */
export function AdminBusinessHoursEditor() {
  const [weekdays, setWeekdays] = useState<WeekdayHours[]>(buildFallbackWeekdays);
  const [slotGranularityMinutes, setSlotGranularityMinutes] = useState(30);
  const [minimumNoticeHours, setMinimumNoticeHours] = useState(24);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    async function load() {
      try {
        const response = await safeFetch("/api/admin/business-hours", { cache: "no-store" });
        if (!response.ok) {
          await handleApiError(response, "Failed to load business hours.");
          return;
        }

        const data = (await response.json()) as { businessHours?: BusinessHoursConfig };
        setWeekdays(data.businessHours?.weekdays ?? buildFallbackWeekdays());
        setSlotGranularityMinutes(data.businessHours?.slotGranularityMinutes ?? 30);
        setMinimumNoticeHours(data.businessHours?.minimumNoticeHours ?? 24);
      } catch {
        setError("Failed to load business hours.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [handleApiError, safeFetch]);

  function updateDay(index: number, patch: Partial<WeekdayHours>) {
    setWeekdays((current) => current.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  }

  /** First matching error for a weekday row, whether from its day-level refine or one of its two fields. */
  function dayError(index: number): string | undefined {
    return (
      fieldErrors[`weekdays.${index}`] ||
      fieldErrors[`weekdays.${index}.openMinute`] ||
      fieldErrors[`weekdays.${index}.closeMinute`]
    );
  }

  async function saveHours() {
    setSaving(true);
    setError("");
    setNotice("");
    setFieldErrors({});

    try {
      const response = await safeFetch("/api/admin/business-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekdays, slotGranularityMinutes, minimumNoticeHours })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: Record<string, string>;
        } | null;
        setFieldErrors(data?.fieldErrors || {});
        await handleApiError(response, data?.error || "Failed to save business hours.");
        return;
      }

      const data = (await response.json()) as { businessHours?: BusinessHoursConfig };
      setWeekdays(data.businessHours?.weekdays ?? weekdays);
      setSlotGranularityMinutes(data.businessHours?.slotGranularityMinutes ?? slotGranularityMinutes);
      setMinimumNoticeHours(data.businessHours?.minimumNoticeHours ?? minimumNoticeHours);
      setNotice("Business hours saved.");
    } catch {
      setError("Failed to save business hours.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="helper-text">Loading business hours...</p>;
  }

  return (
    <AdminEditorSection
      title="Business Hours"
      description="School-wide open/close times used to derive bookable lesson slots for the student booking tab. This is not per-teacher — a teacher who doesn't work a given day still shows as available unless that day is closed here."
      notice={notice}
      error={error}
      actions={
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void saveHours()}>
          {saving ? "Saving..." : "Save Business Hours"}
        </button>
      }
    >
      <AdminEditorPanel title="Weekly Hours" subdued>
        <div className={styles["day-list"]}>
          {weekdays.map((day, index) => (
            <div key={WEEKDAY_LABELS[index]} className={styles["day-row"]}>
              <label className={cx("admin-inline-checkbox", styles["day-toggle"], styles["control"])}>
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  onChange={(event) => updateDay(index, { isOpen: event.target.checked })}
                />
                {WEEKDAY_LABELS[index]}
              </label>
              <div className={styles["time-range"]}>
                <input
                  type="time"
                  className={styles["control"]}
                  aria-label={`${WEEKDAY_LABELS[index]} opens at`}
                  value={minutesToTimeInput(day.openMinute)}
                  disabled={!day.isOpen}
                  onChange={(event) => updateDay(index, { openMinute: timeInputToMinutes(event.target.value) })}
                />
                <span aria-hidden="true">to</span>
                <input
                  type="time"
                  className={styles["control"]}
                  aria-label={`${WEEKDAY_LABELS[index]} closes at`}
                  value={minutesToTimeInput(day.closeMinute)}
                  disabled={!day.isOpen}
                  onChange={(event) => updateDay(index, { closeMinute: timeInputToMinutes(event.target.value) })}
                />
              </div>
              {dayError(index) ? (
                <p className={cx("field-error", styles["day-error"])} role="alert">
                  {dayError(index)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </AdminEditorPanel>

      <AdminEditorPanel title="Booking Rules" subdued>
        <AdminForm>
          <AdminField
            label="Slot length (minutes)"
            description="The grid step used to generate candidate start times, independent of lesson length."
            error={fieldErrors.slotGranularityMinutes}
            htmlFor="business-hours-slot-granularity"
          >
            <input
              id="business-hours-slot-granularity"
              className={styles["control"]}
              type="number"
              min={5}
              max={240}
              value={slotGranularityMinutes}
              onChange={(event) => setSlotGranularityMinutes(Number(event.target.value))}
            />
          </AdminField>
          <AdminField
            label="Minimum notice (hours)"
            description="How far in advance a student must request a lesson."
            error={fieldErrors.minimumNoticeHours}
            htmlFor="business-hours-minimum-notice"
          >
            <input
              id="business-hours-minimum-notice"
              className={styles["control"]}
              type="number"
              min={0}
              max={720}
              value={minimumNoticeHours}
              onChange={(event) => setMinimumNoticeHours(Number(event.target.value))}
            />
          </AdminField>
        </AdminForm>
      </AdminEditorPanel>
    </AdminEditorSection>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
