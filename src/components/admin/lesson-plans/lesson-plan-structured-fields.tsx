"use client";

import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import type { LessonPlanFieldValues } from "@/lib/lesson-plan-contract";

interface LessonPlanStructuredFieldsProps {
  value: LessonPlanFieldValues;
  disabled?: boolean;
  className?: string;
  onChange: (patch: Partial<LessonPlanFieldValues>) => void;
}

/**
 * Shared structured lesson-plan fields used by both templates and booking plans.
 */
export function LessonPlanStructuredFields({
  value,
  disabled = false,
  className,
  onChange
}: LessonPlanStructuredFieldsProps) {
  return (
    <AdminForm className={className}>
      <AdminField
        label="Lesson Focus"
        tooltip="The main concept or outcome this lesson is built around."
        fullWidth
      >
        <textarea
          className="admin-editor-textarea admin-editor-textarea-sm"
          value={value.lessonFocus}
          onChange={(event) => onChange({ lessonFocus: event.target.value })}
          disabled={disabled}
        />
      </AdminField>
      <AdminField
        label="Goals"
        tooltip="Specific goals or checkpoints for this lesson."
        fullWidth
      >
        <textarea
          className="admin-editor-textarea"
          value={value.goals}
          onChange={(event) => onChange({ goals: event.target.value })}
          disabled={disabled}
        />
      </AdminField>
      <AdminField
        label="Activities"
        tooltip="Exercises, songs, drills, or teaching steps to run during the lesson."
        fullWidth
      >
        <textarea
          className="admin-editor-textarea"
          value={value.activities}
          onChange={(event) => onChange({ activities: event.target.value })}
          disabled={disabled}
        />
      </AdminField>
      <AdminField
        label="Homework"
        tooltip="Practice tasks the student should complete after the lesson."
        fullWidth
      >
        <textarea
          className="admin-editor-textarea"
          value={value.homework}
          onChange={(event) => onChange({ homework: event.target.value })}
          disabled={disabled}
        />
      </AdminField>
      <AdminField
        label="Shared Notes"
        tooltip="Extra student-facing notes. This appears in the student portal after the lesson."
        fullWidth
      >
        <textarea
          className="admin-editor-textarea"
          value={value.sharedNotes}
          onChange={(event) => onChange({ sharedNotes: event.target.value })}
          disabled={disabled}
        />
      </AdminField>
      <AdminField
        label="Private Notes"
        tooltip="Internal teaching notes. This never appears in the student portal."
        fullWidth
      >
        <textarea
          className="admin-editor-textarea"
          value={value.privateNotes}
          onChange={(event) => onChange({ privateNotes: event.target.value })}
          disabled={disabled}
        />
      </AdminField>
    </AdminForm>
  );
}
