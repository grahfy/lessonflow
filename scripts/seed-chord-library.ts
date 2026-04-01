#!/usr/bin/env node

/**
 * Seed Chord Library
 *
 * Imports the bundled supported chord dataset into the chord library table.
 * The import is idempotent and can be rerun safely.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/seed-chord-library.ts
 */

import { prisma } from "../src/lib/db";
import { seedChordLibrary } from "../src/lib/chords/chord-library-seed";

async function main() {
  const result = await seedChordLibrary();

  console.log(
    `Chord library import complete: ${result.created} created, ${result.skippedExisting} skipped, ${result.totalImportable} importable voicings total.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
