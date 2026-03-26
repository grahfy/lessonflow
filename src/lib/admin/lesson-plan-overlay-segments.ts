import type { LessonPlanMaterialLinkInput } from "@/lib/lesson-plan-contract";
import { sortLessonPlanMaterialLinks } from "@/lib/lesson-plan-material-links";

export type LessonPlanOverlaySegment = {
  text: string;
  linkedText: string | null;
  materialId: string | null;
  startOffset: number;
  endOffset: number;
  isLinked: boolean;
};

/**
 * Builds non-overlapping display segments for one lesson-plan field.
 *
 * RATIONALE: The admin editor keeps the textarea as the source of truth, but
 * the mirror layer still needs a stable segment map so linked ranges can be
 * underlined without changing offsets or text content.
 */
export function buildLessonPlanOverlaySegments(input: {
  text: string;
  materialLinks: ReadonlyArray<LessonPlanMaterialLinkInput>;
}): LessonPlanOverlaySegment[] {
  const { text, materialLinks } = input;
  if (!text) {
    return [];
  }

  const boundaries = new Set<number>([0, text.length]);

  for (const link of sortLessonPlanMaterialLinks(materialLinks)) {
    boundaries.add(clamp(link.startOffset, 0, text.length));
    boundaries.add(clamp(link.endOffset, 0, text.length));
  }

  const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: LessonPlanOverlaySegment[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const startOffset = sortedBoundaries[index];
    const endOffset = sortedBoundaries[index + 1];
    if (endOffset <= startOffset) {
      continue;
    }

    const segmentText = text.slice(startOffset, endOffset);
    const activeLink = materialLinks.find(
      (link) => startOffset >= link.startOffset && endOffset <= link.endOffset
    );

    segments.push({
      text: segmentText,
      linkedText: activeLink?.linkedText ?? null,
      materialId: activeLink?.materialId ?? null,
      startOffset,
      endOffset,
      isLinked: Boolean(activeLink)
    });
  }

  return segments;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
