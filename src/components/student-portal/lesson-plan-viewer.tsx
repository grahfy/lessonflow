"use client";

import type { StudentPortalLessonPlanV2Section } from "@/lib/lesson-plan-contract";
import { renderDoc } from "./tiptap-content-renderer";

interface LessonPlanViewerProps {
  sections: StudentPortalLessonPlanV2Section[];
  /** Booking ID used to rewrite admin image URLs to student-accessible endpoints. */
  bookingId?: string;
  className?: string;
}

/**
 * Lightweight read-only renderer for TipTap JSON lesson plan sections.
 * Converts the ProseMirror JSON document into React elements without
 * loading the full TipTap editor, keeping the student portal bundle small.
 */
export function LessonPlanViewer({ sections, bookingId, className }: LessonPlanViewerProps) {
  if (sections.length === 0) return null;

  return (
    <div className={`lesson-plan-viewer${className ? ` ${className}` : ""}`}>
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
