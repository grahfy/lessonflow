import { z } from "zod";

const lessonPlanTitleSchema = z.string().trim().min(1).max(120);
const lessonPlanDescriptionSchema = z.string().trim().max(600).default("");

export const LESSON_PLAN_SECTION_VISIBILITY = ["student_visible", "teacher_only"] as const;
export type LessonPlanSectionVisibility = (typeof LESSON_PLAN_SECTION_VISIBILITY)[number];

export const LESSON_PLAN_STATUS = ["draft", "in_progress", "complete"] as const;
export type LessonPlanStatusValue = (typeof LESSON_PLAN_STATUS)[number];

export const LESSON_PLAN_TEMPLATE_CATEGORIES = [
  "technique", "theory", "repertoire", "exam_prep", "performance", "general"
] as const;
export type LessonPlanTemplateCategoryValue = (typeof LESSON_PLAN_TEMPLATE_CATEGORIES)[number];

/**
 * Validates a TipTap ProseMirror JSON document at a structural level.
 * Full deep validation of node types is left to the editor; this just
 * ensures the shape is a valid `{ type: "doc", content: [...] }` wrapper.
 */
export const tiptapDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.unknown())).default([])
}).passthrough();

export const lessonPlanSectionSchema = z.object({
  key: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  visibility: z.enum(LESSON_PLAN_SECTION_VISIBILITY),
  content: tiptapDocumentSchema
});

export const lessonPlanSectionsInputSchema = z.object({
  sections: z.array(lessonPlanSectionSchema).min(1).max(20),
  status: z.enum(LESSON_PLAN_STATUS).default("in_progress"),
  sourceTemplateId: z.string().trim().min(1).nullable().optional(),
  seriesId: z.string().trim().min(1).nullable().optional(),
  seriesSequence: z.number().int().positive().nullable().optional()
});

export const lessonPlanTemplateV2InputSchema = z.object({
  title: lessonPlanTitleSchema,
  description: lessonPlanDescriptionSchema,
  category: z.enum(LESSON_PLAN_TEMPLATE_CATEGORIES).default("general"),
  tags: z.string().trim().max(500).nullable().optional(),
  skillLevel: z.string().trim().max(60).nullable().optional(),
  instrument: z.string().trim().max(60).nullable().optional(),
  sections: z.array(lessonPlanSectionSchema).min(1).max(20)
});

export const lessonPlanTemplateV2StateSchema = lessonPlanTemplateV2InputSchema.extend({
  id: z.string().min(1),
  createdById: z.string().min(1),
  createdByDisplayName: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  isArchived: z.boolean()
});

export const lessonPlanV2StateSchema = z.object({
  id: z.string().min(1),
  bookingId: z.string().min(1),
  sourceTemplateId: z.string().min(1).nullable(),
  sourceTemplateTitle: z.string().min(1).nullable(),
  status: z.enum(LESSON_PLAN_STATUS),
  sections: z.array(lessonPlanSectionSchema),
  quickCaptureNotes: z.string().nullable(),
  seriesId: z.string().min(1).nullable(),
  seriesSequence: z.number().int().positive().nullable(),
  updatedAt: z.string().datetime({ offset: true })
});

export const studentPortalLessonPlanV2SectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  content: tiptapDocumentSchema
});

export const studentPortalLessonPlanV2SummarySchema = z.object({
  sections: z.array(studentPortalLessonPlanV2SectionSchema)
});

export type LessonPlanSection = z.infer<typeof lessonPlanSectionSchema>;
export type LessonPlanSectionsInput = z.infer<typeof lessonPlanSectionsInputSchema>;
export type LessonPlanTemplateV2Input = z.infer<typeof lessonPlanTemplateV2InputSchema>;
export type LessonPlanTemplateV2State = z.infer<typeof lessonPlanTemplateV2StateSchema>;
export type LessonPlanV2State = z.infer<typeof lessonPlanV2StateSchema>;
export type StudentPortalLessonPlanV2Section = z.infer<typeof studentPortalLessonPlanV2SectionSchema>;
export type StudentPortalLessonPlanV2Summary = z.infer<typeof studentPortalLessonPlanV2SummarySchema>;

/** Default sections for a new blank lesson plan. */
export const DEFAULT_LESSON_PLAN_SECTIONS: readonly LessonPlanSection[] = [
  { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", content: { type: "doc", content: [] } },
  { key: "goals", title: "Goals", visibility: "student_visible", content: { type: "doc", content: [] } },
  { key: "activities", title: "Activities", visibility: "teacher_only", content: { type: "doc", content: [] } },
  { key: "homework", title: "Homework", visibility: "student_visible", content: { type: "doc", content: [] } },
  { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", content: { type: "doc", content: [] } },
  { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", content: { type: "doc", content: [] } },
];

/**
 * Builds a fresh set of default sections (deep-cloned) for a new lesson plan.
 */
export function buildDefaultLessonPlanSections(): LessonPlanSection[] {
  return DEFAULT_LESSON_PLAN_SECTIONS.map((s) => ({
    ...s,
    content: { type: "doc" as const, content: [] }
  }));
}

/**
 * Builds an empty V2 template draft for the admin template library.
 */
export function buildEmptyLessonPlanTemplateV2Input(): LessonPlanTemplateV2Input {
  return {
    title: "",
    description: "",
    category: "general",
    tags: null,
    skillLevel: null,
    instrument: null,
    sections: buildDefaultLessonPlanSections()
  };
}
