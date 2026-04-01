import { prisma } from "@/lib/db";

import type { ChordDiagramData } from "./chord-types";
import { STANDARD_TUNING } from "./chord-types";
import { listImportableChordVoicings } from "./chord-lookup";
import { formatChordName } from "./music-theory";

export interface ImportableChordLibraryEntry {
  name: string;
  root: string;
  quality: string;
  diagram: ChordDiagramData;
  fingerprint: string;
}

export interface SeedChordLibraryResult {
  ownerId: string;
  totalImportable: number;
  created: number;
  skippedExisting: number;
}

function normalizeBarres(diagram: ChordDiagramData) {
  return [...diagram.fingering.barres]
    .map((barre) => ({
      fret: barre.fret,
      fromString: Math.min(barre.fromString, barre.toString),
      toString: Math.max(barre.fromString, barre.toString),
    }))
    .sort((left, right) =>
      left.fret - right.fret
      || left.fromString - right.fromString
      || left.toString - right.toString
    );
}

/**
 * Builds a deterministic fingerprint for a diagram so imports can be safely
 * rerun without creating duplicate library rows for the same voicing.
 */
export function createChordDiagramFingerprint(diagram: ChordDiagramData): string {
  return JSON.stringify({
    fingering: {
      strings: [...diagram.fingering.strings],
      fingers: [...diagram.fingering.fingers],
      barres: normalizeBarres(diagram),
      startFret: diagram.fingering.startFret,
      fretCount: diagram.fingering.fretCount,
    },
    tuning: [...diagram.tuning],
    isLeftHanded: diagram.isLeftHanded,
  });
}

/**
 * Returns the chord-library records that can be imported from the bundled
 * chords dataset.
 */
export function listImportableChordLibraryEntries(): ImportableChordLibraryEntry[] {
  return listImportableChordVoicings().map(({ root, quality, fingering }) => {
    const diagram: ChordDiagramData = {
      name: { root, quality },
      fingering,
      tuning: [...STANDARD_TUNING],
      isLeftHanded: false,
    };

    return {
      name: formatChordName(diagram.name),
      root,
      quality,
      diagram,
      fingerprint: createChordDiagramFingerprint(diagram),
    };
  });
}

function chunkEntries<T>(entries: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
}

/**
 * Seeds the chord library from the bundled chords dataset using the oldest
 * active owner account as the creator for any newly inserted rows.
 */
export async function seedChordLibrary(
  db: typeof prisma = prisma
): Promise<SeedChordLibraryResult> {
  const owner = await db.adminUser.findFirst({
    where: { role: "owner", isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!owner) {
    throw new Error("Cannot seed the chord library without an active owner admin.");
  }

  const importableEntries = listImportableChordLibraryEntries();
  const existingChords = await db.chord.findMany({
    select: {
      root: true,
      quality: true,
      diagram: true,
    },
  });

  const existingFingerprints = new Set(
    existingChords.map((chord) => {
      const diagram = chord.diagram as unknown as ChordDiagramData;
      return `${chord.root}::${chord.quality}::${createChordDiagramFingerprint(diagram)}`;
    })
  );

  const rowsToCreate = importableEntries.filter((entry) => {
    const key = `${entry.root}::${entry.quality}::${entry.fingerprint}`;
    if (existingFingerprints.has(key)) {
      return false;
    }

    existingFingerprints.add(key);
    return true;
  });

  for (const chunk of chunkEntries(rowsToCreate, 200)) {
    await db.chord.createMany({
      data: chunk.map((entry) => ({
        name: entry.name,
        root: entry.root,
        quality: entry.quality,
        diagram: JSON.parse(JSON.stringify(entry.diagram)) as object,
        createdById: owner.id,
      })),
    });
  }

  return {
    ownerId: owner.id,
    totalImportable: importableEntries.length,
    created: rowsToCreate.length,
    skippedExisting: importableEntries.length - rowsToCreate.length,
  };
}
