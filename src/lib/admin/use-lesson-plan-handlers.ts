"use client";

import { useCallback } from "react";

import {
  buildDefaultLessonPlanSections,
  type LessonPlanSection,
  type LessonPlanSectionsInput,
  type LessonPlanV2State
} from "@/lib/lesson-plan-contract";

/** Minimal shape the lesson-plan handlers need from the selected calendar event. */
interface LessonPlanHandlerEvent {
  id: string;
  entityType: string;
}

/** A loaded lesson-plan template (subset used by these handlers). */
interface LessonPlanTemplate {
  id: string;
  title: string;
  sections: LessonPlanSection[];
}

interface PendingConfirm {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface UseLessonPlanHandlersOptions {
  selectedEvent: LessonPlanHandlerEvent | null;
  lessonPlan: LessonPlanV2State | null;
  lessonPlanDraft: LessonPlanSectionsInput | null;
  setLessonPlanDraft: (
    next:
      | LessonPlanSectionsInput
      | null
      | ((prev: LessonPlanSectionsInput | null) => LessonPlanSectionsInput | null)
  ) => void;
  lessonPlanTemplates: LessonPlanTemplate[];
  lessonPlanTemplateSelection: string;
  setLessonPlanTemplateSelection: (value: string) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setPendingConfirm: (confirm: PendingConfirm) => void;
  saveBookingLessonPlan: (bookingId: string, payload: LessonPlanSectionsInput) => Promise<LessonPlanV2State | null>;
  clearBookingLessonPlan: (bookingId: string) => Promise<boolean>;
}

/**
 * Booking-dialog lesson-plan draft handlers.
 *
 * Extracted verbatim from the bookings orchestrator: template application,
 * scratch drafts, clearing, saving, and section/status edits. Confirmation-gated
 * destructive actions route through the shared ConfirmDialog via setPendingConfirm.
 * No behavior change.
 */
export function useLessonPlanHandlers({
  selectedEvent,
  lessonPlan,
  lessonPlanDraft,
  setLessonPlanDraft,
  lessonPlanTemplates,
  lessonPlanTemplateSelection,
  setLessonPlanTemplateSelection,
  setError,
  setNotice,
  setPendingConfirm,
  saveBookingLessonPlan,
  clearBookingLessonPlan
}: UseLessonPlanHandlersOptions) {
  const createScratchLessonPlanDraft = useCallback(() => {
    setLessonPlanDraft({
      sections: buildDefaultLessonPlanSections(),
      status: "in_progress",
      sourceTemplateId: null,
      seriesId: null,
      seriesSequence: null
    });
  }, [setLessonPlanDraft]);

  const doApplyLessonPlanTemplate = useCallback((template: LessonPlanTemplate) => {
    setLessonPlanDraft({
      sections: template.sections.length > 0
        ? template.sections.map((s) => ({ ...s, content: { ...s.content, content: [...(s.content.content ?? [])] } }))
        : buildDefaultLessonPlanSections(),
      status: "in_progress",
      sourceTemplateId: template.id,
      seriesId: null,
      seriesSequence: null
    });
    setNotice(lessonPlan ? `Template "${template.title}" copied into this booking draft. Save to keep it.` : `Template "${template.title}" copied into this booking.`);
  }, [lessonPlan, setLessonPlanDraft, setNotice]);

  const applySelectedLessonPlanTemplate = useCallback(() => {
    if (!lessonPlanTemplateSelection) {
      setError("Choose a lesson-plan template first.");
      return;
    }

    const template = lessonPlanTemplates.find((row) => row.id === lessonPlanTemplateSelection);
    if (!template) {
      setError("Selected lesson-plan template could not be loaded.");
      return;
    }

    if (lessonPlanDraft) {
      setPendingConfirm({
        title: "Replace Lesson Plan",
        description: `Replace the current booking lesson plan with "${template.title}"? Unsaved changes in this draft will be overwritten.`,
        confirmLabel: "Replace",
        destructive: true,
        onConfirm: () => doApplyLessonPlanTemplate(template)
      });
      return;
    }

    doApplyLessonPlanTemplate(template);
  }, [lessonPlanTemplateSelection, lessonPlanTemplates, lessonPlanDraft, setError, setPendingConfirm, doApplyLessonPlanTemplate]);

  const doClearLessonPlanDraft = useCallback(async () => {
    if (!lessonPlanDraft) {
      return;
    }

    if (lessonPlan && selectedEvent?.entityType === "booking") {
      const cleared = await clearBookingLessonPlan(selectedEvent.id);
      if (!cleared) {
        return;
      }
      setNotice("Lesson plan cleared.");
    } else {
      setNotice("Lesson-plan draft cleared.");
    }

    setLessonPlanDraft(null);
    setLessonPlanTemplateSelection("");
  }, [lessonPlanDraft, lessonPlan, selectedEvent, clearBookingLessonPlan, setNotice, setLessonPlanDraft, setLessonPlanTemplateSelection]);

  const clearLessonPlanDraft = useCallback(async () => {
    if (!lessonPlanDraft) {
      return;
    }

    setPendingConfirm({
      title: "Clear Lesson Plan",
      description: lessonPlan
        ? "Clear this booking lesson plan? This will remove the saved lesson plan for this booking."
        : "Clear this unsaved booking lesson-plan draft?",
      confirmLabel: "Clear",
      destructive: true,
      onConfirm: () => void doClearLessonPlanDraft()
    });
  }, [lessonPlanDraft, lessonPlan, setPendingConfirm, doClearLessonPlanDraft]);

  const saveLessonPlan = useCallback(async () => {
    if (!selectedEvent || selectedEvent.entityType !== "booking") return;
    if (!lessonPlanDraft) {
      setError("Create a lesson plan draft before saving.");
      return;
    }

    const saved = await saveBookingLessonPlan(selectedEvent.id, lessonPlanDraft);
    if (!saved) {
      return;
    }

    setLessonPlanDraft({
      sections: saved.sections,
      status: saved.status,
      sourceTemplateId: saved.sourceTemplateId,
      seriesId: saved.seriesId,
      seriesSequence: saved.seriesSequence
    });
    setNotice(lessonPlan ? "Lesson plan saved." : "Lesson plan created.");
  }, [selectedEvent, lessonPlanDraft, lessonPlan, saveBookingLessonPlan, setError, setNotice, setLessonPlanDraft]);

  const updateLessonPlanDraftSections = useCallback((sections: LessonPlanSection[]) => {
    setLessonPlanDraft((prev) => prev ? { ...prev, sections } : prev);
  }, [setLessonPlanDraft]);

  const updateLessonPlanDraftStatus = useCallback((status: LessonPlanSectionsInput["status"]) => {
    setLessonPlanDraft((prev) => prev ? { ...prev, status } : prev);
  }, [setLessonPlanDraft]);

  return {
    createScratchLessonPlanDraft,
    applySelectedLessonPlanTemplate,
    clearLessonPlanDraft,
    saveLessonPlan,
    updateLessonPlanDraftSections,
    updateLessonPlanDraftStatus
  };
}
