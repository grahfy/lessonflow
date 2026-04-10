"use client";

import { useCallback, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { TipTapEditor } from "./editor/tiptap-editor";
import type { LessonPlanSection, LessonPlanSectionVisibility } from "@/lib/lesson-plan-contract";
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { Tooltip } from "@/components/admin/ui/tooltip";

interface MaterialOption {
  id: string;
  title: string;
  description?: string | null;
}

interface LessonPlanSectionsEditorProps {
  sections: LessonPlanSection[];
  disabled?: boolean;
  className?: string;
  /** Available learning materials for inline linking in section editors. */
  materials?: MaterialOption[];
  /** Booking ID for image uploads. When provided, enables image upload in section editors. */
  bookingId?: string | null;
  onChange: (sections: LessonPlanSection[]) => void;
}

/**
 * Renders an ordered list of lesson-plan sections, each with a TipTap
 * rich-text editor. Teachers can add, remove, reorder, and toggle
 * visibility of sections.
 */
export function LessonPlanSectionsEditor({
  sections,
  disabled = false,
  className,
  materials,
  bookingId,
  onChange,
}: LessonPlanSectionsEditorProps) {
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");

  const handleSectionContentChange = useCallback(
    (index: number, content: JSONContent) => {
      const next = sections.map((s, i) =>
        i === index ? { ...s, content: content as LessonPlanSection["content"] } : s
      );
      onChange(next);
    },
    [sections, onChange]
  );

  const handleToggleVisibility = useCallback(
    (index: number) => {
      const next = sections.map((s, i) => {
        if (i !== index) return s;
        const newVis: LessonPlanSectionVisibility =
          s.visibility === "student_visible" ? "teacher_only" : "student_visible";
        return { ...s, visibility: newVis };
      });
      onChange(next);
    },
    [sections, onChange]
  );

  const handleRemoveSection = useCallback(
    (index: number) => {
      onChange(sections.filter((_, i) => i !== index));
    },
    [sections, onChange]
  );

  const handleMoveSection = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= sections.length) return;
      const next = [...sections];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    },
    [sections, onChange]
  );

  const handleAddSection = useCallback(() => {
    const title = newSectionTitle.trim();
    if (!title) return;
    const key = `custom_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${Date.now()}`;
    const newSection: LessonPlanSection = {
      key,
      title,
      visibility: "teacher_only",
      content: { type: "doc", content: [] },
    };
    onChange([...sections, newSection]);
    setNewSectionTitle("");
    setAddingSection(false);
  }, [newSectionTitle, sections, onChange]);

  return (
    <div className={`lesson-plan-sections-list${className ? ` ${className}` : ""}`}>
      {sections.map((section, index) => (
        <div key={section.key} className="lesson-plan-section-editor">
          <div className="lesson-plan-section-header">
            {!disabled && (
              <div className="lesson-plan-section-grip">
                <button
                  type="button"
                  className="tiptap-toolbar-btn"
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => handleMoveSection(index, -1)}
                >
                  <GripVertical size={14} />
                </button>
              </div>
            )}
            <span className="lesson-plan-section-title">{section.title}</span>
            <Tooltip
              content={
                section.visibility === "student_visible"
                  ? "Visible to students after the lesson"
                  : "Only visible to teachers"
              }
            >
              <button
                type="button"
                className={`lesson-plan-section-visibility${
                  section.visibility === "student_visible" ? " is-student-visible" : ""
                }`}
                disabled={disabled}
                onClick={() => handleToggleVisibility(index)}
              >
                {section.visibility === "student_visible" ? (
                  <><Eye size={12} /> Student visible</>
                ) : (
                  <><EyeOff size={12} /> Teacher only</>
                )}
              </button>
            </Tooltip>
            {!disabled && section.key.startsWith("custom_") && (
              <button
                type="button"
                className="tiptap-toolbar-btn"
                title="Remove section"
                onClick={() => handleRemoveSection(index)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <TipTapEditor
            content={section.content}
            placeholder={`${section.title}...`}
            editable={!disabled}
            materials={materials}
            imageUploadTarget={bookingId ? { entityType: "booking", id: bookingId } : null}
            onUpdate={(json) => handleSectionContentChange(index, json)}
          />
        </div>
      ))}

      {!disabled && (
        <div className="lesson-plan-add-section-bar">
          {addingSection ? (
            <div className="lesson-plan-add-section-form">
              <input
                type="text"
                className="admin-input"
                placeholder="Section title (e.g. Ear Training)"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSection();
                  if (e.key === "Escape") setAddingSection(false);
                }}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!newSectionTitle.trim()}
                onClick={handleAddSection}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAddingSection(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAddingSection(true)}
            >
              <Plus size={14} /> Add Section
            </button>
          )}
        </div>
      )}
    </div>
  );
}
