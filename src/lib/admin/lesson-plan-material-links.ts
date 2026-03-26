"use client";

import type { LessonPlanMaterialLinkFieldKey, LessonPlanMaterialLinkInput } from "@/lib/lesson-plan-contract";

/**
 * Reconciles existing inline material-link ranges after a textarea edit.
 *
 * RATIONALE: Native textareas provide only the previous and next full values.
 * We treat each change as one contiguous edit, shift unaffected ranges, and
 * drop only links intersecting the edited span.
 */
export function reconcileLessonPlanMaterialLinksForField(input: {
  fieldKey: LessonPlanMaterialLinkFieldKey;
  previousText: string;
  nextText: string;
  materialLinks: ReadonlyArray<LessonPlanMaterialLinkInput>;
}): LessonPlanMaterialLinkInput[] {
  const { fieldKey, previousText, nextText, materialLinks } = input;
  if (previousText === nextText) {
    return [...materialLinks];
  }

  const prefixLength = getCommonPrefixLength(previousText, nextText);
  const suffixLength = getCommonSuffixLength(previousText, nextText, prefixLength);
  const previousEditEnd = previousText.length - suffixLength;
  const nextEditEnd = nextText.length - suffixLength;
  const delta = nextEditEnd - previousEditEnd;

  return materialLinks.flatMap((link) => {
    if (link.fieldKey !== fieldKey) {
      return [link];
    }

    if (link.endOffset <= prefixLength) {
      return [link];
    }

    if (link.startOffset >= previousEditEnd) {
      const shifted = {
        ...link,
        startOffset: link.startOffset + delta,
        endOffset: link.endOffset + delta
      };
      return nextText.slice(shifted.startOffset, shifted.endOffset) === shifted.linkedText
        ? [shifted]
        : [];
    }

    return [];
  });
}

/**
 * Inserts or replaces one inline material link while rejecting partial overlaps.
 */
export function upsertLessonPlanMaterialLink(input: {
  materialLinks: ReadonlyArray<LessonPlanMaterialLinkInput>;
  nextLink: LessonPlanMaterialLinkInput;
}): { ok: true; materialLinks: LessonPlanMaterialLinkInput[] } | { ok: false; error: string } {
  const { materialLinks, nextLink } = input;
  let replaced = false;
  const nextLinks: LessonPlanMaterialLinkInput[] = [];

  for (const link of materialLinks) {
    if (link.fieldKey !== nextLink.fieldKey) {
      nextLinks.push(link);
      continue;
    }

    const isExactRangeMatch = link.startOffset === nextLink.startOffset && link.endOffset === nextLink.endOffset;
    if (isExactRangeMatch) {
      if (!replaced) {
        nextLinks.push(nextLink);
        replaced = true;
      }
      continue;
    }

    const overlaps = nextLink.startOffset < link.endOffset && nextLink.endOffset > link.startOffset;
    if (overlaps) {
      return {
        ok: false,
        error: "Inline material links cannot partially overlap. Remove the existing link first or choose a different text range."
      };
    }

    nextLinks.push(link);
  }

  if (!replaced) {
    nextLinks.push(nextLink);
  }

  return {
    ok: true,
    materialLinks: nextLinks
  };
}

/**
 * Removes one inline material link by its stable field/range/material identity.
 */
export function removeLessonPlanMaterialLink(input: {
  materialLinks: ReadonlyArray<LessonPlanMaterialLinkInput>;
  target: LessonPlanMaterialLinkInput;
}): LessonPlanMaterialLinkInput[] {
  const { materialLinks, target } = input;
  return materialLinks.filter((link) => (
    link.fieldKey !== target.fieldKey
      || link.materialId !== target.materialId
      || link.startOffset !== target.startOffset
      || link.endOffset !== target.endOffset
      || link.linkedText !== target.linkedText
  ));
}

function getCommonPrefixLength(previousText: string, nextText: string): number {
  const limit = Math.min(previousText.length, nextText.length);
  let index = 0;
  while (index < limit && previousText[index] === nextText[index]) {
    index += 1;
  }
  return index;
}

function getCommonSuffixLength(previousText: string, nextText: string, prefixLength: number): number {
  const previousRemaining = previousText.length - prefixLength;
  const nextRemaining = nextText.length - prefixLength;
  const limit = Math.min(previousRemaining, nextRemaining);
  let index = 0;

  while (
    index < limit
    && previousText[previousText.length - 1 - index] === nextText[nextText.length - 1 - index]
  ) {
    index += 1;
  }

  return index;
}
