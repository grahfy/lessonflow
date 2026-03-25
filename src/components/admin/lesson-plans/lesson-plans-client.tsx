"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { LessonPlanStructuredFields } from "@/components/admin/lesson-plans/lesson-plan-structured-fields";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { formatDateTime } from "@/lib/admin/formatters";
import { resolveLessonPlanTemplateSelection } from "@/lib/admin/lesson-plan-template-selection";
import { useAdminSession } from "@/lib/admin/use-admin-session";
import { useLessonPlanTemplates } from "@/lib/admin/use-lesson-plan-templates";
import {
  buildEmptyLessonPlanTemplateInput,
  type LessonPlanTemplateInput,
  type LessonPlanTemplateState
} from "@/lib/lesson-plan-contract";

function draftFromTemplate(template: LessonPlanTemplateState): LessonPlanTemplateInput {
  return {
    title: template.title,
    description: template.description,
    lessonFocus: template.lessonFocus,
    goals: template.goals,
    activities: template.activities,
    homework: template.homework,
    sharedNotes: template.sharedNotes,
    privateNotes: template.privateNotes
  };
}

/**
 * Staff workspace for creating and maintaining reusable lesson-plan templates.
 */
export function AdminLessonPlansClient() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [draft, setDraft] = useState<LessonPlanTemplateInput>(buildEmptyLessonPlanTemplateInput());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const onAuthError = () => window.location.assign("/admin/login");
  const { admin } = useAdminSession({ onAuthError, onError: setError });
  const { templates, loading, saving, load, create, update, archive } = useLessonPlanTemplates({
    onAuthError,
    onError: setError
  });

  useEffect(() => {
    void load().finally(() => setHasLoadedOnce(true));
  }, [load]);

  useEffect(() => {
    if (!hasLoadedOnce) {
      return;
    }

    const nextSelectionId = resolveLessonPlanTemplateSelection(selectedTemplateId, templates);
    if (nextSelectionId !== selectedTemplateId) {
      setSelectedTemplateId(nextSelectionId);
      return;
    }

    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    if (selectedTemplate) {
      setDraft(draftFromTemplate(selectedTemplate));
      return;
    }

    if (selectedTemplateId === "new") {
      setDraft(buildEmptyLessonPlanTemplateInput());
      return;
    }

    setDraft(buildEmptyLessonPlanTemplateInput());
  }, [hasLoadedOnce, selectedTemplateId, templates]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return templates;
    }

    return templates.filter((template) =>
      [
        template.title,
        template.description,
        template.createdByDisplayName,
        template.lessonFocus,
        template.goals,
        template.activities,
        template.homework
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [search, templates]);

  const selectedTemplate = selectedTemplateId === "new"
    ? null
    : templates.find((template) => template.id === selectedTemplateId) || null;
  const canEditSelectedTemplate = !selectedTemplate || admin?.role === "owner" || selectedTemplate.createdById === admin?.id;

  async function saveTemplate() {
    setError("");
    setNotice("");

    const nextTemplate = selectedTemplate
      ? await update(selectedTemplate.id, draft)
      : await create(draft);

    if (!nextTemplate) {
      return;
    }

    setSelectedTemplateId(nextTemplate.id);
    setDraft(draftFromTemplate(nextTemplate));
    setNotice(selectedTemplate ? "Lesson-plan template updated." : "Lesson-plan template created.");
  }

  async function archiveSelectedTemplate() {
    if (!selectedTemplate) {
      return;
    }
    if (!window.confirm(`Archive "${selectedTemplate.title}"? Existing booking plans will keep their copied content.`)) {
      return;
    }

    setError("");
    setNotice("");
    const ok = await archive(selectedTemplate.id);
    if (!ok) {
      return;
    }

    setSelectedTemplateId("");
    setDraft(buildEmptyLessonPlanTemplateInput());
    setNotice("Lesson-plan template archived.");
  }

  return (
    <AdminShell
      title="Lesson Plans"
      error={error}
      notice={notice}
      loading={loading}
      className="admin-shell-lesson-plans"
    >
      <div className="admin-layout-content lesson-plan-library">
        <AdminCard className="lesson-plan-library-sidebar">
          <div className="lesson-plan-library-sidebar-head">
            <div className="lesson-plan-library-sidebar-copy">
              <p className="admin-inline-field">Template Library</p>
              <strong className="admin-range-label lesson-plan-library-sidebar-summary">Reusable lesson structures</strong>
            </div>
            <Tooltip content="Start a brand-new lesson-plan template from scratch.">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setSelectedTemplateId("new");
                  setDraft(buildEmptyLessonPlanTemplateInput());
                  setError("");
                  setNotice("");
                }}
              >
                New Template
              </button>
            </Tooltip>
          </div>

          <div className="field full lesson-plan-library-search">
            <label htmlFor="lesson-plan-template-search">Search templates</label>
            <input
              id="lesson-plan-template-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title, focus, or teacher"
            />
          </div>

          <div className="lesson-plan-template-list" role="list" aria-label="Lesson-plan templates">
            {filteredTemplates.length === 0 ? (
              <p className="helper-text">No templates match this search.</p>
            ) : (
              filteredTemplates.map((template) => {
                const isActive = template.id === selectedTemplateId;
                const canEditTemplate = admin?.role === "owner" || template.createdById === admin?.id;

                return (
                  <button
                    key={template.id}
                    className={`lesson-plan-template-list-item ${isActive ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <span className="lesson-plan-template-list-item-title">{template.title}</span>
                    <span className="helper-text">
                      {template.createdByDisplayName} · {formatDateTime(template.updatedAt)}
                    </span>
                    <span className="lesson-plan-template-list-item-meta">
                      {canEditTemplate ? "Editable by you" : "Read-only"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </AdminCard>

        <AdminCard className="lesson-plan-library-editor">
          <div className="lesson-plan-library-editor-head">
            <div>
              <p className="admin-inline-field">
                {selectedTemplate ? "Template Editor" : "New Template"}
              </p>
              <h2 className="lesson-plan-library-editor-title">
                {selectedTemplate ? selectedTemplate.title : "Create a reusable lesson-plan template"}
              </h2>
              <p className="helper-text lesson-plan-library-editor-summary">
                Staff can apply these templates from a booking and then tailor the copied lesson plan for that one lesson.
              </p>
            </div>
            {selectedTemplate && !canEditSelectedTemplate ? (
              <span className="lesson-plan-badge">Read-only</span>
            ) : null}
          </div>

          <div className="lesson-plan-library-editor-sections">
            <section className="lesson-plan-editor-section">
              <div className="lesson-plan-editor-section-head">
                <p className="admin-inline-field">Template Meta</p>
                <p className="helper-text">Name the template and describe when staff should use it.</p>
              </div>
              <AdminForm className="lesson-plan-template-meta-grid">
                <AdminField
                  label="Template Title"
                  tooltip="A short staff-facing name for this reusable template."
                  fullWidth
                >
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    disabled={!canEditSelectedTemplate}
                  />
                </AdminField>
                <AdminField
                  label="Description"
                  tooltip="Optional staff-facing context about when to apply this template."
                  fullWidth
                >
                  <textarea
                    className="admin-editor-textarea admin-editor-textarea-sm"
                    value={draft.description}
                    onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                    disabled={!canEditSelectedTemplate}
                  />
                </AdminField>
              </AdminForm>
            </section>

            <section className="lesson-plan-editor-section">
              <div className="lesson-plan-editor-section-head">
                <p className="admin-inline-field">Lesson Structure</p>
                <p className="helper-text">Capture the focus, checkpoints, and in-lesson activities.</p>
              </div>
              <LessonPlanStructuredFields
                value={draft}
                disabled={!canEditSelectedTemplate}
                className="lesson-plan-template-fields"
                fields={["lessonFocus", "goals", "activities"]}
                onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
              />
            </section>

            <section className="lesson-plan-editor-section">
              <div className="lesson-plan-editor-section-head">
                <p className="admin-inline-field">Student Follow-Up</p>
                <p className="helper-text">
                  Keep post-lesson homework, shared notes, and private coaching notes together.
                </p>
              </div>
              <LessonPlanStructuredFields
                value={draft}
                disabled={!canEditSelectedTemplate}
                className="lesson-plan-template-fields"
                fields={["homework", "sharedNotes", "privateNotes"]}
                onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
              />
            </section>
          </div>

          <div className="lesson-plan-template-editor-actions">
            <div className="helper-text">
              Students never see private notes. Student-facing summary fields appear in the portal only after the lesson has happened.
            </div>
            <div className="button-row">
              {selectedTemplate ? (
                <Tooltip content="Archive this template so it can no longer be applied to future lessons.">
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={saving || !canEditSelectedTemplate}
                    onClick={() => void archiveSelectedTemplate()}
                  >
                    Archive Template
                  </button>
                </Tooltip>
              ) : null}
              <Tooltip content="Save this template to the shared lesson-plan library.">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={saving || !canEditSelectedTemplate}
                  onClick={() => void saveTemplate()}
                >
                  {saving ? "Saving..." : selectedTemplate ? "Save Template" : "Create Template"}
                </button>
              </Tooltip>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
