import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";

/**
 * Toggles a homework checklist item completion for a student.
 * If the item is already completed, it gets uncompleted (deleted).
 * If not completed, a new completion row is created.
 *
 * Returns the new completion state (true = completed, false = uncompleted).
 */
export async function toggleHomeworkCompletion(
  customerId: string,
  lessonPlanId: string,
  checklistItemId: string
): Promise<{ completed: boolean; completedAt: string | null }> {
  // Verify the lesson plan exists and belongs to a booking for this customer.
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: lessonPlanId },
    select: {
      id: true,
      booking: {
        select: { customerId: true, startAt: true }
      }
    }
  });

  if (!plan) {
    throw new NotFoundError("Lesson plan", lessonPlanId);
  }

  if (plan.booking.customerId !== customerId) {
    throw new AppError("Forbidden", "FORBIDDEN", 403);
  }

  // Only allow homework completion on past lessons.
  if (plan.booking.startAt > new Date()) {
    throw new AppError(
      "Homework can only be marked after the lesson has occurred.",
      "VALIDATION_ERROR",
      400
    );
  }

  // Check if already completed.
  const existing = await prisma.homeworkCompletion.findUnique({
    where: {
      lessonPlanId_checklistItemId: {
        lessonPlanId,
        checklistItemId
      }
    }
  });

  if (existing) {
    // Uncomplete: delete the row.
    await prisma.homeworkCompletion.delete({
      where: { id: existing.id }
    });
    return { completed: false, completedAt: null };
  }

  // Complete: create a new row.
  const completion = await prisma.homeworkCompletion.create({
    data: {
      lessonPlanId,
      checklistItemId,
      customerId
    }
  });

  return {
    completed: true,
    completedAt: completion.completedAt.toISOString()
  };
}

/**
 * Returns all homework completions for a lesson plan.
 */
export async function getHomeworkCompletions(
  lessonPlanId: string
): Promise<HomeworkCompletionState[]> {
  const rows = await prisma.homeworkCompletion.findMany({
    where: { lessonPlanId },
    orderBy: { completedAt: "asc" }
  });

  return rows.map((row) => ({
    checklistItemId: row.checklistItemId,
    completedAt: row.completedAt.toISOString(),
    note: row.note
  }));
}

/**
 * Returns homework completions for multiple lesson plans at once.
 * Used by the continuity sidebar to show completion status across
 * a student's recent lessons.
 */
export async function getHomeworkCompletionsForPlans(
  lessonPlanIds: string[]
): Promise<Map<string, HomeworkCompletionState[]>> {
  if (lessonPlanIds.length === 0) return new Map();

  const rows = await prisma.homeworkCompletion.findMany({
    where: {
      lessonPlanId: { in: lessonPlanIds }
    },
    orderBy: { completedAt: "asc" }
  });

  const map = new Map<string, HomeworkCompletionState[]>();
  for (const row of rows) {
    const existing = map.get(row.lessonPlanId) ?? [];
    existing.push({
      checklistItemId: row.checklistItemId,
      completedAt: row.completedAt.toISOString(),
      note: row.note
    });
    map.set(row.lessonPlanId, existing);
  }

  return map;
}

export interface HomeworkCompletionState {
  checklistItemId: string;
  completedAt: string;
  note: string | null;
}
