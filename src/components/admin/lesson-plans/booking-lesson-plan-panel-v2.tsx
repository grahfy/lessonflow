"use client";

import { LessonPlanSectionsEditor } from "./lesson-plan-sections-editor";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import type {
  LessonPlanSection,
  LessonPlanSectionsInput,
  LessonPlanTemplateV2State,
  LessonPlanV2State
} from "@/lib/lesson-plan-contract";

interface MaterialOption {
  id: string;
  title: string;
  description?: string | null;
}

interface BookingLessonPlanPanelV2Props {
  lessonPlan: LessonPlanV2State | null;
  draft: LessonPlanSectionsInput | null;
  loading: boolean;
  templates: LessonPlanTemplateV2State[];
  templatesLoading: boolean;
  templateSelection: string;
  canManageLessonPlan: boolean;
  materials?: MaterialOption[];
  onTemplateSelectionChange: (value: string) => void;
  onCreateFromScratch: () => void;
  onApplyTemplate: () => void;
  onDraftSectionsChange: (sections: LessonPlanSection[]) => void;
  onDraftStatusChange: (status: LessonPlanSectionsInput["status"]) => void;
}

/**
 * V2 lesson-plan panel for a booking detail dialog. Uses TipTap section
 * editors instead of plain textareas.
 */
export function BookingLessonPlanPanelV2({
  lessonPlan,
  draft,
  loading,
  templates,
  templatesLoading,
  templateSelection,
  canManageLessonPlan,
  materials,
  onTemplateSelectionChange,
  onCreateFromScratch,
  onApplyTemplate,
  onDraftSectionsChange,
  onDraftStatusChange,
}: BookingLessonPlanPanelV2Props) {
  if (loading) {
    return (
      <div className="customer-tab-panel booking-lesson-plan-panel">
        <p className="helper-text">Loading lesson plan...</p>
      </div>
    );
  }

  // ── Empty state (no draft yet) ──────────────────────────────────
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

          <div className="booking-lesson-plan-card-stack booking-lesson-plan-start-stack">
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
                  tooltip="Choose one active lesson-plan template and copy its sections into this booking."
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
                        {template.category !== "general" ? ` · ${template.category}` : ""}
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
        </AdminCard>
      </div>
    );
  }

  // ── Editor state (draft present) ────────────────────────────────
  return (
    <div className="customer-tab-panel booking-lesson-plan-panel">
      <AdminCard ghost className="booking-lesson-plan-editor-card">
        <div className="booking-lesson-plan-card-stack booking-lesson-plan-editor-stack">
          <section className="lesson-plan-editor-section booking-lesson-plan-primary-card">
            <div className="booking-lesson-plan-editor-head">
              <div>
                <p className="admin-inline-field">Lesson Plan</p>
                <h3 className="manual-section-title">Booking Lesson Plan</h3>
                <p className="helper-text">
                  Edit each section with rich text. Sections marked &ldquo;Student visible&rdquo; appear in the portal after the lesson.
                </p>
              </div>
              <div className="lesson-plan-header-actions">
                {lessonPlan?.sourceTemplateTitle ? (
                  <span className="lesson-plan-badge">
                    From template: {lessonPlan.sourceTemplateTitle}
                  </span>
                ) : (
                  <span className="lesson-plan-badge">Scratch plan</span>
                )}
                <StatusSelector
                  value={draft.status}
                  disabled={!canManageLessonPlan}
                  onChange={onDraftStatusChange}
                />
              </div>
            </div>

            <LessonPlanSectionsEditor
              sections={draft.sections}
              disabled={!canManageLessonPlan}
              materials={materials}
              onChange={onDraftSectionsChange}
            />
          </section>

          <section className="lesson-plan-editor-section booking-lesson-plan-secondary-card booking-lesson-plan-template-card">
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
                tooltip="Choose one active lesson-plan template and copy its sections into this booking draft."
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
                <Tooltip content="Copy the selected template into this booking draft and replace the current sections.">
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

          <section className="lesson-plan-editor-section booking-lesson-plan-summary-card booking-lesson-plan-visibility-card">
            <div className="booking-lesson-plan-editor-head">
              <div>
                <p className="admin-inline-field">Portal Visibility</p>
                <p className="helper-text">
                  Students see sections marked &ldquo;Student visible&rdquo; after the lesson has happened.
                  Toggle visibility per section using the eye icon.
                </p>
                <p className="helper-text">
                  Template changes never update existing booking plans automatically. This booking keeps its own snapshot.
                </p>
              </div>
            </div>
          </section>
        </div>
      </AdminCard>
    </div>
  );
}

function StatusSelector({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (status: LessonPlanSectionsInput["status"]) => void;
}) {
  return (
    <select
      className="lesson-plan-status-selector"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as LessonPlanSectionsInput["status"])}
    >
      <option value="draft">Draft</option>
      <option value="in_progress">In Progress</option>
      <option value="complete">Complete</option>
    </select>
  );
}
