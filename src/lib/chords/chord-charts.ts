/**
 * Chord chart CRUD service functions.
 */

import { prisma } from "@/lib/db";
import type { CreateChordChartInput, UpdateChordChartInput } from "./chord-contract";

export async function listChordCharts(opts?: { includeArchived?: boolean }) {
  return prisma.chordChart.findMany({
    where: opts?.includeArchived ? {} : { isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: { chord: true },
      },
    },
  });
}

export async function getChordChart(id: string) {
  return prisma.chordChart.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: { chord: true },
      },
    },
  });
}

export async function createChordChart(input: CreateChordChartInput, createdById: string) {
  return prisma.chordChart.create({
    data: {
      title: input.title,
      description: input.description,
      createdById,
      items: {
        create: input.items.map((item) => ({
          chordId: item.chordId,
          sortOrder: item.sortOrder,
          annotation: item.annotation,
        })),
      },
    },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { chord: true } },
    },
  });
}

export async function updateChordChart(id: string, input: UpdateChordChartInput) {
  return prisma.$transaction(async (tx) => {
    if (input.title !== undefined || input.description !== undefined) {
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      await tx.chordChart.update({ where: { id }, data });
    }

    if (input.items !== undefined) {
      await tx.chordChartItem.deleteMany({ where: { chartId: id } });
      if (input.items.length > 0) {
        await tx.chordChartItem.createMany({
          data: input.items.map((item) => ({
            chartId: id,
            chordId: item.chordId,
            sortOrder: item.sortOrder,
            annotation: item.annotation,
          })),
        });
      }
    }

    return tx.chordChart.findUniqueOrThrow({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: "asc" }, include: { chord: true } },
      },
    });
  });
}

export async function archiveChordChart(id: string) {
  return prisma.chordChart.update({ where: { id }, data: { isArchived: true } });
}
