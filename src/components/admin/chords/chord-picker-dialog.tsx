"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { renderChordSvg } from "@/lib/chords/chord-svg";
import { ChordBuilder } from "./chord-builder";

interface SavedChord {
  id: string;
  name: string;
  diagram: ChordDiagramData;
}

interface ChordPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (diagram: ChordDiagramData, chordId?: string) => void;
}

/**
 * Dialog for picking a chord from the library or building a new one.
 * Used when inserting a chord into a lesson plan via the TipTap editor.
 */
export function ChordPickerDialog({ isOpen, onClose, onSelect }: ChordPickerDialogProps) {
  const [chords, setChords] = useState<SavedChord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/admin/chords")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setChords(data.chords);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSelect = useCallback(
    (chord: SavedChord) => {
      onSelect(chord.diagram, chord.id);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleBuildNew = useCallback(
    (diagram: ChordDiagramData) => {
      onSelect(diagram);
      setBuilderOpen(false);
      onClose();
    },
    [onSelect, onClose]
  );

  const filtered = search
    ? chords.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : chords;

  return (
    <>
      <AdminDialog isOpen={isOpen && !builderOpen} onClose={onClose} title="Insert Chord" size="wide">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chords..."
              className="chord-builder-input"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setBuilderOpen(true)}
            >
              Build New
            </button>
          </div>

          {loading ? (
            <p style={{ padding: 20, opacity: 0.6 }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <p style={{ padding: 20, opacity: 0.6 }}>
              {chords.length === 0
                ? "No chords in the library yet. Click \"Build New\" to create one."
                : "No chords match your search."}
            </p>
          ) : (
            <div className="chord-library-grid">
              {filtered.map((chord) => {
                const svg = renderChordSvg(chord.diagram, { showTitle: true, showNoteNames: false });
                return (
                  <button
                    key={chord.id}
                    type="button"
                    className="chord-card"
                    onClick={() => handleSelect(chord)}
                  >
                    <div dangerouslySetInnerHTML={{ __html: svg }} />
                    <div className="chord-card-name">{chord.name}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </AdminDialog>

      {builderOpen && (
        <ChordBuilder
          isOpen={builderOpen}
          onClose={() => setBuilderOpen(false)}
          onInsert={handleBuildNew}
        />
      )}
    </>
  );
}
