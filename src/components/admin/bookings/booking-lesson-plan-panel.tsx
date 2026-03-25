"use client";

import { LessonPlanStructuredFields } from "@/components/admin/lesson-plans/lesson-plan-structured-fields";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import type { BookingLessonPlanInput, LessonPlanState, LessonPlanTemplateState } from "@/lib/lesson-plan-contract";

interface BookingLessonPlanPanelProps {
  lessonPlan: LessonPlanState | null;
  draft: BookingLessonPlanInput | null;
  loading: boolean;
  saving: boolean;
  templates: LessonPlanTemplateState[];
  templatesLoading: boolean;
  templateSelection: string;
  canManageLessonPlan: boolean;
  onTemplateSelectionChange: (value: string) => void;
  onCreateFromScratch: () => void;
  onApplyTemplate: () => void;
  onDraftChange: (patch: Partial<BookingLessonPlanInput>) => void;
  onSave: () => void;
}

/**
 * Structured lesson-plan tab shown inside one booking detail dialog.
 */
export function BookingLessonPlanPanel({
  lessonPlan,
  draft,
  loading,
  saving,
  templates,
  templatesLoading,
  templateSelection,
  canManageLessonPlan,
  onTemplateSelectionChange,
  onCreateFromScratch,
  onApplyTemplate,
  onDraftChange,
  onSave
}: BookingLessonPlanPanelProps) {
  if (loading) {
    return (
      <div className="dialog-layout customer-tab-panel booking-lesson-plan-panel">
        <p className="helper-text">Loading lesson plan...</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="dialog-layout customer-tab-panel booking-lesson-plan-panel">
        <AdminCard ghost className="booking-lesson-plan-empty-card">
          <div className="booking-lesson-plan-empty-head">
            <div>
              <h3 className="manual-section-title">Lesson Plan</h3>
              <p className="helper-text">
                Create a scratch lesson plan or apply a reusable template, then tailor the copied content for this booking.
              </p>
            </div>
            <Tooltip content="Start a blank structured lesson plan for this booking.">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={!canManageLessonPlan}
                onClick={onCreateFromScratch}
              >
                Create From Scratch
              </button>
            </Tooltip>
          </div>

          <div className="booking-lesson-plan-template-apply">
            <AdminField
              label="Apply Template"
              tooltip="Choose one active lesson-plan template and copy its fields into this booking."
              fullWidth
            >
              <select
                value={templateSelection}
                onChange={(event) => onTemplateSelectionChange(event.target.value)}
                disabled={!canManageLessonPlan || templatesLoading || templates.length === 0}
              >
                <option value="">Select a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title} · {template.createdByDisplayName}
                  </option>
                ))}
              </select>
            </AdminField>
            <Tooltip content="Copy the selected template into this booking so it can be edited independently.">
              <button
                className="btn btn-primary"
                type="button"
                disabled={!canManageLessonPlan || !templateSelection || templatesLoading}
                onClick={onApplyTemplate}
              >
                Apply Template
              </button>
            </Tooltip>
          </div>

          {lessonPlan ? (
            <p className="helper-text">
              This booking already has a saved lesson plan. Start editing below once it is loaded into the form.
            </p>
          ) : null}
        </AdminCard>
      </div>
    );
  }

  return (
    <div className="dialog-layout customer-tab-panel booking-lesson-plan-panel">
      <AdminCard ghost className="booking-lesson-plan-editor-card">
        <div className="booking-lesson-plan-editor-head">
          <div>
            <h3 className="manual-section-title">Booking Lesson Plan</h3>
            <p className="helper-text">
              Students only see Lesson Focus, Goals, Homework, and Shared Notes after the lesson has happened.
            </p>
          </div>
          {lessonPlan?.sourceTemplateTitle || draft.sourceTemplateId ? (
            <span className="lesson-plan-badge">
              {lessonPlan?.sourceTemplateTitle ? `From template: ${lessonPlan.sourceTemplateTitle}` : "Template copy"}
            </span>
          ) : (
            <span className="lesson-plan-badge">Scratch plan</span>
          )}
        </div>

        <LessonPlanStructuredFields
          value={draft}
          disabled={!canManageLessonPlan}
          className="booking-lesson-plan-fields"
          onChange={onDraftChange}
        />

        <div className="booking-lesson-plan-editor-actions">
          <div className="helper-text">
            Template changes never update existing booking plans automatically. This booking keeps its own snapshot.
          </div>
          <Tooltip content="Save this lesson plan to the selected booking.">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canManageLessonPlan || saving}
              onClick={onSave}
            >
              {saving ? "Saving..." : lessonPlan ? "Save Lesson Plan" : "Create Lesson Plan"}
            </button>
          </Tooltip>
        </div>
      </AdminCard>
    </div>
  );
}
