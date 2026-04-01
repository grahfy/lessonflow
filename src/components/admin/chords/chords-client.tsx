"use client";

import React, { useCallback, useEffect, useState } from "react";

import { Plus } from "lucide-react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminTabBar } from "@/components/admin/ui/admin-tab-bar";
import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { formatChordName } from "@/lib/chords/music-theory";
import { renderChordSvg } from "@/lib/chords/chord-svg";

import { ChordCard } from "./chord-card";
import { ChordBuilder } from "./chord-builder";
import { ChordChartEditor } from "./chord-chart-editor";

type Tab = "library" | "charts";

const TABS = [
  { key: "library" as Tab, label: "Library", tooltip: "Saved chord voicings" },
  { key: "charts" as Tab, label: "Charts", tooltip: "Chord chart collections for songs" },
] as const;

interface SavedChord {
  id: string;
  name: string;
  root: string;
  quality: string;
  diagram: ChordDiagramData;
  isArchived: boolean;
}

interface SavedChordChart {
  id: string;
  title: string;
  description: string | null;
  items: Array<{
    id: string;
    chordId: string;
    sortOrder: number;
    annotation: string | null;
    chord: SavedChord;
  }>;
}

type ApiResult = {
  ok: boolean;
  error?: string;
};

type ChordsResponse = ApiResult & {
  chords: SavedChord[];
};

type ChordChartsResponse = ApiResult & {
  charts: SavedChordChart[];
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function fetchJson<T extends ApiResult>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => null) as T | null;

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }

  return data;
}

