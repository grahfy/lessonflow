import type { LessonPlanTemplateState } from "@/lib/lesson-plan-contract";

/**
 * Resolves which lesson-plan template should be selected in the library editor.
 */
export function resolveLessonPlanTemplateSelection(
  selectedTemplateId: string,
  templates: ReadonlyArray<LessonPlanTemplateState>
): string {
  if (selectedTemplateId === "new") {
    return "new";
  }

  if (!selectedTemplateId) {
    return templates[0]?.id || "new";
  }

  return templates.some((template) => template.id === selectedTemplateId)
    ? selectedTemplateId
    : templates[0]?.id || "new";
}
