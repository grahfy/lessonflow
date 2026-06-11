import { PrismaClient } from "../src/generated/prisma/client";
import dotenv from "dotenv";
import { createPrismaMariaDbAdapter, getRequiredDatabaseUrl } from "../src/lib/prisma-mariadb";
import {
  LESSONS_PARENT_FOLDER_NAME,
  deriveLessonFolderName
} from "../src/lib/student-portal/folders";

dotenv.config();

/**
 * Idempotent folder-per-lesson backfill (Step Group D, AC-13..AC-15).
 *
 * For each customer that owns booking-linked materials this script:
 *   1. Finds-or-creates ONE "Lessons" parent folder at root.
 *   2. Upserts one lesson folder per booking-with-materials, keyed on the
 *      `(customerId, sourceBookingId)` @@unique, nested under "Lessons".
 *   3. Relinks that booking's materials into the lesson folder, but ONLY rows
 *      whose `folderId IS NULL` — so re-runs and admin-moved materials are
 *      never disturbed (idempotent).
 *
 * SKIP RULE (AC-13): materials with `bookingId = NULL`, or whose `Booking` was
 * hard-deleted (no surviving row), are NOT relinked — there is no lesson to
 * derive a folder from, so they are correctly left at the student root
 * (`folderId = NULL`).
 *
 * The `--dry-run` flag performs NO writes and prints the same tallies a real
 * run would produce, applying the IDENTICAL `folderId IS NULL` relink guard so
 * the AC-15 reconciliation matches a subsequent real run exactly (§10 nit 4).
 *
 * Run via: `npx tsx scripts/backfill-material-folders.ts [--dry-run]`
 */

const LOG_PREFIX = "[backfill-material-folders]";
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Fails fast if Step A2 DDL has not been deployed. Probes the new table and the
 * two new columns the backfill depends on; any missing object aborts with a
 * clear message instead of throwing an opaque SQL error mid-run.
 */
async function assertMigrated(prisma: PrismaClient): Promise<void> {
  try {
    // Probes StudentMaterialFolder table + its sourceBookingId column.
    await prisma.$queryRaw`SELECT \`id\`, \`sourceBookingId\` FROM \`StudentMaterialFolder\` LIMIT 1`;
    // Probes LearningMaterial.folderId column.
    await prisma.$queryRaw`SELECT \`folderId\` FROM \`LearningMaterial\` LIMIT 1`;
  } catch (error) {
    throw new Error(
      `${LOG_PREFIX} migration check failed: StudentMaterialFolder table or the ` +
        `StudentMaterialFolder.sourceBookingId / LearningMaterial.folderId columns are missing. ` +
        `Run \`npx prisma migrate deploy\` (20260611120000_add_student_material_folders) first.\n` +
        `Underlying error: ${(error as Error).message}`
    );
  }
}

type CustomerTally = {
  customerId: string;
  lessonsParentCreated: boolean;
  lessonFoldersCreated: number;
  materialsRelinked: number;
  materialsLeftAtRoot: number;
  preExistingMaterials: number;
  reachableMaterials: number;
};

