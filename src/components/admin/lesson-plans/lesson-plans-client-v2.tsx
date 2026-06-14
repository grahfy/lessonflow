"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { LessonPlanSectionsEditor } from "@/components/admin/lesson-plans/lesson-plan-sections-editor";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { formatDateTime } from "@/lib/admin/formatters";
import { resolveLessonPlanTemplateSelection } from "@/lib/admin/lesson-plan-template-selection";
import { useAdminSession } from "@/lib/admin/use-admin-session";
import { useLessonPlanTemplates } from "@/lib/admin/use-lesson-plan-templates";
import {
  buildEmptyLessonPlanTemplateV2Input,
  LESSON_PLAN_TEMPLATE_CATEGORIES,
  type LessonPlanTemplateV2Input,
  type LessonPlanTemplateV2State,
} from "@/lib/lesson-plan-contract";

const CATEGORY_LABELS: Record<string, string> = {
  technique: "Technique",
  theory: "Theory",
  repertoire: "Repertoire",
  exam_prep: "Exam Prep",
  performance: "Performance",
  general: "General",
};

function draftFromTemplate(template: LessonPlanTemplateV2State): LessonPlanTemplateV2Input {
  return {
    title: template.title,
    description: template.description,
    category: template.category,
    tags: template.tags,
    skillLevel: template.skillLevel,
    instrument: template.instrument,
    sections: template.sections.length > 0
      ? template.sections
      : buildEmptyLessonPlanTemplateV2Input().sections,
  };
}

/**
 * V2 staff workspace for creating and maintaining reusable lesson-plan
 * templates with TipTap section editors and category/tag/skill metadata.
 */
