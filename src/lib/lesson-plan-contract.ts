import { z } from "zod";

const LESSON_PLAN_TEXT_MAX = 4_000;

const lessonPlanTextSchema = z.string().trim().max(LESSON_PLAN_TEXT_MAX).default("");
const lessonPlanTitleSchema = z.string().trim().min(1).max(120);
const lessonPlanDescriptionSchema = z.string().trim().max(600).default("");

export const lessonPlanFieldValuesSchema = z.object({
  lessonFocus: lessonPlanTextSchema,
  goals: lessonPlanTextSchema,
  activities: lessonPlanTextSchema,
  homework: lessonPlanTextSchema,
  sharedNotes: lessonPlanTextSchema,
  privateNotes: lessonPlanTextSchema
});

export const lessonPlanTemplateInputSchema = lessonPlanFieldValuesSchema.extend({
  title: lessonPlanTitleSchema,
  description: lessonPlanDescriptionSchema
});

export const lessonPlanTemplateStateSchema = lessonPlanTemplateInputSchema.extend({
  id: z.string().min(1),
  createdById: z.string().min(1),
  createdByDisplayName: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  isArchived: z.boolean()
});

export const bookingLessonPlanInputSchema = lessonPlanFieldValuesSchema.extend({
  sourceTemplateId: z.string().trim().min(1).nullable().optional()
});

export const lessonPlanStateSchema = bookingLessonPlanInputSchema.extend({
  id: z.string().min(1),
  bookingId: z.string().min(1),
  sourceTemplateTitle: z.string().min(1).nullable(),
  updatedAt: z.string().datetime({ offset: true })
});

export const studentPortalLessonPlanSummarySchema = z.object({
  lessonFocus: z.string(),
  goals: z.string(),
  homework: z.string(),
  sharedNotes: z.string()
});

export type LessonPlanFieldValues = z.infer<typeof lessonPlanFieldValuesSchema>;
export type LessonPlanTemplateInput = z.infer<typeof lessonPlanTemplateInputSchema>;
export type LessonPlanTemplateState = z.infer<typeof lessonPlanTemplateStateSchema>;
export type BookingLessonPlanInput = z.infer<typeof bookingLessonPlanInputSchema>;
export type LessonPlanState = z.infer<typeof lessonPlanStateSchema>;
export type StudentPortalLessonPlanSummary = z.infer<typeof studentPortalLessonPlanSummarySchema>;

/**
 * Builds an empty lesson-plan field set for scratch plans and UI initialization.
 */
export function buildEmptyLessonPlanFieldValues(): LessonPlanFieldValues {
  return {
    lessonFocus: "",
    goals: "",
    activities: "",
    homework: "",
    sharedNotes: "",
    privateNotes: ""
  };
}

/**
 * Builds a blank lesson-plan template draft for the admin template library.
 */
export function buildEmptyLessonPlanTemplateInput(): LessonPlanTemplateInput {
  return {
    title: "",
    description: "",
    ...buildEmptyLessonPlanFieldValues()
  };
}
