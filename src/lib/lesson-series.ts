import { z } from "zod";
import type { AdminRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

type LessonSeriesActor = { id: string; role: AdminRole };

// ─── Schemas ────────────────────────────────────────────────

export const lessonSeriesInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  customerId: z.string().trim().min(1).nullable().optional(),
  teacherId: z.string().trim().min(1).nullable().optional(),
  totalLessons: z.number().int().positive().max(100),
  sourceTemplateId: z.string().trim().min(1).nullable().optional(),
});

export const lessonSeriesUpdateSchema = lessonSeriesInputSchema.partial().extend({
  status: z.enum(["active", "completed", "archived"]).optional(),
});

export type LessonSeriesInput = z.infer<typeof lessonSeriesInputSchema>;
export type LessonSeriesUpdate = z.infer<typeof lessonSeriesUpdateSchema>;

export interface LessonSeriesState {
  id: string;
  title: string;
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  totalLessons: number;
  completedLessons: number;
  status: string;
  sourceTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Service functions ──────────────────────────────────────

export async function listLessonSeries(filters?: {
  customerId?: string;
  teacherId?: string;
  status?: string;
}): Promise<LessonSeriesState[]> {
  const rows = await prisma.lessonSeries.findMany({
    where: {
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.teacherId ? { teacherId: filters.teacherId } : {}),
      ...(filters?.status ? { status: filters.status as "active" | "completed" | "archived" } : {}),
    },
    include: {
      customer: { select: { fullName: true } },
      teacher: { select: { displayName: true } },
      _count: { select: { lessonPlans: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    customerId: row.customerId,
    customerName: row.customer?.fullName ?? null,
    teacherId: row.teacherId,
    teacherName: row.teacher?.displayName ?? null,
    totalLessons: row.totalLessons,
    completedLessons: row._count.lessonPlans,
    status: row.status,
    sourceTemplateId: row.sourceTemplateId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createLessonSeries(
  _actor: LessonSeriesActor,
  input: LessonSeriesInput
): Promise<LessonSeriesState> {
  const parsed = lessonSeriesInputSchema.parse(input);

  const row = await prisma.lessonSeries.create({
    data: {
      title: parsed.title,
      description: parsed.description ?? null,
      customerId: parsed.customerId ?? null,
      teacherId: parsed.teacherId ?? null,
      totalLessons: parsed.totalLessons,
      sourceTemplateId: parsed.sourceTemplateId ?? null,
    },
    include: {
      customer: { select: { fullName: true } },
      teacher: { select: { displayName: true } },
      _count: { select: { lessonPlans: true } },
    },
  });

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    customerId: row.customerId,
    customerName: row.customer?.fullName ?? null,
    teacherId: row.teacherId,
    teacherName: row.teacher?.displayName ?? null,
    totalLessons: row.totalLessons,
    completedLessons: row._count.lessonPlans,
    status: row.status,
    sourceTemplateId: row.sourceTemplateId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateLessonSeries(
  _actor: LessonSeriesActor,
  seriesId: string,
  input: LessonSeriesUpdate
): Promise<LessonSeriesState> {
  const parsed = lessonSeriesUpdateSchema.parse(input);

  const existing = await prisma.lessonSeries.findUnique({
    where: { id: seriesId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Lesson series", seriesId);
  }

  const row = await prisma.lessonSeries.update({
    where: { id: seriesId },
    data: {
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description ?? null } : {}),
      ...(parsed.customerId !== undefined ? { customerId: parsed.customerId ?? null } : {}),
      ...(parsed.teacherId !== undefined ? { teacherId: parsed.teacherId ?? null } : {}),
      ...(parsed.totalLessons !== undefined ? { totalLessons: parsed.totalLessons } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    },
    include: {
      customer: { select: { fullName: true } },
      teacher: { select: { displayName: true } },
      _count: { select: { lessonPlans: true } },
    },
  });

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    customerId: row.customerId,
    customerName: row.customer?.fullName ?? null,
    teacherId: row.teacherId,
    teacherName: row.teacher?.displayName ?? null,
    totalLessons: row.totalLessons,
    completedLessons: row._count.lessonPlans,
    status: row.status,
    sourceTemplateId: row.sourceTemplateId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function archiveLessonSeries(seriesId: string): Promise<void> {
  await prisma.lessonSeries.update({
    where: { id: seriesId },
    data: { status: "archived" },
  });
}
