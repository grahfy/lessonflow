import type { AdminRole } from "@/generated/prisma/client";
import { canManageLessonPlanTemplate } from "@/lib/admin/permissions";
import { prisma } from "@/lib/db";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  bookingLessonPlanInputSchema,
  lessonPlanTemplateInputSchema,
  type BookingLessonPlanInput,
  type LessonPlanState,
  type LessonPlanTemplateInput,
  type LessonPlanTemplateState
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
 * Creates or updates the single lesson plan attached to a booking.
 */
export async function upsertBookingLessonPlan(
  actor: LessonPlanActor,
  bookingId: string,
  input: BookingLessonPlanInput
): Promise<LessonPlanState> {
  const parsed = bookingLessonPlanInputSchema.parse(input);

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

  const row = await prisma.lessonPlan.upsert({
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
    include: {
      sourceTemplate: {
        select: {
          title: true
        }
      }
    }
  });

  return serializeLessonPlan(row);
}
