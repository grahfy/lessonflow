"use client";

import React from "react";

import { ALL_ROOT_NOTES, CHORD_QUALITIES, QUALITY_DISPLAY_MAP } from "@/lib/chords/music-theory";

interface ChordBuilderNamingProps {
  root: string;
  quality: string;
  bassNote?: string;
  displayName?: string;
  detectionMessage?: string;
  voicingLookupMessage?: string;
  canPreview: boolean;
  isPreviewLoading: boolean;
  previewMessage?: string;
  previewError?: string;
  isLeftHanded: boolean;
  startFret: number;
  onRootChange: (root: string) => void;
  onQualityChange: (quality: string) => void;
  onBassNoteChange: (bassNote: string | undefined) => void;
  onDisplayNameChange: (displayName: string | undefined) => void;
  onPreviewStrum: () => void;
  onPreviewBlock: () => void;
  onLeftHandedChange: (isLeftHanded: boolean) => void;
  onStartFretChange: (startFret: number) => void;
  onClearAll: () => void;
}

/**
 * Left panel of the chord builder — chord naming controls, left-handed
 * toggle, and starting fret stepper. Mirrors Guitar Pro's naming panel.
 */
export function ChordBuilderNaming({
  root,
  quality,
  bassNote,
  displayName,
  detectionMessage,
  voicingLookupMessage,
  canPreview,
  isPreviewLoading,
  previewMessage,
  previewError,
  isLeftHanded,
  startFret,
  onRootChange,
  onQualityChange,
  onBassNoteChange,
  onDisplayNameChange,
  onPreviewStrum,
  onPreviewBlock,
  onLeftHandedChange,
  onStartFretChange,
  onClearAll,
}: ChordBuilderNamingProps) {
  return (
    <div className="chord-builder-naming">
      <div className="chord-builder-field">
        <label className="chord-builder-label">Root</label>
        <select
          value={root}
          onChange={(e) => onRootChange(e.target.value)}
          className="chord-builder-select"
        >
          <option value="">Unresolved</option>
          {ALL_ROOT_NOTES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div className="chord-builder-field">
        <label className="chord-builder-label">Type</label>
        <select
          value={quality}
          onChange={(e) => onQualityChange(e.target.value)}
          className="chord-builder-select"
        >
          <option value="">Unresolved</option>
          {CHORD_QUALITIES.map((q) => (
            <option key={q} value={q}>
              {QUALITY_DISPLAY_MAP[q] || q}
            </option>
          ))}
        </select>
      </div>

      <div className="chord-builder-field">
        <label className="chord-builder-label">Bass</label>
        <select
          value={bassNote ?? ""}
          onChange={(e) => onBassNoteChange(e.target.value || undefined)}
          className="chord-builder-select"
        >
          <option value="">None</option>
          {ALL_ROOT_NOTES.map((n) => (
            <option key={n} value={n}>/{n}</option>
          ))}
        </select>
      </div>

      <div className="chord-builder-field">
        <label className="chord-builder-label">Change Chord Name</label>
        <input
          type="text"
          value={displayName ?? ""}
          onChange={(e) => onDisplayNameChange(e.target.value || undefined)}
          placeholder="Auto"
          className="chord-builder-input"
          maxLength={30}
        />
      </div>

      {detectionMessage ? (
        <p className="chord-builder-status">{detectionMessage}</p>
      ) : null}

      {voicingLookupMessage ? (
        <p className="chord-builder-preview-status is-warning" role="status">{voicingLookupMessage}</p>
      ) : null}

      <div className="chord-builder-preview-actions">
        <button
          type="button"
          onClick={onPreviewStrum}
          className="btn btn-secondary chord-builder-preview-btn"
          disabled={!canPreview || isPreviewLoading}
        >
          Strum
        </button>
        <button
          type="button"
          onClick={onPreviewBlock}
          className="btn btn-secondary chord-builder-preview-btn"
          disabled={!canPreview || isPreviewLoading}
        >
          Play Notes
        </button>
      </div>

      {previewMessage ? (
        <p className="chord-builder-preview-status" role="status">{previewMessage}</p>
      ) : null}

      {previewError ? (
        <p className="chord-builder-preview-status is-error" role="alert">{previewError}</p>
      ) : null}

      <div className="chord-builder-field">
        <label className="chord-builder-label">Start Fret</label>
        <div className="chord-builder-stepper">
          <button
            type="button"
            onClick={() => onStartFretChange(startFret - 1)}
            disabled={startFret <= 1}
            className="chord-builder-stepper-btn"
          >
            -
          </button>
          <span className="chord-builder-stepper-value">{startFret}</span>
          <button
            type="button"
            onClick={() => onStartFretChange(startFret + 1)}
            disabled={startFret >= 20}
            className="chord-builder-stepper-btn"
          >
            +
          </button>
        </div>
      </div>

      <label className="chord-builder-checkbox-label">
        <input
          type="checkbox"
          checked={isLeftHanded}
          onChange={(e) => onLeftHandedChange(e.target.checked)}
        />
        Left-handed
      </label>

      <button
        type="button"
        onClick={onClearAll}
        className="chord-builder-clear-btn"
      >
        Clear All
      </button>
    </div>
  );
}
