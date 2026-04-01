/**
 * Zod validation schemas for chord diagrams, following the pattern
 * established by lesson-plan-contract.ts.
 */

import { z } from "zod";

const stringFretTuple = z.tuple([
  z.number().int().min(-1).max(24),
  z.number().int().min(-1).max(24),
  z.number().int().min(-1).max(24),
  z.number().int().min(-1).max(24),
  z.number().int().min(-1).max(24),
  z.number().int().min(-1).max(24),
]);

const fingerTuple = z.tuple([
  z.number().int().min(0).max(4),
  z.number().int().min(0).max(4),
  z.number().int().min(0).max(4),
  z.number().int().min(0).max(4),
  z.number().int().min(0).max(4),
  z.number().int().min(0).max(4),
]);

const stringNameTuple = z.tuple([
  z.string().min(1).max(3),
  z.string().min(1).max(3),
  z.string().min(1).max(3),
  z.string().min(1).max(3),
  z.string().min(1).max(3),
  z.string().min(1).max(3),
]);

export const barreIndicatorSchema = z.object({
  fret: z.number().int().min(1).max(24),
  fromString: z.number().int().min(0).max(5),
  toString: z.number().int().min(0).max(5),
});

export const chordFingeringSchema = z.object({
  strings: stringFretTuple,
  fingers: fingerTuple,
  barres: z.array(barreIndicatorSchema),
  startFret: z.number().int().min(1).max(24),
  fretCount: z.number().int().min(3).max(7).default(5),
});

export const chordNameSchema = z.object({
  root: z.string().min(1).max(3),
  quality: z.string().max(20),
  bassNote: z.string().max(3).optional(),
  displayName: z.string().max(30).optional(),
});

export const chordDiagramDataSchema = z.object({
  name: chordNameSchema,
  fingering: chordFingeringSchema,
  tuning: stringNameTuple,
  isLeftHanded: z.boolean().default(false),
});

export const createChordInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  root: z.string().trim().min(1).max(3),
  quality: z.string().trim().max(20),
  diagram: chordDiagramDataSchema,
});

export const updateChordInputSchema = createChordInputSchema.partial();

export const createChordChartInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  items: z.array(
    z.object({
      chordId: z.string().min(1),
      sortOrder: z.number().int().min(0),
      annotation: z.string().trim().max(100).optional(),
    })
  ),
});

export const updateChordChartInputSchema = createChordChartInputSchema.partial();

export type CreateChordInput = z.infer<typeof createChordInputSchema>;
export type UpdateChordInput = z.infer<typeof updateChordInputSchema>;
export type CreateChordChartInput = z.infer<typeof createChordChartInputSchema>;
export type UpdateChordChartInput = z.infer<typeof updateChordChartInputSchema>;
export type ChordDiagramDataInput = z.infer<typeof chordDiagramDataSchema>;
