/**
 * Chord CRUD service functions for the chord library.
 */

import { prisma } from "@/lib/db";
import type { CreateChordInput, UpdateChordInput } from "./chord-contract";

export async function listChords(opts?: { includeArchived?: boolean }) {
  return prisma.chord.findMany({
    where: opts?.includeArchived ? {} : { isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export async function getChord(id: string) {
  return prisma.chord.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export async function createChord(input: CreateChordInput, createdById: string) {
  return prisma.chord.create({
    data: {
      name: input.name,
      root: input.root,
      quality: input.quality,
      diagram: input.diagram as object,
      createdById,
    },
  });
}

export async function updateChord(id: string, input: UpdateChordInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.root !== undefined) data.root = input.root;
  if (input.quality !== undefined) data.quality = input.quality;
  if (input.diagram !== undefined) data.diagram = input.diagram as object;
  return prisma.chord.update({ where: { id }, data });
}

export async function archiveChord(id: string) {
  return prisma.chord.update({ where: { id }, data: { isArchived: true } });
}
