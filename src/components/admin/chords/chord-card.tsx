"use client";

import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { renderChordSvg } from "@/lib/chords/chord-svg";

interface ChordCardProps {
  name: string;
  diagram: ChordDiagramData;
  onClick?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
}

/**
 * Card component displaying a chord SVG thumbnail with name and action buttons.
 * Used in the chord library grid.
 */
export function ChordCard({ name, diagram, onClick, onEdit, onArchive }: ChordCardProps) {
  const svg = renderChordSvg(diagram, { showTitle: true, showNoteNames: true });

  return (
    <div
      className="chord-card"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="chord-card-name">{name}</div>
      {(onEdit || onArchive) && (
        <div className="chord-card-actions">
          {onEdit && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              Edit
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
            >
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}
