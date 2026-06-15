import { Prisma, type AdminRole } from "@/generated/prisma/client";
import { canManageLessonPlanTemplate } from "@/lib/admin/permissions";
import { prisma } from "@/lib/db";
import { excludeArchived } from "@/lib/db/soft-delete";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  lessonPlanSectionsInputSchema,
  lessonPlanTemplateV2InputSchema,
  type LessonPlanSection,
  type LessonPlanSectionsInput,
  type LessonPlanTemplateV2Input,
  type LessonPlanTemplateV2State,
  type LessonPlanV2State
} from "@/lib/lesson-plan-contract";

type LessonPlanActor = {
  id: string;
  role: AdminRole;
};

function assertTemplateManageable(actor: LessonPlanActor, createdById: string) {
  if (!canManageLessonPlanTemplate(actor, createdById)) {
    throw new AppError("Forbidden", "FORBIDDEN", 403);
  }
}

/**
 * Archives one template so it can no longer be applied to future lessons.
 */
export async function archiveLessonPlanTemplate(actor: LessonPlanActor, templateId: string): Promise<void> {
  const existing = await prisma.lessonPlanTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      createdById: true
    }
  });
  if (!existing) {
    throw new NotFoundError("Lesson plan template", templateId);
  }
  assertTemplateManageable(actor, existing.createdById);

  await prisma.lessonPlanTemplate.update({
    where: { id: templateId },
    data: {
      isArchived: true,
      updatedById: actor.id
    }
  });
}

/**
 * Deletes the single lesson plan attached to a booking when one exists.
 */
export async function deleteBookingLessonPlan(bookingId: string): Promise<void> {
  await prisma.lessonPlan.deleteMany({
    where: {
      bookingId
    }
  });
}

// ─── Section-based TipTap lesson plans ──────────────────────────

function assertValidSections(sections: LessonPlanSection[]) {
  const keys = new Set<string>();
  for (const section of sections) {
    if (keys.has(section.key)) {
      throw new ValidationError(`Duplicate section key: "${section.key}".`, {
        fieldErrors: { sections: [`Duplicate section key: "${section.key}".`] }
      });
    }
    keys.add(section.key);
  }
}

// -- Template helpers --

async function listTemplateV2Rows(includeArchived = false) {
  return prisma.lessonPlanTemplate.findMany({
    where: includeArchived ? undefined : excludeArchived(),
    include: {
      createdBy: { select: { id: true, displayName: true } }
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });
}

type LessonPlanTemplateV2Row = Awaited<ReturnType<typeof listTemplateV2Rows>>[number];

function serializeLessonPlanTemplateV2(row: LessonPlanTemplateV2Row): LessonPlanTemplateV2State {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    category: (row.category as LessonPlanTemplateV2State["category"]) ?? "general",
    tags: row.tags ?? null,
    skillLevel: row.skillLevel ?? null,
    instrument: row.instrument ?? null,
    sections: (row.sections as LessonPlanSection[]) ?? [],
    createdById: row.createdById,
    createdByDisplayName: row.createdBy.displayName,
    updatedAt: row.updatedAt.toISOString(),
    isArchived: row.isArchived
  };
}

export async function listLessonPlanTemplatesV2(): Promise<LessonPlanTemplateV2State[]> {
  const rows = await listTemplateV2Rows(false);
  return rows.map(serializeLessonPlanTemplateV2);
}

export async function createLessonPlanTemplateV2(
  actor: LessonPlanActor,
  input: LessonPlanTemplateV2Input
): Promise<LessonPlanTemplateV2State> {
  const parsed = lessonPlanTemplateV2InputSchema.parse(input);
  assertValidSections(parsed.sections);

  const row = await prisma.lessonPlanTemplate.create({
    data: {
      title: parsed.title,
      description: parsed.description || null,
      category: parsed.category,
      tags: parsed.tags ?? null,
      skillLevel: parsed.skillLevel ?? null,
      instrument: parsed.instrument ?? null,
      sections: JSON.parse(JSON.stringify(parsed.sections)) as Prisma.InputJsonValue,
      // Legacy fields default to empty until schema columns are dropped.
      lessonFocus: "",
      goals: "",
      activities: "",
      homework: "",
      sharedNotes: "",
      privateNotes: "",
      createdById: actor.id,
      updatedById: actor.id
    },
    include: {
      createdBy: { select: { id: true, displayName: true } }
    }
  });

  return serializeLessonPlanTemplateV2(row);
}

export async function updateLessonPlanTemplateV2(
  actor: LessonPlanActor,
  templateId: string,
  input: LessonPlanTemplateV2Input
): Promise<LessonPlanTemplateV2State> {
  const parsed = lessonPlanTemplateV2InputSchema.parse(input);
  assertValidSections(parsed.sections);

  const existing = await prisma.lessonPlanTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, createdById: true }
  });
  if (!existing) {
    throw new NotFoundError("Lesson plan template", templateId);
  }
  assertTemplateManageable(actor, existing.createdById);

  const row = await prisma.lessonPlanTemplate.update({
    where: { id: templateId },
    data: {
      title: parsed.title,
      description: parsed.description || null,
      category: parsed.category,
      tags: parsed.tags ?? null,
      skillLevel: parsed.skillLevel ?? null,
      instrument: parsed.instrument ?? null,
      sections: JSON.parse(JSON.stringify(parsed.sections)) as Prisma.InputJsonValue,
      updatedById: actor.id
    },
    include: {
      createdBy: { select: { id: true, displayName: true } }
    }
  });

  return serializeLessonPlanTemplateV2(row);
}

