"use client";

import { useState, useCallback } from "react";
import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { renderChordSvg } from "@/lib/chords/chord-svg";
import { Trash2 } from "lucide-react";

interface ChordChartChordItem {
  chordId: string;
  chordName: string;
  diagram: ChordDiagramData;
  sortOrder: number;
  annotation: string;
}

interface SavedChord {
  id: string;
  name: string;
  diagram: ChordDiagramData;
}

interface ChordChartEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; items: Array<{ chordId: string; sortOrder: number; annotation?: string }> }) => void;
  availableChords: SavedChord[];
  initial?: { title: string; description: string; items: ChordChartChordItem[] };
}

/**
 * Dialog for composing a chord chart — add chords from library, reorder,
 * annotate with section labels, and save.
 */
export function ChordChartEditor({
  isOpen,
  onClose,
  onSave,
  availableChords,
  initial,
}: ChordChartEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [items, setItems] = useState<ChordChartChordItem[]>(initial?.items ?? []);
  const [saving, setSaving] = useState(false);

  const addChord = useCallback((chord: SavedChord) => {
    setItems((prev) => [
      ...prev,
      {
        chordId: chord.id,
        chordName: chord.name,
        diagram: chord.diagram as ChordDiagramData,
        sortOrder: prev.length,
        annotation: "",
      },
    ]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sortOrder: i })));
  }, []);

  const updateAnnotation = useCallback((index: number, annotation: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, annotation } : item)));
  }, []);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, i) => ({ ...item, sortOrder: i }));
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      onSave({
        title,
        description,
        items: items.map((item) => ({
          chordId: item.chordId,
          sortOrder: item.sortOrder,
          annotation: item.annotation || undefined,
        })),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [title, description, items, onSave, onClose]);

  const footer = (
    <div className="chord-builder-footer">
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving || !title.trim()}
      >
        {saving ? "Saving..." : "Save Chart"}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Cancel
      </button>
    </div>
  );

  return (
    <AdminDialog isOpen={isOpen} onClose={onClose} title="Chord Chart" size="wide" footer={footer}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="chord-builder-field">
          <label className="chord-builder-label">Title (e.g. song name)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="chord-builder-input"
            placeholder="Enter song or chart title..."
            maxLength={200}
          />
        </div>

        <div className="chord-builder-field">
          <label className="chord-builder-label">Description (key, tempo, notes)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="chord-builder-input"
            placeholder="Optional description..."
            rows={2}
            maxLength={2000}
            style={{ resize: "vertical" }}
          />
        </div>

        {/* Current chart items */}
        <div>
          <label className="chord-builder-label" style={{ marginBottom: 8, display: "block" }}>
            Chords in Chart ({items.length})
          </label>
          {items.length === 0 ? (
            <p className="chord-builder-no-alternatives">Add chords from the library below.</p>
          ) : (
            <div className="chord-chart-items">
              {items.map((item, i) => {
                const svg = renderChordSvg(item.diagram, { compact: true });
                return (
                  <div key={`${item.chordId}-${i}`} className="chord-chart-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button
                          type="button"
                          className="chord-builder-stepper-btn"
                          onClick={() => moveItem(i, -1)}
                          disabled={i === 0}
                          title="Move left"
                          style={{ width: 20, height: 20, fontSize: 10 }}
                        >
                          &larr;
                        </button>
                        <button
                          type="button"
                          className="chord-builder-stepper-btn"
                          onClick={() => moveItem(i, 1)}
                          disabled={i === items.length - 1}
                          title="Move right"
                          style={{ width: 20, height: 20, fontSize: 10 }}
                        >
                          &rarr;
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        title="Remove"
                        style={{ background: "none", border: "none", color: "rgba(239,68,68,0.8)", cursor: "pointer" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: svg }} />
                    <div className="chord-chart-item-annotation">
                      <input
                        type="text"
                        value={item.annotation}
                        onChange={(e) => updateAnnotation(i, e.target.value)}
                        placeholder="Section..."
                        maxLength={100}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Available chords to add */}
        <div>
          <label className="chord-builder-label" style={{ marginBottom: 8, display: "block" }}>
            Add from Library
          </label>
          {availableChords.length === 0 ? (
            <p className="chord-builder-no-alternatives">No chords saved yet. Create some in the Library tab first.</p>
          ) : (
            <div className="chord-builder-alternatives-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
              {availableChords.map((chord) => {
                const svg = renderChordSvg(chord.diagram as ChordDiagramData, { compact: true });
                return (
                  <button
                    key={chord.id}
                    type="button"
                    className="chord-builder-alternative-btn"
                    onClick={() => addChord(chord)}
                    title={`Add ${chord.name}`}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminDialog>
  );
}
