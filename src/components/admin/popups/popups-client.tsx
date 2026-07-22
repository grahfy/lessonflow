"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AppDialog } from "@/components/ui/app-dialog";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type {
  PopupAnimation,
  PopupFormFactor,
  PopupImagePlacement,
  PopupRepeatPolicy
} from "@/generated/prisma/client";

import { PopupForm } from "./popup-form";
import styles from "./popups.module.css";

export interface SavedPopup {
  id: string;
  title: string;
  enabled: boolean;
  heading: string;
  bodyHtml: string;
  imageUrl: string | null;
  imageAlt: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  formFactor: PopupFormFactor;
  animation: PopupAnimation;
  backgroundColor: string;
  textColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  widthPx: number | null;
  cornerRadiusPx: number | null;
  imagePlacement: PopupImagePlacement;
  startAt: string | null;
  endAt: string | null;
  targetPaths: string[] | null;
  delaySeconds: number;
  repeatPolicy: PopupRepeatPolicy;
  repeatDays: number | null;
  createdAt: string;
  updatedAt: string;
}

function formatSchedule(popup: SavedPopup): string {
  if (!popup.startAt && !popup.endAt) {
    return "Always on";
  }
  const start = popup.startAt ? new Date(popup.startAt).toLocaleString() : "now";
  const end = popup.endAt ? new Date(popup.endAt).toLocaleString() : "no end";
  return `${start} → ${end}`;
}

/**
 * Admin popup list + create/edit entry point (AC-26 owner gate is enforced
 * server-side by requireOwnerAdminOrResponse; this client just renders what
 * the API allows). Stats (AC-44) show as pending: there is currently no admin
 * read endpoint for PopupDayStat rows (src/lib/popups/popups.ts's getPopup
 * only returns the SitePopup row itself) — flagged to the team rather than
 * building against a guessed shape.
 */
