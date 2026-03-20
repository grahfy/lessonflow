import { z } from "zod";

const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 300;

export const lessonPricingOptionInputSchema = z.object({
  durationMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES),
  priceCents: z.number().int().min(0).max(50_000_000),
  isActive: z.boolean().default(true)
});

export const lessonPricingSettingsInputSchema = z
  .object({
    lessonPricingOptions: z.array(lessonPricingOptionInputSchema).min(1).max(50)
  })
  .superRefine((data, ctx) => {
    const seen = new Set<number>();

    for (const [index, row] of data.lessonPricingOptions.entries()) {
      if (seen.has(row.durationMinutes)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lessonPricingOptions", index, "durationMinutes"],
          message: "Each lesson duration can only appear once."
        });
      }
      seen.add(row.durationMinutes);
    }
  });

export const lessonPricingOptionStateSchema = z.object({
  id: z.string().min(1),
  durationMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES),
  priceCents: z.number().int().min(0),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
  updatedAt: z.string().datetime({ offset: true }).nullable()
});

export const lessonPricingSettingsStateSchema = z.object({
  lessonPricingOptions: z.array(lessonPricingOptionStateSchema),
  updatedAt: z.string().datetime({ offset: true }).nullable()
});

export type LessonPricingOptionInput = z.infer<typeof lessonPricingOptionInputSchema>;
export type LessonPricingSettingsInput = z.infer<typeof lessonPricingSettingsInputSchema>;
export type LessonPricingOptionState = z.infer<typeof lessonPricingOptionStateSchema>;
export type LessonPricingSettingsState = z.infer<typeof lessonPricingSettingsStateSchema>;

export function buildDefaultLessonPricingSettingsState(): LessonPricingSettingsState {
  return {
    lessonPricingOptions: [],
    updatedAt: null
  };
}
