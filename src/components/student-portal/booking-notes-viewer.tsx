"use client";

import { renderDoc, type TipTapNode } from "./tiptap-content-renderer";

interface BookingNotesViewerProps {
  notesContent: Record<string, unknown>;
  bookingId: string;
  className?: string;
}

/**
 * Read-only renderer for booking notes TipTap JSON content.
 * Rewrites admin image URLs to student-accessible endpoints.
 */
export function BookingNotesViewer({ notesContent, bookingId, className }: BookingNotesViewerProps) {
  const doc = notesContent as TipTapNode;
  const content = doc.content as TipTapNode[] | undefined;
  if (!content || content.length === 0) return null;

  return (
    <div className={`booking-notes-viewer${className ? ` ${className}` : ""}`}>
      {renderDoc(doc, { bookingId })}
    </div>
  );
}
