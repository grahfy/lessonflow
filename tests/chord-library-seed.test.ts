import { beforeEach, describe, expect, it } from "vitest";

import { ensureOwnerAdmin } from "@/lib/admin-auth";
import {
  createChordDiagramFingerprint,
  listImportableChordLibraryEntries,
  seedChordLibrary,
} from "@/lib/chords/chord-library-seed";
import { getImportableChordQualities } from "@/lib/chords/chord-lookup";
import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { prisma } from "@/lib/db";

describe("chord-library-seed", () => {
  beforeEach(async () => {
    await prisma.chordChartItem.deleteMany();
    await prisma.chordChart.deleteMany();
    await prisma.chord.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("enumerates importable bundled voicings using supported app qualities", () => {
    const qualities = getImportableChordQualities();
    const entries = listImportableChordLibraryEntries();
    const sample = entries.find((entry) => entry.root === "C" && entry.quality === "major");

    expect(qualities).toContain("major");
    expect(qualities).toContain("minor");
    expect(qualities).not.toContain("5");
    expect(entries.length).toBeGreaterThan(700);
    expect(sample).toMatchObject({
      name: "C",
      root: "C",
      quality: "major",
      diagram: {
        name: {
          root: "C",
          quality: "major",
        },
        tuning: ["E", "A", "D", "G", "B", "E"],
        isLeftHanded: false,
      },
    });
    expect(sample?.fingerprint).toBeTruthy();
  });

  it("normalizes barre ordering in the import fingerprint", () => {
    const baseDiagram = listImportableChordLibraryEntries().find(
      (entry) => entry.root === "F" && entry.quality === "major" && entry.diagram.fingering.barres.length > 0
    )?.diagram;

    expect(baseDiagram).toBeTruthy();

    const reversedBarresDiagram: ChordDiagramData = {
      ...baseDiagram!,
      fingering: {
        ...baseDiagram!.fingering,
        barres: [...baseDiagram!.fingering.barres].reverse(),
      },
    };

    expect(createChordDiagramFingerprint(reversedBarresDiagram)).toBe(
      createChordDiagramFingerprint(baseDiagram!)
    );
  });

  it("imports every supported bundled voicing once and skips duplicates on rerun", async () => {
    const owner = await ensureOwnerAdmin();
    const expectedEntries = listImportableChordLibraryEntries();

    const firstRun = await seedChordLibrary();
    expect(firstRun).toMatchObject({
      ownerId: owner.id,
      totalImportable: expectedEntries.length,
      created: expectedEntries.length,
      skippedExisting: 0,
    });

    expect(await prisma.chord.count()).toBe(expectedEntries.length);

    const sampleChord = await prisma.chord.findFirst({
      where: { root: "C", quality: "major" },
      orderBy: { createdAt: "asc" },
    });

    expect(sampleChord).toBeTruthy();
    expect(sampleChord?.name).toBe("C");
    expect(sampleChord?.createdById).toBe(owner.id);

    const secondRun = await seedChordLibrary();
    expect(secondRun).toMatchObject({
      ownerId: owner.id,
      totalImportable: expectedEntries.length,
      created: 0,
      skippedExisting: expectedEntries.length,
    });

    expect(await prisma.chord.count()).toBe(expectedEntries.length);
  });

  it("fails clearly when no active owner admin exists", async () => {
    await expect(seedChordLibrary()).rejects.toThrow(
      "Cannot seed the chord library without an active owner admin."
    );
  });
});