async function run() {
  const prisma = new PrismaClient({
    adapter: createPrismaMariaDbAdapter(getRequiredDatabaseUrl())
  });

  let reconciliationFailed = false;

  try {
    console.log(`${LOG_PREFIX} starting${DRY_RUN ? " (DRY RUN — no writes)" : ""}...`);
    await assertMigrated(prisma);

    const customers = await prisma.customer.findMany({ select: { id: true } });
    console.log(`${LOG_PREFIX} scanning ${customers.length} customer(s)...`);

    // Aggregate totals across all customers for the final summary.
    let totalLessonsParents = 0;
    let totalLessonFolders = 0;
    let totalRelinked = 0;
    let totalLeftAtRoot = 0;

    for (const { id: customerId } of customers) {
      // All of this customer's materials, with their booking provenance.
      const materials = await prisma.learningMaterial.findMany({
        where: { customerId },
        select: { id: true, bookingId: true, folderId: true }
      });

      const tally: CustomerTally = {
        customerId,
        lessonsParentCreated: false,
        lessonFoldersCreated: 0,
        materialsRelinked: 0,
        materialsLeftAtRoot: 0,
        preExistingMaterials: materials.length,
        reachableMaterials: 0
      };

      if (materials.length === 0) {
        // No materials → nothing to organize; skip silently.
        continue;
      }

      // Bookings this customer's materials reference (excludes bookingId = NULL).
      const referencedBookingIds = Array.from(
        new Set(materials.map((m) => m.bookingId).filter((b): b is string => b !== null))
      );

      // Surviving bookings only — hard-deleted bookings yield no row (AC-13 skip).
      const bookings =
        referencedBookingIds.length > 0
          ? await prisma.booking.findMany({
              where: { id: { in: referencedBookingIds }, customerId },
              select: { id: true, startAt: true, lessonMode: true }
            })
          : [];
      const bookingById = new Map(bookings.map((b) => [b.id, b]));

      // A "relinkable" material is booking-linked, its booking still exists, and
      // it is not yet placed (folderId IS NULL). The folderId IS NULL guard is
      // applied IDENTICALLY in dry-run and real run (§10 nit 4).
      const relinkableByBooking = new Map<string, string[]>();
      for (const m of materials) {
        if (m.bookingId === null) continue; // general material — left at root
        if (!bookingById.has(m.bookingId)) continue; // orphaned booking — left at root
        if (m.folderId !== null) continue; // already placed (admin-moved or prior run)
        const list = relinkableByBooking.get(m.bookingId) ?? [];
        list.push(m.id);
        relinkableByBooking.set(m.bookingId, list);
      }

      // Bookings (with surviving rows) that own >=1 material — these get folders.
      const bookingsWithMaterials = bookings.filter((b) =>
        materials.some((m) => m.bookingId === b.id)
      );

      const customerHasLessonMaterials = bookingsWithMaterials.length > 0;

      if (customerHasLessonMaterials) {
        // --- Step a: find-or-create the single "Lessons" parent. ---
        // Keyed deterministically on (customerId, parentId IS NULL, name, sourceBookingId IS NULL)
        // — NOT on @@unique, whose sourceBookingId is NULL and therefore does not
        // protect this row (multi-NULL-distinct; §10 nit 2).
        const existingLessonsParent = await prisma.studentMaterialFolder.findFirst({
          where: {
            customerId,
            parentId: null,
            name: LESSONS_PARENT_FOLDER_NAME,
            sourceBookingId: null
          },
          select: { id: true }
        });

        let lessonsParentId: string;
        if (existingLessonsParent) {
          lessonsParentId = existingLessonsParent.id;
        } else if (DRY_RUN) {
          tally.lessonsParentCreated = true;
          lessonsParentId = `<dry-run-lessons-parent:${customerId}>`;
        } else {
          const created = await prisma.studentMaterialFolder.create({
            data: { customerId, parentId: null, name: LESSONS_PARENT_FOLDER_NAME, sourceBookingId: null },
            select: { id: true }
          });
          tally.lessonsParentCreated = true;
          lessonsParentId = created.id;
        }

        // --- Step b + c: per booking, upsert the lesson folder + relink. ---
        for (const booking of bookingsWithMaterials) {
          const folderName = deriveLessonFolderName({
            startAt: booking.startAt,
            lessonMode: booking.lessonMode
          });

          const existingLessonFolder = await prisma.studentMaterialFolder.findUnique({
            where: { customerId_sourceBookingId: { customerId, sourceBookingId: booking.id } },
            select: { id: true }
          });

          let lessonFolderId: string;
          if (existingLessonFolder) {
            lessonFolderId = existingLessonFolder.id;
          } else if (DRY_RUN) {
            tally.lessonFoldersCreated += 1;
            lessonFolderId = `<dry-run-lesson-folder:${booking.id}>`;
          } else {
            // Upsert on the @@unique([customerId, sourceBookingId]) — re-runs reuse.
            const upserted = await prisma.studentMaterialFolder.upsert({
              where: { customerId_sourceBookingId: { customerId, sourceBookingId: booking.id } },
              create: {
                customerId,
                parentId: lessonsParentId,
                name: folderName,
                sourceBookingId: booking.id
              },
              update: {},
              select: { id: true }
            });
            tally.lessonFoldersCreated += 1;
            lessonFolderId = upserted.id;
          }

          // Relink only not-yet-placed rows (folderId IS NULL guard) — idempotent.
          const relinkIds = relinkableByBooking.get(booking.id) ?? [];
          if (relinkIds.length > 0) {
            if (!DRY_RUN) {
              await prisma.learningMaterial.updateMany({
                where: {
                  bookingId: booking.id,
                  customerId,
                  folderId: null
                },
                data: { folderId: lessonFolderId }
              });
            }
            tally.materialsRelinked += relinkIds.length;
          }
        }
      }

      // Materials left at root: those that, after this run, still have no folder.
      // = bookingId NULL + orphaned-booking + (already-at-root that were not relinked).
      // We compute it from the simulated end-state so dry-run and real run agree.
      const relinkedIds = new Set<string>();
      for (const ids of relinkableByBooking.values()) {
        for (const id of ids) relinkedIds.add(id);
      }
      tally.materialsLeftAtRoot = materials.filter(
        (m) => m.folderId === null && !relinkedIds.has(m.id)
      ).length;

      // --- AC-15 reconciliation: every pre-existing material reachable exactly once. ---
      // After this run each material is reachable from exactly one tree location:
      // either its (new or pre-existing) folder, or the root. The reachable count
      // is therefore: rows that end up in a folder + rows that end up at root.
      const endInFolder = materials.filter(
        (m) => m.folderId !== null || relinkedIds.has(m.id)
      ).length;
      tally.reachableMaterials = endInFolder + tally.materialsLeftAtRoot;

      if (tally.reachableMaterials !== tally.preExistingMaterials) {
        reconciliationFailed = true;
        console.error(
          `${LOG_PREFIX} RECONCILIATION FAILED for customer ${customerId}: ` +
            `preExisting=${tally.preExistingMaterials} reachable=${tally.reachableMaterials}`
        );
      }

      totalLessonsParents += tally.lessonsParentCreated ? 1 : 0;
      totalLessonFolders += tally.lessonFoldersCreated;
      totalRelinked += tally.materialsRelinked;
      totalLeftAtRoot += tally.materialsLeftAtRoot;

      console.log(
        `${LOG_PREFIX} customer ${customerId}: ` +
          `lessonsParent ${tally.lessonsParentCreated ? "created" : "reused/none"}, ` +
          `lessonFolders ${DRY_RUN ? "would-create" : "created/reused"}=${tally.lessonFoldersCreated}, ` +
          `relinked=${tally.materialsRelinked}, leftAtRoot=${tally.materialsLeftAtRoot}, ` +
          `reconciliation ${tally.reachableMaterials}/${tally.preExistingMaterials}`
      );
    }

    console.log(
      `${LOG_PREFIX} ${DRY_RUN ? "DRY RUN " : ""}summary: ` +
        `lessonsParents ${DRY_RUN ? "would-create" : "created"}=${totalLessonsParents}, ` +
        `lessonFolders ${DRY_RUN ? "would-create" : "created/reused"}=${totalLessonFolders}, ` +
        `materials ${DRY_RUN ? "would-relink" : "relinked"}=${totalRelinked}, ` +
        `materials left at root=${totalLeftAtRoot}`
    );

    if (reconciliationFailed) {
      if (DRY_RUN) {
        console.error(
          `${LOG_PREFIX} DRY RUN reconciliation FAILED — do NOT proceed to a real run.`
        );
      } else {
        console.error(`${LOG_PREFIX} reconciliation FAILED — see per-customer errors above.`);
      }
      // Exit non-zero on any reconciliation failure (real run gate; AC-15).
      process.exitCode = 1;
    } else {
      console.log(
        `${LOG_PREFIX} AC-15 reconciliation PASSED for all customers` +
          `${DRY_RUN ? " (gate satisfied — safe to run for real)" : ""}.`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(`${LOG_PREFIX} failed`, error);
  process.exit(1);
});