export function PopupsClient() {
  const [popups, setPopups] = useState<SavedPopup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingPopup, setEditingPopup] = useState<SavedPopup | null>(null);
  const [statsPopup, setStatsPopup] = useState<SavedPopup | null>(null);
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  const loadPopups = useCallback(async () => {
    const response = await safeFetch("/api/admin/popups", { cache: "no-store" });
    if (!response.ok) {
      await handleApiError(response, "Unable to load popups.");
      return;
    }
    const data = (await response.json()) as { popups: SavedPopup[] };
    setPopups(data.popups);
  }, [safeFetch, handleApiError]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPopups().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadPopups]);

  async function handleDelete(popup: SavedPopup) {
    if (!window.confirm(`Delete "${popup.title}"? This can't be undone.`)) {
      return;
    }
    setError("");
    const response = await safeFetch(`/api/admin/popups/${popup.id}`, { method: "DELETE" });
    if (!response.ok) {
      await handleApiError(response, "Unable to delete popup.");
      return;
    }
    setNotice(`Deleted "${popup.title}".`);
    await loadPopups();
  }

  const primaryAction = (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        setError("");
        setNotice("");
        setEditingPopup(null);
        setFormOpen(true);
      }}
    >
      <Plus size={14} aria-hidden="true" />
      <span>New Popup</span>
    </button>
  );

  return (
    <AdminShell title="Site Popups" error={error} notice={notice} loading={loading}>
      <div className="admin-layout-content is-scrollable">
        <AdminCard className="admin-toolbar-card admin-actions-card admin-workspace-panel">
          <div className="admin-workspace-head">
            <div className="admin-workspace-copy">
              <h2 className="admin-workspace-title">Promotional popups</h2>
              <p className="helper-text">Scheduled, styled popups shown on the public site.</p>
            </div>
            <div className="admin-workspace-actions">{primaryAction}</div>
          </div>
        </AdminCard>

        <AdminCard>
          {loading ? (
            <p className="admin-chords-state">Loading popups...</p>
          ) : popups.length === 0 ? (
            <p className="admin-chords-state">No popups yet. Click &quot;New Popup&quot; to create one.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Enabled</th>
                    <th>Schedule</th>
                    <th>Form factor</th>
                    <th>Stats</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {popups.map((popup) => (
                    <tr key={popup.id}>
                      <td>{popup.title}</td>
                      <td>
                        <span className={popup.enabled ? styles.badgeOn : styles.badgeOff}>
                          {popup.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td>{formatSchedule(popup)}</td>
                      <td>{popup.formFactor}</td>
                      <td>
                        <button type="button" className={styles.linkButton} onClick={() => setStatsPopup(popup)}>
                          View stats
                        </button>
                      </td>
                      <td className={styles.rowActions}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setError("");
                            setNotice("");
                            setEditingPopup(popup);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => handleDelete(popup)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>

      <PopupForm
        // Collapses to one "closed" key whenever the dialog is hidden, so
        // reopening (even the same popup, even a fresh "new") always remounts
        // with clean state instead of showing a stale draft from a cancelled
        // edit.
        key={formOpen ? editingPopup?.id ?? "new" : "closed"}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        popup={editingPopup}
        onSaved={() => {
          setFormOpen(false);
          setNotice(editingPopup ? `Updated "${editingPopup.title}".` : "Popup created.");
          void loadPopups();
        }}
      />

      <PopupStatsDialog popup={statsPopup} onClose={() => setStatsPopup(null)} />
    </AdminShell>
  );
}

interface PopupDayStat {
  date: string;
  impressions: number;
  clicks: number;
  dismissals: number;
}

const STATS_SERIES: Array<{ key: keyof Omit<PopupDayStat, "date">; label: string; color: string }> = [
  { key: "impressions", label: "Impressions", color: "#6b8cff" },
  { key: "clicks", label: "Clicks", color: "#4ade80" },
  { key: "dismissals", label: "Dismissals", color: "#f87171" }
];

/** Small inline SVG bar chart, in the spirit of report-trend-chart.tsx but not
 *  generalizing it — that component's TrendPoint type is hardcoded to
 *  appointments/earnings, and it isn't a file this feature owns. */
function PopupStatsChart({ days }: { days: PopupDayStat[] }) {
  const width = 560;
  const height = 160;
  const bottom = 20;
  const chartHeight = height - bottom;
  const max = Math.max(1, ...days.flatMap((day) => [day.impressions, day.clicks, day.dismissals]));
  const slotWidth = width / days.length;
  const barWidth = Math.max(1, slotWidth / (STATS_SERIES.length + 1));
  const totals = STATS_SERIES.map((series) => days.reduce((sum, day) => sum + day[series.key], 0));

  return (
    <div className={styles.statsChart}>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.statsSvg} role="img" aria-label="Popup daily stats">
        <line x1={0} y1={height - bottom} x2={width} y2={height - bottom} className={styles.statsAxis} />
        {days.map((day, dayIndex) => (
          <g key={day.date}>
            <title>
              {`${day.date}: ${day.impressions} impressions, ${day.clicks} clicks, ${day.dismissals} dismissals`}
            </title>
            {STATS_SERIES.map((series, seriesIndex) => {
              const value = day[series.key];
              const barHeight = (value / max) * chartHeight;
              return (
                <rect
                  key={series.key}
                  x={slotWidth * dayIndex + seriesIndex * barWidth}
                  y={height - bottom - barHeight}
                  width={Math.max(barWidth - 1, 1)}
                  height={barHeight}
                  fill={series.color}
                />
              );
            })}
          </g>
        ))}
      </svg>
      <div className={styles.statsLegend}>
        {STATS_SERIES.map((series, index) => (
          <span key={series.key} className={styles.statsLegendItem}>
            <span className={styles.statsSwatch} style={{ background: series.color }} />
            {series.label}: {totals[index]}
          </span>
        ))}
      </div>
      <p className={styles.helperNote}>
        {days[0]?.date} to {days[days.length - 1]?.date}
      </p>
    </div>
  );
}

/** AC-44 detail view: per-day impression/click/dismissal counts and a chart,
 *  from GET /api/admin/popups/{id}/stats (always POPUP_DAY_STATS_LOOKBACK_DAYS
 *  entries, oldest first, zero-filled). */
function PopupStatsDialog({ popup, onClose }: { popup: SavedPopup | null; onClose: () => void }) {
  const [days, setDays] = useState<PopupDayStat[] | null>(null);
  const [error, setError] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    setDays(null);
    setError("");
    if (!popup) {
      return;
    }

    let cancelled = false;
    (async () => {
      const response = await safeFetch(`/api/admin/popups/${popup.id}/stats`, { cache: "no-store" });
      if (!response.ok) {
        await handleApiError(response, "Unable to load popup stats.");
        return;
      }
      const data = (await response.json()) as { days: PopupDayStat[] };
      if (!cancelled) {
        setDays(data.days);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [popup, safeFetch, handleApiError]);

  return (
    <AppDialog isOpen={popup != null} onClose={onClose} title={popup ? `${popup.title} — stats` : "Stats"} size="md">
      {error && <p className={styles.formError}>{error}</p>}
      {!error && !days && <p className="admin-chords-state">Loading stats...</p>}
      {days && <PopupStatsChart days={days} />}
    </AppDialog>
  );
}
