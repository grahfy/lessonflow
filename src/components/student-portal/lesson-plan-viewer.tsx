"use client";

import type { StudentPortalLessonPlanV2Section } from "@/lib/lesson-plan-contract";
import { renderDoc } from "./tiptap-content-renderer";

interface LessonPlanViewerProps {
  sections: StudentPortalLessonPlanV2Section[];
  /** Plain-text quick-capture notes attached to the lesson plan. */
  quickCaptureNotes?: string | null;
  /** Booking ID used to rewrite admin image URLs to student-accessible endpoints. */
  bookingId?: string;
  className?: string;
}

/**
 * Lightweight read-only renderer for TipTap JSON lesson plan sections.
 * Converts the ProseMirror JSON document into React elements without
 * loading the full TipTap editor, keeping the student portal bundle small.
 */
export function LessonPlanViewer({ sections, quickCaptureNotes, bookingId, className }: LessonPlanViewerProps) {
  if (sections.length === 0 && !quickCaptureNotes) return null;

  return (
    <div className={`lesson-plan-viewer${className ? ` ${className}` : ""}`}>
      {quickCaptureNotes ? (
        <div className="lesson-plan-viewer-section">
          <h4 className="lesson-plan-viewer-section-title">Quick Notes</h4>
          <div className="lesson-plan-viewer-section-content">
            <p className="lesson-plan-quick-capture-notes">{quickCaptureNotes}</p>
          </div>
        </div>
      ) : null}
      {sections.map((section) => (
        <div key={section.key} className="lesson-plan-viewer-section">
          <h4 className="lesson-plan-viewer-section-title">{section.title}</h4>
          <div className="lesson-plan-viewer-section-content">
            {renderDoc(section.content, { bookingId })}
          </div>
        </div>
      ))}
    </div>
  );
}
