import { Prisma, type AdminRole } from "@/generated/prisma/client";
import { canManageLessonPlanTemplate } from "@/lib/admin/permissions";
import { prisma } from "@/lib/db";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertValidLessonPlanMaterialLinks, getLessonPlanLinkableFieldTexts, sortLessonPlanMaterialLinks } from "@/lib/lesson-plan-material-links";
import {
  bookingLessonPlanInputSchema,
  lessonPlanTemplateInputSchema,
  lessonPlanSectionsInputSchema,
  lessonPlanTemplateV2InputSchema,
  type BookingLessonPlanInput,
  type LessonPlanMaterialLinkInput,
  type LessonPlanSection,
  type LessonPlanSectionsInput,
  type LessonPlanState,
  type LessonPlanTemplateInput,
  type LessonPlanTemplateState,
  type LessonPlanTemplateV2Input,
  type LessonPlanTemplateV2State,
  type LessonPlanV2State
} from "@/lib/lesson-plan-contract";

type LessonPlanActor = {
  id: string;
  role: AdminRole;
};

async function listTemplateRows(includeArchived = false) {
  return prisma.lessonPlanTemplate.findMany({
    where: includeArchived ? undefined : { isArchived: false },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });
}

type LessonPlanTemplateRow = Awaited<ReturnType<typeof listTemplateRows>>[number];

async function getLessonPlanRow(bookingId: string) {
  return prisma.lessonPlan.findUnique({
    where: { bookingId },
    include: {
      sourceTemplate: {
        select: {
          title: true
        }
      },
      materialLinks: {
        orderBy: [
          { fieldKey: "asc" },
          { startOffset: "asc" },
          { endOffset: "asc" }
        ]
      }
    }
  });
}

type LessonPlanRow = NonNullable<Awaited<ReturnType<typeof getLessonPlanRow>>>;

function serializeLessonPlanTemplate(row: LessonPlanTemplateRow): LessonPlanTemplateState {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    lessonFocus: row.lessonFocus,
    goals: row.goals,
    activities: row.activities,
    homework: row.homework,
    sharedNotes: row.sharedNotes,
    privateNotes: row.privateNotes,
    createdById: row.createdById,
    createdByDisplayName: row.createdBy.displayName,
    updatedAt: row.updatedAt.toISOString(),
    isArchived: row.isArchived
  };
}

function serializeLessonPlan(row: LessonPlanRow): LessonPlanState {
  return {
    id: row.id,
    bookingId: row.bookingId,
    sourceTemplateId: row.sourceTemplateId,
    sourceTemplateTitle: row.sourceTemplate?.title ?? null,
    lessonFocus: row.lessonFocus,
    goals: row.goals,
    activities: row.activities,
    homework: row.homework,
    sharedNotes: row.sharedNotes,
    privateNotes: row.privateNotes,
    materialLinks: sortLessonPlanMaterialLinks(row.materialLinks).map((link) => ({
      fieldKey: link.fieldKey,
      materialId: link.materialId,
      startOffset: link.startOffset,
      endOffset: link.endOffset,
      linkedText: link.linkedText
    })),
    updatedAt: row.updatedAt.toISOString()
  };
}

function assertTemplateManageable(actor: LessonPlanActor, createdById: string) {
  if (!canManageLessonPlanTemplate(actor, createdById)) {
    throw new AppError("Forbidden", "FORBIDDEN", 403);
  }
}

/**
 * Returns the active lesson-plan template library visible to staff.
 */
export async function listLessonPlanTemplates(): Promise<LessonPlanTemplateState[]> {
  const rows = await listTemplateRows(false);
  return rows.map(serializeLessonPlanTemplate);
}

/**
 * Creates one lesson-plan template owned by the current admin.
 */
export async function createLessonPlanTemplate(
  actor: LessonPlanActor,
  input: LessonPlanTemplateInput
): Promise<LessonPlanTemplateState> {
  const parsed = lessonPlanTemplateInputSchema.parse(input);
  const row = await prisma.lessonPlanTemplate.create({
    data: {
      ...parsed,
      description: parsed.description || null,
      createdById: actor.id,
      updatedById: actor.id
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true
        }
      }
    }
  });

  return serializeLessonPlanTemplate(row);
}

/**
 * Updates one existing lesson-plan template when the actor owns it or is the owner.
 */
export async function updateLessonPlanTemplate(
  actor: LessonPlanActor,
  templateId: string,
  input: LessonPlanTemplateInput
): Promise<LessonPlanTemplateState> {
  const parsed = lessonPlanTemplateInputSchema.parse(input);
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

  const row = await prisma.lessonPlanTemplate.update({
    where: { id: templateId },
    data: {
      ...parsed,
      description: parsed.description || null,
      updatedById: actor.id
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true
        }
      }
    }
  });

  return serializeLessonPlanTemplate(row);
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
 * Returns the saved lesson plan for one booking, if it exists.
 */
