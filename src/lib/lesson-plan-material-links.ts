import type { LessonPlanMaterialLinkFieldKey, LessonPlanMaterialLinkInput } from "@/lib/lesson-plan-contract";
import { LESSON_PLAN_LINKABLE_FIELD_KEYS } from "@/lib/lesson-plan-contract";
import { ValidationError } from "@/lib/errors";

type LessonPlanFieldTextMap = Record<LessonPlanMaterialLinkFieldKey, string>;

type LessonPlanMaterialLinkRowLike = {
  fieldKey: LessonPlanMaterialLinkFieldKey;
  startOffset: number;
  endOffset: number;
  linkedText: string;
};

/**
 * Returns the student-visible lesson-plan field values used for inline link validation.
 */
export function getLessonPlanLinkableFieldTexts(input: {
  lessonFocus: string;
  goals: string;
  activities: string;
  homework: string;
  sharedNotes: string;
}): LessonPlanFieldTextMap {
  return {
    lessonFocus: input.lessonFocus || "",
    goals: input.goals || "",
    activities: input.activities || "",
    homework: input.homework || "",
    sharedNotes: input.sharedNotes || ""
  };
}

/**
 * Sorts lesson-plan material links into a stable field/range order for rendering and validation.
 */
export function sortLessonPlanMaterialLinks<T extends LessonPlanMaterialLinkRowLike>(links: ReadonlyArray<T>): T[] {
  return [...links].sort((left, right) => {
    if (left.fieldKey === right.fieldKey) {
      if (left.startOffset === right.startOffset) {
        return left.endOffset - right.endOffset;
      }
      return left.startOffset - right.startOffset;
    }

    return LESSON_PLAN_LINKABLE_FIELD_KEYS.indexOf(left.fieldKey as LessonPlanMaterialLinkFieldKey)
      - LESSON_PLAN_LINKABLE_FIELD_KEYS.indexOf(right.fieldKey as LessonPlanMaterialLinkFieldKey);
  });
}

/**
 * Validates offset ranges, selected text snapshots, and overlap rules for one lesson-plan draft.
 */
export function assertValidLessonPlanMaterialLinks(
  fieldTexts: LessonPlanFieldTextMap,
  links: ReadonlyArray<LessonPlanMaterialLinkInput>
): void {
  const sorted = sortLessonPlanMaterialLinks(links);

  for (const link of sorted) {
    const fieldText = fieldTexts[link.fieldKey] || "";
    if (link.endOffset > fieldText.length) {
      throw new ValidationError("Inline material link range is outside the selected lesson-plan field.", {
        fieldErrors: {
          materialLinks: ["Inline material link range is outside the selected lesson-plan field."]
        }
      });
    }

    const selectedText = fieldText.slice(link.startOffset, link.endOffset);
    if (selectedText !== link.linkedText) {
      throw new ValidationError("Inline material link text no longer matches the selected lesson-plan text.", {
        fieldErrors: {
          materialLinks: ["Inline material link text no longer matches the selected lesson-plan text."]
        }
      });
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.fieldKey !== current.fieldKey) {
      continue;
    }

    if (current.startOffset < previous.endOffset) {
      throw new ValidationError("Inline material links cannot overlap within the same lesson-plan field.", {
        fieldErrors: {
          materialLinks: ["Inline material links cannot overlap within the same lesson-plan field."]
        }
      });
    }
  }
}