export function AdminChordsClient() {
  const [tab, setTab] = useState<Tab>("library");
  const [chords, setChords] = useState<SavedChord[]>([]);
  const [charts, setCharts] = useState<SavedChordChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingChord, setEditingChord] = useState<SavedChord | null>(null);
  const [chartEditorOpen, setChartEditorOpen] = useState(false);
  const [editingChart, setEditingChart] = useState<SavedChordChart | null>(null);
  const [filterRoot, setFilterRoot] = useState("");

  const loadChords = useCallback(async () => {
    const data = await fetchJson<ChordsResponse>("/api/admin/chords");
    setChords(data.chords);
  }, []);

  const loadCharts = useCallback(async () => {
    const data = await fetchJson<ChordChartsResponse>("/api/admin/chord-charts");
    setCharts(data.charts);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError("");

    Promise.all([loadChords(), loadCharts()])
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load the chords workspace."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadChords, loadCharts]);

  const handleSaveChord = useCallback(
    async (diagram: ChordDiagramData) => {
      setError("");
      const name = formatChordName(diagram.name);
      const body = {
        name,
        root: diagram.name.root,
        quality: diagram.name.quality,
        diagram,
      };

      try {
        if (editingChord) {
          await fetchJson(`/api/admin/chords/${editingChord.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } else {
          await fetchJson("/api/admin/chords", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }

        await loadChords();
        setNotice(editingChord ? `Updated ${name}.` : `Saved ${name} to the chord library.`);
        setBuilderOpen(false);
        setEditingChord(null);
      } catch (saveError) {
        setError(getErrorMessage(saveError, "Unable to save the chord."));
      }
    },
    [editingChord, loadChords]
  );

  const handleArchiveChord = useCallback(
    async (id: string) => {
      setError("");

      try {
        await fetchJson(`/api/admin/chords/${id}`, { method: "DELETE" });
        await loadChords();
        setNotice("Chord archived.");
      } catch (archiveError) {
        setError(getErrorMessage(archiveError, "Unable to archive the chord."));
      }
    },
    [loadChords]
  );

  const handleSaveChart = useCallback(
    async (data: { title: string; description: string; items: Array<{ chordId: string; sortOrder: number; annotation?: string }> }) => {
      setError("");

      try {
        if (editingChart) {
          await fetchJson(`/api/admin/chord-charts/${editingChart.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        } else {
          await fetchJson("/api/admin/chord-charts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        }

        await loadCharts();
        setNotice(editingChart ? `Updated ${data.title}.` : `Saved ${data.title} as a chord chart.`);
        setChartEditorOpen(false);
        setEditingChart(null);
      } catch (saveError) {
        setError(getErrorMessage(saveError, "Unable to save the chord chart."));
      }
    },
    [editingChart, loadCharts]
  );

  const handleArchiveChart = useCallback(
    async (id: string) => {
      setError("");

      try {
        await fetchJson(`/api/admin/chord-charts/${id}`, { method: "DELETE" });
        await loadCharts();
        setNotice("Chord chart archived.");
      } catch (archiveError) {
        setError(getErrorMessage(archiveError, "Unable to archive the chord chart."));
      }
    },
    [loadCharts]
  );

  const filteredChords = filterRoot
    ? chords.filter((c) => c.root === filterRoot)
    : chords;

  const uniqueRoots = [...new Set(chords.map((c) => c.root))].sort();
  const activeActionLabel = tab === "library" ? "New Chord" : "New Chart";
  const workspaceHeading = tab === "library"
    ? "Chord library and voicing management"
    : "Song chart collections for teaching materials";
  const workspaceSummary = tab === "library"
    ? "Save reusable chord voicings, filter by root note, and open diagrams for editing."
    : "Group saved chords into printable song charts with ordering and section annotations.";
  const filteredSummary = tab === "library"
    ? `${filteredChords.length} visible chord${filteredChords.length === 1 ? "" : "s"}`
    : `${charts.length} chart${charts.length === 1 ? "" : "s"} available`;
  const primaryAction = (
    <button
      type="button"
      className="btn btn-primary admin-chords-primary-action"
      onClick={() => {
        setError("");
        setNotice("");

        if (tab === "library") {
          setEditingChord(null);
          setBuilderOpen(true);
          return;
        }

        setEditingChart(null);
        setChartEditorOpen(true);
      }}
    >
      <Plus size={14} aria-hidden="true" />
      <span>{activeActionLabel}</span>
    </button>
  );

  return (
    <AdminShell title="Chords" error={error} notice={notice} loading={loading} className="admin-shell-chords">
      <div className="admin-layout-content is-scrollable">
        <AdminCard className="admin-toolbar-card admin-actions-card admin-workspace-panel">
          <div className="admin-workspace-head">
            <div className="admin-workspace-copy">
              <p className="admin-inline-field">Chord Console</p>
              <h2 className="admin-workspace-title">{workspaceHeading}</h2>
              <p className="helper-text admin-workspace-summary">{workspaceSummary}</p>
              <div className="admin-workspace-chip-row" aria-label="Chord workspace context">
                <span className="admin-workspace-chip">Owner-only workspace</span>
                <span className="admin-workspace-chip">{tab === "library" ? "Library tab active" : "Charts tab active"}</span>
                <span className="admin-workspace-chip">{filteredSummary}</span>
              </div>
            </div>
            <div className="admin-workspace-actions">
              {primaryAction}
            </div>
          </div>

          <div className="admin-workspace-stats" aria-label="Chord workspace summary">
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Saved chords</span>
              <strong>{loading ? "—" : chords.length}</strong>
            </div>
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Visible chords</span>
              <strong>{loading ? "—" : filteredChords.length}</strong>
            </div>
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Charts</span>
              <strong>{loading ? "—" : charts.length}</strong>
            </div>
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Root filters</span>
              <strong>{loading ? "—" : uniqueRoots.length || 1}</strong>
            </div>
          </div>
        </AdminCard>

        <AdminCard className="admin-toolbar-card admin-tab-toolbar">
          <AdminTabBar items={TABS} activeTab={tab} onChange={setTab} />
        </AdminCard>

        <AdminCard className="admin-chords-panel">
          {loading ? (
            <p className="admin-chords-state">Loading chord library...</p>
          ) : tab === "library" ? (
            <div className="admin-chords-content">
              {uniqueRoots.length > 1 && (
                <div className="admin-chords-filter-row">
                  <span className="chord-builder-label">Filter</span>
                  <div className="admin-chords-filter-buttons">
                    <button
                      type="button"
                      className={`chord-builder-finger-btn admin-chords-filter-btn${filterRoot === "" ? " is-active" : ""}`}
                      onClick={() => setFilterRoot("")}
                    >
                      All
                    </button>
                    {uniqueRoots.map((root) => (
                      <button
                        key={root}
                        type="button"
                        className={`chord-builder-finger-btn admin-chords-filter-btn${filterRoot === root ? " is-active" : ""}`}
                        onClick={() => setFilterRoot(root)}
                      >
                        {root}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredChords.length === 0 ? (
                <p className="admin-chords-state">
                  {chords.length === 0
                    ? "No chords saved yet. Click \"New Chord\" to create your first."
                    : "No chords match the selected filter."}
                </p>
              ) : (
                <div className="chord-library-grid">
                  {filteredChords.map((chord) => (
                    <ChordCard
                      key={chord.id}
                      name={chord.name}
                      diagram={chord.diagram}
                      onClick={() => {
                        setEditingChord(chord);
                        setBuilderOpen(true);
                      }}
                      onEdit={() => {
                        setEditingChord(chord);
                        setBuilderOpen(true);
                      }}
                      onArchive={() => void handleArchiveChord(chord.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="admin-chords-content">
              {charts.length === 0 ? (
                <p className="admin-chords-state">
                  No chord charts yet. Click &quot;New Chart&quot; to create one for a song.
                </p>
              ) : (
                <div className="admin-chord-chart-list">
                  {charts.map((chart) => (
                    <section key={chart.id} className="chord-card chord-chart-card">
                      <div className="chord-chart-card-header">
                        <div className="chord-chart-card-copy">
                          <h3>{chart.title}</h3>
                          {chart.description ? (
                            <p>{chart.description}</p>
                          ) : null}
                        </div>
                        <div className="chord-chart-card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => {
                              setEditingChart(chart);
                              setChartEditorOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => window.open(`/api/admin/chord-charts/${chart.id}/export`, "_blank", "noopener,noreferrer")}
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-xs"
                            onClick={() => void handleArchiveChart(chart.id)}
                          >
                            Archive
                          </button>
                        </div>
                      </div>

                      {chart.items.length > 0 ? (
                        <div className="chord-chart-items">
                          {chart.items.map((item) => {
                            const svg = renderChordSvg(item.chord.diagram as ChordDiagramData, { compact: true });
                            return (
                              <div key={item.id} className="chord-chart-item">
                                <div dangerouslySetInnerHTML={{ __html: svg }} />
                                {item.annotation ? (
                                  <div className="chord-chart-item-caption">{item.annotation}</div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="admin-chords-subtle-state">No chord items have been added to this chart yet.</p>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </AdminCard>

        {builderOpen ? (
          <ChordBuilder
            isOpen={builderOpen}
            onClose={() => {
              setBuilderOpen(false);
              setEditingChord(null);
            }}
            onSave={(diagram) => void handleSaveChord(diagram)}
            initial={editingChord?.diagram}
          />
        ) : null}

        {chartEditorOpen ? (
          <ChordChartEditor
            isOpen={chartEditorOpen}
            onClose={() => {
              setChartEditorOpen(false);
              setEditingChart(null);
            }}
            onSave={(data) => void handleSaveChart(data)}
            availableChords={chords}
            initial={
              editingChart
                ? {
                    title: editingChart.title,
                    description: editingChart.description ?? "",
                    items: editingChart.items.map((item) => ({
                      chordId: item.chordId,
                      chordName: item.chord.name,
                      diagram: item.chord.diagram as ChordDiagramData,
                      sortOrder: item.sortOrder,
                      annotation: item.annotation ?? "",
                    })),
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
