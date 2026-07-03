import { prisma } from "@/lib/db";
import {
  buildDefaultLessonPricingSettingsState,
  lessonPricingSettingsInputSchema,
  type LessonPricingOptionState,
  type LessonPricingSettingsInput,
  type LessonPricingSettingsState
} from "@/lib/lesson-pricing-contract";

type LessonPricingRecord = Awaited<ReturnType<typeof prisma.lessonPricingOption.findMany>>;

function serializeLessonPricingOptions(rows: LessonPricingRecord): LessonPricingOptionState[] {
  return rows.map((row) => ({
    id: row.id,
    durationMinutes: row.durationMinutes,
    priceCents: row.priceCents,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString()
  }));
}

export async function getLessonPricingOptions(includeInactive = true) {
  return prisma.lessonPricingOption.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { durationMinutes: "asc" }]
  });
}

export async function getLessonPricingSettingsState(): Promise<LessonPricingSettingsState> {
  const rows = await getLessonPricingOptions(true);
  if (rows.length === 0) {
    return buildDefaultLessonPricingSettingsState();
  }

  return {
    lessonPricingOptions: serializeLessonPricingOptions(rows),
    updatedAt: rows.reduce<string | null>((latest, row) => {
      const iso = row.updatedAt.toISOString();
      return latest && latest > iso ? latest : iso;
    }, null)
  };
}

export async function saveLessonPricingSettings(input: LessonPricingSettingsInput) {
  const parsed = lessonPricingSettingsInputSchema.parse(input);
  const rows = parsed.lessonPricingOptions.map((row, index) => ({
    durationMinutes: row.durationMinutes,
    priceCents: row.priceCents,
    isActive: row.isActive,
    sortOrder: index
  }));

  await prisma.$transaction(async (tx) => {
    await tx.lessonPricingOption.deleteMany();
    await tx.lessonPricingOption.createMany({
      data: rows
    });
  });

  return getLessonPricingSettingsState();
}

export async function getActiveLessonPricingMap(): Promise<Map<number, LessonPricingOptionState>> {
  const rows = await getLessonPricingOptions(false);
  return new Map(
    serializeLessonPricingOptions(rows).map((row) => [row.durationMinutes, row])
  );
}
