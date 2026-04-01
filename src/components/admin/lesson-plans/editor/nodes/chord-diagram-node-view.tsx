"use client";

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { renderChordSvg } from "@/lib/chords/chord-svg";
import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { Trash2 } from "lucide-react";

/**
 * React NodeView for the chordDiagram TipTap node.
 * Renders the chord SVG inline in the editor. Shows edit/remove
 * buttons on hover when the editor is editable.
 */
export function ChordDiagramNodeView({ node, deleteNode, editor }: NodeViewProps) {
  const chordData = node.attrs.chordData as ChordDiagramData | null;

  if (!chordData) {
    return (
      <NodeViewWrapper className="chord-diagram-nodeview">
        <div className="chord-diagram-empty">Invalid chord data</div>
      </NodeViewWrapper>
    );
  }

  const svg = renderChordSvg(chordData, {
    width: 160,
    height: 220,
    showTitle: true,
    showNoteNames: true,
    showFingerNumbers: true,
  });

  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper className="chord-diagram-nodeview" data-drag-handle>
      <div className="chord-diagram-inline">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        {isEditable && (
          <div className="chord-diagram-actions">
            <button
              type="button"
              className="chord-diagram-action-btn"
              onClick={() => deleteNode()}
              title="Remove chord"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
