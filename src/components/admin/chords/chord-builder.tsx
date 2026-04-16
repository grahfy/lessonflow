"use client";

import React, { useCallback, useState } from "react";
import type { ChordDiagramData, ChordFingering } from "@/lib/chords/chord-types";
import { lookupChordVoicings } from "@/lib/chords/chord-lookup";
import { useChordBuilder } from "./use-chord-builder";
import { ChordBuilderFretboard } from "./chord-builder-fretboard";
import { ChordBuilderNaming } from "./chord-builder-naming";
import { ChordBuilderFingerSelector } from "./chord-builder-finger-selector";
import { ChordBuilderAlternatives } from "./chord-builder-alternatives";
import { useChordPreview } from "./use-chord-preview";
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
    detectedChord,
    placeDot,
    removeDot,
    cycleStringState,
    addBarre,
    removeBarre,
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
  const canSubmit = detectedChord !== null;
  const detectionMessage = canSubmit
    ? undefined
    : "This fingering does not match a supported chord yet.";
  const {
    canPreview,
    isLoading: isPreviewLoading,
    previewError,
    previewMessage,
    playBlockPreview,
    playStrumPreview,
  } = useChordPreview(diagram, isOpen);
  const [voicingLookupMessage, setVoicingLookupMessage] = useState("");

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

  const loadFirstMatchingVoicing = useCallback(
    (root: string, quality: string, bassNote?: string) => {
      if (!root || !quality) {
        setVoicingLookupMessage("");
        return;
      }

      const voicings = lookupChordVoicings(root, quality, bassNote);
      if (voicings.length === 0) {
        const chordLabel = formatChordName({ root, quality, bassNote }) || "the selected chord";
        setVoicingLookupMessage(`No bundled voicing found for ${chordLabel}.`);
        return;
      }

      setVoicingLookupMessage("");
      loadFingering(voicings[0]);
    },
    [loadFingering]
  );

  const handleRootChange = useCallback(
    (root: string) => {
      setRoot(root);
      loadFirstMatchingVoicing(root, diagram.name.quality, diagram.name.bassNote);
    },
    [diagram.name.bassNote, diagram.name.quality, loadFirstMatchingVoicing, setRoot]
  );

  const handleQualityChange = useCallback(
    (quality: string) => {
      setQuality(quality);
      loadFirstMatchingVoicing(diagram.name.root, quality, diagram.name.bassNote);
    },
    [diagram.name.bassNote, diagram.name.root, loadFirstMatchingVoicing, setQuality]
  );

  const handleBassNoteChange = useCallback(
    (bassNote: string | undefined) => {
      setBassNote(bassNote);
      loadFirstMatchingVoicing(diagram.name.root, diagram.name.quality, bassNote);
    },
    [diagram.name.quality, diagram.name.root, loadFirstMatchingVoicing, setBassNote]
  );

  const handleSave = useCallback(async () => {
    if (!onSave || !canSubmit) return;
    setSaving(true);
    try {
      onSave(diagram);
    } finally {
      setSaving(false);
    }
  }, [canSubmit, onSave, diagram]);

  const handleInsert = useCallback(() => {
    if (!canSubmit) return;
    onInsert?.(diagram);
    onClose();
  }, [canSubmit, onInsert, diagram, onClose]);

  const handleAlternativeSelect = useCallback(
    (fingering: ChordFingering) => {
      setVoicingLookupMessage("");
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
          disabled={saving || !canSubmit}
        >
          {saving ? "Saving..." : "Save to Library"}
        </button>
      )}
      {onInsert && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleInsert}
          disabled={!canSubmit}
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
      bodyClassName="chord-builder-dialog-body"
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
            detectionMessage={detectionMessage}
            voicingLookupMessage={voicingLookupMessage}
            canPreview={canPreview}
            isPreviewLoading={isPreviewLoading}
            previewMessage={previewMessage}
            previewError={previewError}
            isLeftHanded={diagram.isLeftHanded}
            startFret={diagram.fingering.startFret}
            onRootChange={handleRootChange}
            onQualityChange={handleQualityChange}
            onBassNoteChange={handleBassNoteChange}
            onDisplayNameChange={setDisplayName}
            onPreviewStrum={playStrumPreview}
            onPreviewBlock={playBlockPreview}
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
            onRemoveBarre={removeBarre}
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