export async function getBookingLessonPlanState(bookingId: string): Promise<LessonPlanState | null> {
  const row = await getLessonPlanRow(bookingId);
  return row ? serializeLessonPlan(row) : null;
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

/**
 * Creates or updates the single lesson plan attached to a booking.
 */
export async function upsertBookingLessonPlan(
  actor: LessonPlanActor,
  bookingId: string,
  input: BookingLessonPlanInput
): Promise<LessonPlanState> {
  const parsed = bookingLessonPlanInputSchema.parse(input);
  assertValidLessonPlanMaterialLinks(
    getLessonPlanLinkableFieldTexts(parsed),
    parsed.materialLinks
  );

  if (parsed.sourceTemplateId) {
    const template = await prisma.lessonPlanTemplate.findUnique({
      where: {
        id: parsed.sourceTemplateId
      },
      select: {
        id: true
      }
    });
    if (!template) {
      throw new ValidationError("Selected lesson-plan template was not found.", {
        fieldErrors: {
          sourceTemplateId: ["Selected lesson-plan template was not found."]
        }
      });
    }
  }

  const uniqueMaterialIds = [...new Set(parsed.materialLinks.map((link) => link.materialId))];
  if (uniqueMaterialIds.length > 0) {
    const materials = await prisma.learningMaterial.findMany({
      where: {
        id: {
          in: uniqueMaterialIds
        },
        bookingId
      },
      select: {
        id: true
      }
    });
    if (materials.length !== uniqueMaterialIds.length) {
      throw new ValidationError("Selected learning material must belong to this booking.", {
        fieldErrors: {
          materialLinks: ["Selected learning material must belong to this booking."]
        }
      });
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    const savedLessonPlan = await tx.lessonPlan.upsert({
      where: { bookingId },
      create: {
        bookingId,
        sourceTemplateId: parsed.sourceTemplateId ?? null,
        lessonFocus: parsed.lessonFocus,
        goals: parsed.goals,
        activities: parsed.activities,
        homework: parsed.homework,
        sharedNotes: parsed.sharedNotes,
        privateNotes: parsed.privateNotes,
        createdById: actor.id,
        updatedById: actor.id
      },
      update: {
        sourceTemplateId: parsed.sourceTemplateId ?? null,
        lessonFocus: parsed.lessonFocus,
        goals: parsed.goals,
        activities: parsed.activities,
        homework: parsed.homework,
        sharedNotes: parsed.sharedNotes,
        privateNotes: parsed.privateNotes,
        updatedById: actor.id
      },
      select: {
        id: true
      }
    });

    await tx.lessonPlanMaterialLink.deleteMany({
      where: {
        lessonPlanId: savedLessonPlan.id
      }
    });

    if (parsed.materialLinks.length > 0) {
      await tx.lessonPlanMaterialLink.createMany({
        data: buildLessonPlanMaterialLinkRows(savedLessonPlan.id, parsed.materialLinks)
      });
    }

    const hydrated = await tx.lessonPlan.findUnique({
      where: {
        id: savedLessonPlan.id
      },
      include: {
        sourceTemplate: {
          select: {
            title: true
          }
        },
        materialLinks: {
          orderBy: [
            { fieldKey: "asc" },
            { startOffset: "asc" },
            { endOffset: "asc" }
          ]
        }
      }
    });

    if (!hydrated) {
      throw new NotFoundError("Lesson plan", savedLessonPlan.id);
    }

    return hydrated;
  });

  return serializeLessonPlan(row);
}

function buildLessonPlanMaterialLinkRows(lessonPlanId: string, links: ReadonlyArray<LessonPlanMaterialLinkInput>) {
  return sortLessonPlanMaterialLinks(links).map((link) => ({
    lessonPlanId,
    materialId: link.materialId,
    fieldKey: link.fieldKey,
    startOffset: link.startOffset,
    endOffset: link.endOffset,
    linkedText: link.linkedText
  }));
}

// ─── V2: Section-based TipTap lesson plans ──────────────────────────

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

// -- V2 template helpers --

async function listTemplateV2Rows(includeArchived = false) {
  return prisma.lessonPlanTemplate.findMany({
    where: includeArchived ? undefined : { isArchived: false },
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
      // Legacy fields default to empty for V2-created templates.
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

// -- V2 booking lesson plan helpers --

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
      // Legacy fields default to empty for V2-created plans.
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
