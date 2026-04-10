import type {
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

type DbClient = Prisma.TransactionClient | PrismaClient;
export type StorageCleanupScope = "booking_note_image" | "booking_request_note_image";

export type StorageCleanupTaskInput = {
  storageKey: string;
  scope: StorageCleanupScope;
  entityId: string;
};

export type StorageCleanupResult = {
  processedCount: number;
  succeededCount: number;
  failedCount: number;
};

const INITIAL_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

function uniqueCleanupTasks(tasks: Iterable<StorageCleanupTaskInput>): StorageCleanupTaskInput[] {
  const byStorageKey = new Map<string, StorageCleanupTaskInput>();

  for (const task of tasks) {
    if (!task.storageKey) {
      continue;
    }
    byStorageKey.set(task.storageKey, task);
  }

  return Array.from(byStorageKey.values());
}

function nextRetryAt(attemptCount: number): Date {
  const retryCount = Math.max(1, attemptCount);
  const delayMs = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** (retryCount - 1), MAX_RETRY_DELAY_MS);
  return new Date(Date.now() + delayMs);
}

export async function enqueueStorageCleanupTasks(input: {
  db: DbClient;
  tasks: Iterable<StorageCleanupTaskInput>;
}): Promise<string[]> {
  const tasks = uniqueCleanupTasks(input.tasks);
  if (tasks.length === 0) {
    return [];
  }

  const now = new Date();
  const ids: string[] = [];
  const db = input.db;

  for (const task of tasks) {
    const queued = await db.storageCleanupTask.upsert({
      where: { storageKey: task.storageKey },
      update: {
        scope: task.scope,
        entityId: task.entityId,
        nextAttemptAt: now,
        lastError: null,
      },
      create: {
        storageKey: task.storageKey,
        scope: task.scope,
        entityId: task.entityId,
        nextAttemptAt: now,
      },
      select: { id: true },
    });
    ids.push(queued.id);
  }

  return ids;
}

export async function processStorageCleanupTasks(input: {
  db: PrismaClient;
  maxTasks?: number;
  taskIds?: string[];
}): Promise<StorageCleanupResult> {
  const now = new Date();
  const maxTasks = input.maxTasks ?? 25;
  const driver = createMaterialStorageDriver();
  const db = input.db;

  const tasks = await db.storageCleanupTask.findMany({
    where: input.taskIds?.length
      ? {
          id: { in: input.taskIds },
        }
      : {
          nextAttemptAt: { lte: now },
        },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: maxTasks,
  });

  let succeededCount = 0;
  let failedCount = 0;

  for (const task of tasks) {
    try {
      await driver.delete({ storageKey: task.storageKey });
      await db.storageCleanupTask.delete({
        where: { id: task.id },
      });
      succeededCount += 1;
    } catch (error) {
      failedCount += 1;
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown storage cleanup error.";

      await db.storageCleanupTask.update({
        where: { id: task.id },
        data: {
          attemptCount: { increment: 1 },
          lastError: message,
          nextAttemptAt: nextRetryAt(task.attemptCount + 1),
        },
      });
    }
  }

  return {
    processedCount: tasks.length,
    succeededCount,
    failedCount,
  };
}