// -- Booking lesson plan helpers --

async function getLessonPlanV2Row(bookingId: string) {
  return prisma.lessonPlan.findUnique({
    where: { bookingId },
    include: {
      sourceTemplate: { select: { title: true } }
    }
  });
}

type LessonPlanV2Row = NonNullable<Awaited<ReturnType<typeof getLessonPlanV2Row>>>;

function serializeLessonPlanV2(row: LessonPlanV2Row): LessonPlanV2State {
  return {
    id: row.id,
    bookingId: row.bookingId,
    sourceTemplateId: row.sourceTemplateId,
    sourceTemplateTitle: row.sourceTemplate?.title ?? null,
    status: row.status,
    sections: (row.sections as LessonPlanSection[]) ?? [],
    quickCaptureNotes: row.quickCaptureNotes,
    seriesId: row.seriesId,
    seriesSequence: row.seriesSequence,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function getBookingLessonPlanV2State(bookingId: string): Promise<LessonPlanV2State | null> {
  const row = await getLessonPlanV2Row(bookingId);
  return row ? serializeLessonPlanV2(row) : null;
}

export async function upsertBookingLessonPlanV2(
  actor: LessonPlanActor,
  bookingId: string,
  input: LessonPlanSectionsInput
): Promise<LessonPlanV2State> {
  const parsed = lessonPlanSectionsInputSchema.parse(input);
  assertValidSections(parsed.sections);

  if (parsed.sourceTemplateId) {
    const template = await prisma.lessonPlanTemplate.findUnique({
      where: { id: parsed.sourceTemplateId },
      select: { id: true }
    });
    if (!template) {
      throw new ValidationError("Selected lesson-plan template was not found.", {
        fieldErrors: { sourceTemplateId: ["Selected lesson-plan template was not found."] }
      });
    }
  }

  const row = await prisma.lessonPlan.upsert({
    where: { bookingId },
    create: {
      bookingId,
      sourceTemplateId: parsed.sourceTemplateId ?? null,
      status: parsed.status,
      sections: JSON.parse(JSON.stringify(parsed.sections)) as Prisma.InputJsonValue,
      seriesId: parsed.seriesId ?? null,
      seriesSequence: parsed.seriesSequence ?? null,
      // Legacy fields default to empty until schema columns are dropped.
      lessonFocus: "",
      goals: "",
      activities: "",
      homework: "",
      sharedNotes: "",
      privateNotes: "",
      createdById: actor.id,
      updatedById: actor.id
    },
    update: {
      sourceTemplateId: parsed.sourceTemplateId ?? null,
      status: parsed.status,
      sections: JSON.parse(JSON.stringify(parsed.sections)) as Prisma.InputJsonValue,
      seriesId: parsed.seriesId ?? null,
      seriesSequence: parsed.seriesSequence ?? null,
      updatedById: actor.id
    },
    include: {
      sourceTemplate: { select: { title: true } }
    }
  });

  return serializeLessonPlanV2(row);
}

/**
 * Saves or updates quick-capture notes for a booking's lesson plan.
 * Creates a draft lesson plan if none exists.
 */
export async function upsertQuickCaptureNotes(
  actor: LessonPlanActor,
  bookingId: string,
  notes: string
): Promise<LessonPlanV2State> {
  const row = await prisma.lessonPlan.upsert({
    where: { bookingId },
    create: {
      bookingId,
      status: "draft",
      quickCaptureNotes: notes,
      sections: Prisma.DbNull,
      lessonFocus: "",
      goals: "",
      activities: "",
      homework: "",
      sharedNotes: "",
      privateNotes: "",
      createdById: actor.id,
      updatedById: actor.id
    },
    update: {
      quickCaptureNotes: notes,
      updatedById: actor.id
    },
    include: {
      sourceTemplate: { select: { title: true } }
    }
  });

  return serializeLessonPlanV2(row);
}

/**
 * Returns lesson plan continuity data: the last N plans for the same customer.
 */
export async function getLessonPlanContinuity(
  bookingId: string,
  limit = 5
): Promise<LessonPlanV2State[]> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { customerId: true, startAt: true }
  });
  if (!booking?.customerId) return [];

  const rows = await prisma.lessonPlan.findMany({
    where: {
      booking: {
        customerId: booking.customerId,
        id: { not: bookingId },
        startAt: { lt: booking.startAt }
      }
    },
    include: {
      sourceTemplate: { select: { title: true } }
    },
    orderBy: { booking: { startAt: "desc" } },
    take: limit
  });

  return rows.map(serializeLessonPlanV2);
}
