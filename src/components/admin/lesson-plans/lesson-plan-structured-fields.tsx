"use client";

import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import type { LessonPlanFieldValues } from "@/lib/lesson-plan-contract";

type LessonPlanFieldKey = keyof LessonPlanFieldValues;

interface LessonPlanStructuredFieldsProps {
  value: LessonPlanFieldValues;
  disabled?: boolean;
  className?: string;
  fields?: ReadonlyArray<LessonPlanFieldKey>;
  onChange: (patch: Partial<LessonPlanFieldValues>) => void;
}

const FIELD_CONFIG: ReadonlyArray<{
  key: LessonPlanFieldKey;
  label: string;
  tooltip: string;
  className: string;
}> = [
  {
    key: "lessonFocus",
    label: "Lesson Focus",
    tooltip: "The main concept or outcome this lesson is built around.",
    className: "admin-editor-textarea admin-editor-textarea-sm"
  },
  {
    key: "goals",
    label: "Goals",
    tooltip: "Specific goals or checkpoints for this lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "activities",
    label: "Activities",
    tooltip: "Exercises, songs, drills, or teaching steps to run during the lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "homework",
    label: "Homework",
    tooltip: "Practice tasks the student should complete after the lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "sharedNotes",
    label: "Shared Notes",
    tooltip: "Extra student-facing notes. This appears in the student portal after the lesson.",
    className: "admin-editor-textarea"
  },
  {
    key: "privateNotes",
    label: "Private Notes",
    tooltip: "Internal teaching notes. This never appears in the student portal.",
    className: "admin-editor-textarea"
  }
];

/**
 * Shared structured lesson-plan fields used by both templates and booking plans.
 */
export function LessonPlanStructuredFields({
  value,
  disabled = false,
  className,
  fields,
  onChange
}: LessonPlanStructuredFieldsProps) {
  const visibleFields = fields
    ? FIELD_CONFIG.filter((field) => fields.includes(field.key))
    : FIELD_CONFIG;

  return (
    <AdminForm className={className}>
      {visibleFields.map((field) => (
        <AdminField
          key={field.key}
          label={field.label}
          tooltip={field.tooltip}
          fullWidth
        >
          <textarea
            className={field.className}
            value={value[field.key]}
            onChange={(event) => onChange({ [field.key]: event.target.value } as Partial<LessonPlanFieldValues>)}
            disabled={disabled}
          />
        </AdminField>
      ))}
    </AdminForm>
  );
}
