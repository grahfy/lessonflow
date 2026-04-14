"use client";

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";

/**
 * React NodeView for images in booking notes.
 * Wraps the <img> with a hover-visible delete button so users
 * can remove uploaded images without keyboard shortcuts.
 */
export function BookingImageNodeView({ node, deleteNode, editor }: NodeViewProps) {
  const { src, alt, title } = node.attrs;
  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper className="booking-image-nodeview">
      <div className="booking-image-wrapper">
        <img
          src={src as string}
          alt={(alt as string) || ""}
          title={(title as string) || undefined}
          className="booking-notes-image"
          draggable={false}
        />
        {isEditable && (
          <div className="booking-image-actions">
            <button
              type="button"
              className="booking-image-action-btn"
              onClick={() => deleteNode()}
              title="Remove image"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
