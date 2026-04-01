"use client";

import { useState, useCallback } from "react";
import type { ChordDiagramData, ChordFingering } from "@/lib/chords/chord-types";
import { useChordBuilder } from "./use-chord-builder";
import { ChordBuilderFretboard } from "./chord-builder-fretboard";
import { ChordBuilderNaming } from "./chord-builder-naming";
import { ChordBuilderFingerSelector } from "./chord-builder-finger-selector";
import { ChordBuilderAlternatives } from "./chord-builder-alternatives";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { formatChordName } from "@/lib/chords/music-theory";

interface ChordBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when saving to library. */
  onSave?: (diagram: ChordDiagramData) => void;
  /** Called when inserting into a lesson plan. */
  onInsert?: (diagram: ChordDiagramData) => void;
  /** Initial diagram data for editing an existing chord. */
  initial?: ChordDiagramData;
}

/**
 * Guitar Pro-style chord builder dialog.
 *
 * Three-panel layout:
 * - Left: chord naming (root, quality, bass, display name), left-handed toggle, start fret
 * - Center: interactive fretboard with finger placement
 * - Right: alternative voicings from the chords-db database
 */
export function ChordBuilder({
  isOpen,
  onClose,
  onSave,
  onInsert,
  initial,
}: ChordBuilderProps) {
  const {
    diagram,
    placeDot,
    removeDot,
    cycleStringState,
    addBarre,
    setRoot,
    setQuality,
    setBassNote,
    setDisplayName,
    setLeftHanded,
    setStartFret,
    clearAll,
    loadFingering,
  } = useChordBuilder(initial);

  const [selectedFinger, setSelectedFinger] = useState(1);
  const [saving, setSaving] = useState(false);

  const handlePlaceDot: (s: number, f: number, finger: number) => void = useCallback(
    (stringIndex, fret) => {
      if (selectedFinger === 0) {
        removeDot(stringIndex);
      } else {
        placeDot(stringIndex, fret, selectedFinger);
      }
    },
    [selectedFinger, placeDot, removeDot]
  );

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      onSave(diagram);
    } finally {
      setSaving(false);
    }
  }, [onSave, diagram]);

  const handleInsert = useCallback(() => {
    onInsert?.(diagram);
    onClose();
  }, [onInsert, diagram, onClose]);

  const handleAlternativeSelect = useCallback(
    (fingering: ChordFingering) => {
      loadFingering(fingering);
    },
    [loadFingering]
  );

  const title = formatChordName(diagram.name) || "Chord Builder";

  const footer = (
    <div className="chord-builder-footer">
      {onSave && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save to Library"}
        </button>
      )}
      {onInsert && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleInsert}
        >
          Insert
        </button>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onClose}
      >
        Cancel
      </button>
    </div>
  );

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Chord Builder — ${title}`}
      size="wide"
      footer={footer}
    >
      <div className="chord-builder-layout">
        {/* Left panel: naming + options */}
        <div className="chord-builder-panel-left">
          <ChordBuilderNaming
            root={diagram.name.root}
            quality={diagram.name.quality}
            bassNote={diagram.name.bassNote}
            displayName={diagram.name.displayName}
            isLeftHanded={diagram.isLeftHanded}
            startFret={diagram.fingering.startFret}
            onRootChange={setRoot}
            onQualityChange={setQuality}
            onBassNoteChange={setBassNote}
            onDisplayNameChange={setDisplayName}
            onLeftHandedChange={setLeftHanded}
            onStartFretChange={setStartFret}
            onClearAll={clearAll}
          />
          <ChordBuilderFingerSelector
            selected={selectedFinger}
            onChange={setSelectedFinger}
          />
        </div>

        {/* Center: interactive fretboard */}
        <div className="chord-builder-panel-center">
          <ChordBuilderFretboard
            diagram={diagram}
            selectedFinger={selectedFinger}
            onPlaceDot={handlePlaceDot}
            onRemoveDot={removeDot}
            onCycleStringState={cycleStringState}
            onAddBarre={addBarre}
          />
        </div>

        {/* Right panel: alternatives */}
        <div className="chord-builder-panel-right">
          <ChordBuilderAlternatives
            root={diagram.name.root}
            quality={diagram.name.quality}
            bassNote={diagram.name.bassNote}
            isLeftHanded={diagram.isLeftHanded}
            onSelect={handleAlternativeSelect}
          />
        </div>
      </div>
    </AdminDialog>
  );
}