export function AdminLessonPlansClientV2() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [draft, setDraft] = useState<LessonPlanTemplateV2Input>(buildEmptyLessonPlanTemplateV2Input());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);

  const onAuthError = () => window.location.assign("/admin/login");
  const { admin } = useAdminSession({ onAuthError, onError: setError });
  const { templates, loading, saving, load, create, update, archive } = useLessonPlanTemplates({
    onAuthError,
    onError: setError,
  });

  useEffect(() => {
    void load().finally(() => setHasLoadedOnce(true));
  }, [load]);

  useEffect(() => {
    if (!hasLoadedOnce) return;

    const nextSelectionId = resolveLessonPlanTemplateSelection(selectedTemplateId, templates);
    if (nextSelectionId !== selectedTemplateId) {
      setSelectedTemplateId(nextSelectionId);
      return;
    }

    const selected = templates.find((t) => t.id === selectedTemplateId);
    if (selected) {
      setDraft(draftFromTemplate(selected));
      return;
    }

    if (selectedTemplateId === "new") {
      setDraft(buildEmptyLessonPlanTemplateV2Input());
      return;
    }

    setDraft(buildEmptyLessonPlanTemplateV2Input());
  }, [hasLoadedOnce, selectedTemplateId, templates]);

  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (categoryFilter) {
      result = result.filter((t) => t.category === categoryFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((t) =>
        [t.title, t.description, t.createdByDisplayName, t.tags ?? "", t.instrument ?? ""]
          .some((v) => v.toLowerCase().includes(query))
      );
    }

    return result;
  }, [search, categoryFilter, templates]);

  const selectedTemplate = selectedTemplateId === "new"
    ? null
    : templates.find((t) => t.id === selectedTemplateId) || null;
  const canEditSelectedTemplate = !selectedTemplate || admin?.role === "owner" || selectedTemplate.createdById === admin?.id;

  async function saveTemplate() {
    setError("");
    setNotice("");

    const nextTemplate = selectedTemplate
      ? await update(selectedTemplate.id, draft)
      : await create(draft);

    if (!nextTemplate) return;

    setSelectedTemplateId(nextTemplate.id);
    setNotice(selectedTemplate ? "Template updated." : "Template created.");
  }

  async function archiveSelectedTemplateConfirmed() {
    if (!selectedTemplate) return;
    setConfirmArchiveOpen(false);
    setError("");
    setNotice("");
    const ok = await archive(selectedTemplate.id);
    if (!ok) return;

    setSelectedTemplateId("");
    setDraft(buildEmptyLessonPlanTemplateV2Input());
    setNotice("Template archived.");
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
        {/* ── Sidebar ── */}
        <AdminCard className="lesson-plan-library-sidebar">
          <div className="lesson-plan-library-sidebar-head">
            <div className="lesson-plan-library-sidebar-copy admin-workspace-copy">
              <p className="admin-inline-field">Template Library</p>
              <strong className="admin-range-label lesson-plan-library-sidebar-summary">Reusable lesson structures</strong>
              <p className="helper-text admin-workspace-summary">
                Templates with rich sections, categories, and metadata.
              </p>
            </div>
            <Tooltip content="Start a brand-new lesson-plan template.">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setSelectedTemplateId("new");
                  setDraft(buildEmptyLessonPlanTemplateV2Input());
                  setError("");
                  setNotice("");
                }}
              >
                New Template
              </button>
            </Tooltip>
          </div>

          <div className="lesson-plan-library-filters">
            <div className="field full lesson-plan-library-search">
              <label htmlFor="lp-tpl-search">Search</label>
              <input
                id="lp-tpl-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, teacher, instrument..."
              />
            </div>
            <div className="field full">
              <label htmlFor="lp-tpl-category">Category</label>
              <select
                id="lp-tpl-category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {LESSON_PLAN_TEMPLATE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="lesson-plan-template-list" role="list">
            {filteredTemplates.length === 0 ? (
              <p className="helper-text">No templates match this filter.</p>
            ) : (
              filteredTemplates.map((template) => {
                const isActive = template.id === selectedTemplateId;
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
                      {CATEGORY_LABELS[template.category] ?? template.category}
                      {template.instrument ? ` · ${template.instrument}` : ""}
                      {template.skillLevel ? ` · ${template.skillLevel}` : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </AdminCard>

        {/* ── Editor ── */}
        <AdminCard className="lesson-plan-library-editor">
          <div className="lesson-plan-library-editor-head">
            <div className="admin-workspace-copy">
              <p className="admin-inline-field">
                {selectedTemplate ? "Template Editor" : "New Template"}
              </p>
              <h2 className="lesson-plan-library-editor-title">
                {selectedTemplate ? selectedTemplate.title : "Create a reusable lesson-plan template"}
              </h2>
            </div>
            {selectedTemplate && !canEditSelectedTemplate ? (
              <span className="lesson-plan-badge">Read-only</span>
            ) : null}
          </div>

          <div className="lesson-plan-library-editor-sections">
            {/* Meta */}
            <section className="lesson-plan-editor-section">
              <div className="lesson-plan-editor-section-head">
                <p className="admin-inline-field">Template Meta</p>
              </div>
              <AdminForm className="lesson-plan-template-meta-grid">
                <AdminField label="Title" fullWidth>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    disabled={!canEditSelectedTemplate}
                  />
                </AdminField>
                <AdminField label="Description" fullWidth>
                  <textarea
                    className="admin-editor-textarea admin-editor-textarea-sm"
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    disabled={!canEditSelectedTemplate}
                  />
                </AdminField>
                <AdminField label="Category">
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as typeof d.category }))}
                    disabled={!canEditSelectedTemplate}
                  >
                    {LESSON_PLAN_TEMPLATE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Instrument">
                  <input
                    value={draft.instrument ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, instrument: e.target.value || null }))}
                    disabled={!canEditSelectedTemplate}
                    placeholder="e.g. Guitar, Piano"
                  />
                </AdminField>
                <AdminField label="Skill Level">
                  <input
                    value={draft.skillLevel ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, skillLevel: e.target.value || null }))}
                    disabled={!canEditSelectedTemplate}
                    placeholder="e.g. Beginner, Grade 3"
                  />
                </AdminField>
                <AdminField label="Tags" fullWidth>
                  <input
                    value={draft.tags ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value || null }))}
                    disabled={!canEditSelectedTemplate}
                    placeholder="Comma-separated: chords, strumming, fingerpicking"
                  />
                </AdminField>
              </AdminForm>
            </section>

            {/* Sections */}
            <section className="lesson-plan-editor-section">
              <div className="lesson-plan-editor-section-head">
                <p className="admin-inline-field">Template Sections</p>
                <p className="helper-text">
                  Define the default sections for this template. Teachers can add or remove sections when applying to a booking.
                </p>
              </div>
              <LessonPlanSectionsEditor
                sections={draft.sections}
                disabled={!canEditSelectedTemplate}
                onChange={(sections) => setDraft((d) => ({ ...d, sections }))}
              />
            </section>
          </div>

          <div className="lesson-plan-template-editor-actions">
            <div className="button-row">
              {selectedTemplate ? (
                <Tooltip content="Archive this template so it can no longer be applied.">
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={saving || !canEditSelectedTemplate}
                    onClick={() => setConfirmArchiveOpen(true)}
                  >
                    Archive
                  </button>
                </Tooltip>
              ) : null}
              <Tooltip content="Save this template to the shared library.">
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
      <ConfirmDialog
        open={confirmArchiveOpen}
        title="Archive Template"
        description={selectedTemplate ? `Archive "${selectedTemplate.title}"? Existing booking plans keep their copied content.` : "Archive this template?"}
        confirmLabel="Archive"
        destructive
        onConfirm={() => void archiveSelectedTemplateConfirmed()}
        onCancel={() => setConfirmArchiveOpen(false)}
      />
    </AdminShell>
  );
}
