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
  templates: LessonPlanTemplateState[];
  templatesLoading: boolean;
  templateSelection: string;
  canManageLessonPlan: boolean;
  onTemplateSelectionChange: (value: string) => void;
  onCreateFromScratch: () => void;
  onApplyTemplate: () => void;
  onClearLessonPlan: () => void;
  onDraftChange: (patch: Partial<BookingLessonPlanInput>) => void;
}

/**
 * Structured lesson-plan tab shown inside one booking detail dialog.
 */
export function BookingLessonPlanPanel({
  lessonPlan,
  draft,
  loading,
  templates,
  templatesLoading,
  templateSelection,
  canManageLessonPlan,
  onTemplateSelectionChange,
  onCreateFromScratch,
  onApplyTemplate,
  onClearLessonPlan,
  onDraftChange
}: BookingLessonPlanPanelProps) {
  if (loading) {
    return (
      <div className="customer-tab-panel booking-lesson-plan-panel">
        <p className="helper-text">Loading lesson plan...</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="customer-tab-panel booking-lesson-plan-panel">
        <AdminCard ghost className="booking-lesson-plan-empty-card">
          <div className="booking-lesson-plan-empty-intro">
            <h3 className="manual-section-title">Lesson Plan</h3>
            <p className="helper-text">
              Start from a blank lesson plan or copy a reusable template for this booking.
            </p>
          </div>

          <div className="booking-lesson-plan-start-layout">
            <section className="lesson-plan-editor-section booking-lesson-plan-start-card">
              <div className="booking-lesson-plan-empty-head">
                <div>
                  <p className="admin-inline-field">Scratch Plan</p>
                  <p className="helper-text">Open a blank structure and tailor everything for this lesson.</p>
                </div>
              </div>
              <Tooltip content="Start a blank structured lesson plan for this booking.">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!canManageLessonPlan}
                  onClick={onCreateFromScratch}
                >
                  Create From Scratch
                </button>
              </Tooltip>
            </section>

            <section className="lesson-plan-editor-section booking-lesson-plan-start-card">
              <div className="booking-lesson-plan-empty-head">
                <div>
                  <p className="admin-inline-field">Apply Template</p>
                  <p className="helper-text">Copy one shared template, then edit the snapshot for this booking only.</p>
                </div>
              </div>
              <div className="booking-lesson-plan-template-apply">
                <AdminField
                  label="Template"
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
              </div>
              <Tooltip content="Copy the selected template into this booking so it can be edited independently.">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!canManageLessonPlan || !templateSelection || templatesLoading}
                  onClick={onApplyTemplate}
                >
                  Apply Template
                </button>
              </Tooltip>
            </section>
          </div>

          {lessonPlan ? (
            <p className="helper-text">
              This booking already has a saved lesson plan. Open the existing draft below once it finishes loading.
            </p>
          ) : null}
        </AdminCard>
      </div>
    );
  }

  return (
    <div className="customer-tab-panel booking-lesson-plan-panel">
      <AdminCard ghost className="booking-lesson-plan-editor-card">
        <div className="booking-lesson-plan-editor-layout">
          <div className="booking-lesson-plan-editor-main">
            <section className="lesson-plan-editor-section">
              <div className="booking-lesson-plan-editor-head">
                <div>
                  <h3 className="manual-section-title">Booking Lesson Plan</h3>
                  <p className="helper-text">
                    Keep the lesson structure and take-home work clear enough to reuse at the next follow-up.
                  </p>
                </div>
              </div>

              <LessonPlanStructuredFields
                value={draft}
                disabled={!canManageLessonPlan}
                className="booking-lesson-plan-fields"
                fields={["lessonFocus", "goals", "activities", "homework"]}
                onChange={onDraftChange}
              />
            </section>
          </div>

          <aside className="booking-lesson-plan-editor-side">
            <section className="lesson-plan-editor-section booking-lesson-plan-summary-card">
              <div className="booking-lesson-plan-editor-head">
                <div>
                  <p className="admin-inline-field">Portal Visibility</p>
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
            </section>

            <section className="lesson-plan-editor-section">
              <div className="booking-lesson-plan-editor-head">
                <div>
                  <p className="admin-inline-field">Choose From Template</p>
                  <p className="helper-text">
                    Replace this draft with one reusable template, then save the updated snapshot for this booking.
                  </p>
                </div>
              </div>
              <div className="booking-lesson-plan-template-tools">
                <AdminField
                  label="Template"
                  tooltip="Choose one active lesson-plan template and copy its fields into this booking draft."
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
                <div className="button-row">
                  <Tooltip content="Copy the selected template into this booking draft and replace the current lesson-plan fields.">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={!canManageLessonPlan || !templateSelection || templatesLoading}
                      onClick={onApplyTemplate}
                    >
                      Replace With Template
                    </button>
                  </Tooltip>
                </div>
              </div>
            </section>

            <section className="lesson-plan-editor-section">
              <div className="booking-lesson-plan-editor-head">
                <div>
                  <p className="admin-inline-field">Notes and Follow-Up</p>
                  <p className="helper-text">
                    Shared notes appear in the portal later. Private notes stay internal.
                  </p>
                </div>
              </div>
              <LessonPlanStructuredFields
                value={draft}
                disabled={!canManageLessonPlan}
                className="booking-lesson-plan-fields"
                fields={["sharedNotes", "privateNotes"]}
                onChange={onDraftChange}
              />
            </section>

            <section className="lesson-plan-editor-section booking-lesson-plan-side-note">
              <p className="helper-text">
                Template changes never update existing booking plans automatically. This booking keeps its own snapshot.
              </p>
              <div className="button-row">
                <Tooltip content="Remove this booking lesson plan and return the tab to its empty start state.">
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={!canManageLessonPlan}
                    onClick={onClearLessonPlan}
                  >
                    Clear Lesson Plan
                  </button>
                </Tooltip>
              </div>
            </section>
          </aside>
        </div>
      </AdminCard>
    </div>
  );
}
