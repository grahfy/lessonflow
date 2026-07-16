/**
 * Shared-Library Data-Access Service
 *
 * Thin helpers that own the byte + row lifecycle for shared LibraryItems, so the
 * admin route handlers stay thin and the compensating-cleanup discipline lives in
 * one audited place. Every byte-writing helper best-effort deletes any freshly
 * written blob if the following metadata write fails, mirroring the upload
 * compensator at `customers/[id]/learning-materials/route.ts:323`.
 *
 * AUTHORIZATION IS THE CALLER'S RESPONSIBILITY. In particular,
 * `promoteMaterialToLibrary` performs ONLY the byte copy + row create — the
 * Group 4 promote route MUST enforce the two-tier per-customer source-read
 * predicate (canManagePrimaryTeacherCustomer + booking-tier canManageAssignedTeacher)
 * BEFORE calling this, so the library-WRITE bypass never grants new read access
 * to private per-customer bytes (plan Principle 6 / AC8b).
 */

import { prisma } from "@/lib/db";
import { logError } from "@/lib/observability";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { buildLibraryItemStorageKey } from "@/lib/student-portal/materials";
import type { LibraryItem, LearningMaterialType } from "@/generated/prisma/client";

/**
 * Extracts the file extension (including the leading dot) from a storage key,
 * mirroring the extension handling in the learning-material copy route.
 */
function extractExtension(storageKey: string): string {
  const lastDotIdx = storageKey.lastIndexOf(".");
  return lastDotIdx !== -1 ? storageKey.slice(lastDotIdx) : "";
}

/**
 * Copies the bytes of a source material into a new `library/` blob and creates a
 * LibraryItem row referencing that new key. Does NOT read, modify, or delete the
 * source material (AC8/AC14) — the source is only read for its bytes.
 *
 * SECURITY: the caller MUST have already authorized the source read (see file
 * header). This helper does no authorization.
 */
export async function promoteMaterialToLibrary(input: {
  source: {
    storageKey: string;
    title: string;
    description: string | null;
    materialType: LearningMaterialType;
    mimeType: string;
    sizeBytes: number;
  };
  uploadedById: string | null;
}): Promise<LibraryItem> {
  const { source } = input;
  const storage = createMaterialStorageDriver();
  const newStorageKey = buildLibraryItemStorageKey({ extension: extractExtension(source.storageKey) });

  // Copy the physical bytes into the isolated `library/` namespace first.
  const blob = await storage.get({ storageKey: source.storageKey });
  await storage.put({
    storageKey: newStorageKey,
    buffer: Buffer.from(blob.buffer),
    mimeType: source.mimeType
  });

  try {
    return await prisma.libraryItem.create({
      data: {
        title: source.title,
        description: source.description,
        materialType: source.materialType,
        storageKey: newStorageKey,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
        uploadedById: input.uploadedById
      }
    });
  } catch (error) {
    // Metadata write failed after the blob copy; best-effort cleanup avoids
    // orphaning the freshly written library blob.
    await storage.delete({ storageKey: newStorageKey }).catch((cleanupError) => {
      logError("library_item.storage_delete_failed", cleanupError, {
        storageKey: newStorageKey,
        phase: "promote_compensation"
      });
    });
    throw error;
  }
}

/**
 * Replaces the master file of an existing LibraryItem using write-new-key →
 * pointer-swap → best-effort delete-old (never an in-place overwrite, so a
 * failed write can never corrupt the live master every assignee streams).
 *
 * On put failure: leave the old key intact and best-effort clean any stray new
 * blob. On metadata-swap failure: the row still points at the old key; best-effort
 * clean the new blob. Only after a successful swap is the old blob best-effort
 * deleted (AC-replace).
 */
export async function replaceLibraryItemFile(input: {
  libraryItemId: string;
  oldStorageKey: string;
  buffer: Buffer;
  materialType: LearningMaterialType;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  /**
   * Normalized original filename of the REPLACEMENT file (the caller applies
   * normalizeOriginalFilename). Updated in the pointer-swap so a replaced
   * master keeps duplicate-detection and download-name fidelity — a stale
   * originalFilename would flag/name against the superseded file.
   */
  originalFilename: string;
}): Promise<LibraryItem> {
  const storage = createMaterialStorageDriver();
  const newStorageKey = buildLibraryItemStorageKey({ extension: input.extension });

  try {
    await storage.put({
      storageKey: newStorageKey,
      buffer: input.buffer,
      mimeType: input.mimeType
    });
  } catch (error) {
    // Put failed — the old key and its blob are untouched; clean any partial
    // new blob and surface the failure.
    await storage.delete({ storageKey: newStorageKey }).catch(() => null);
    throw error;
  }

  let updated: LibraryItem;
  try {
    updated = await prisma.libraryItem.update({
      where: { id: input.libraryItemId },
      data: {
        storageKey: newStorageKey,
        mimeType: input.mimeType,
        materialType: input.materialType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename
      }
    });
  } catch (error) {
    // Pointer swap failed — the row still points at the old key (item still
    // streams the old bytes); best-effort clean the orphaned new blob.
    await storage.delete({ storageKey: newStorageKey }).catch((cleanupError) => {
      logError("library_item.storage_delete_failed", cleanupError, {
        storageKey: newStorageKey,
        phase: "replace_compensation"
      });
    });
    throw error;
  }

  // Swap succeeded — best-effort remove the superseded old blob.
  await storage.delete({ storageKey: input.oldStorageKey }).catch((cleanupError) => {
    logError("library_item.storage_delete_failed", cleanupError, {
      id: input.libraryItemId,
      storageKey: input.oldStorageKey,
      phase: "replace_delete_old"
    });
  });

  return updated;
}

/**
 * Assigns a LibraryItem to one or more customers by reference. Idempotent against
 * `@@unique([libraryItemId, customerId])` via `skipDuplicates`, so re-assigning an
 * already-assigned student is a no-op (no error, no duplicate row).
 *
 * NOTE: the caller (Group 4 route) validates that every customerId is an existing
 * non-archived customer up front (AC4). This helper only writes the join rows.
 *
 * @returns the number of newly created assignment rows.
 */
export async function assignLibraryItem(input: {
  libraryItemId: string;
  customerIds: string[];
  assignedById: string | null;
}): Promise<number> {
  if (input.customerIds.length === 0) {
    return 0;
  }
  const result = await prisma.libraryAssignment.createMany({
    data: input.customerIds.map((customerId) => ({
      libraryItemId: input.libraryItemId,
      customerId,
      assignedById: input.assignedById
    })),
    skipDuplicates: true
  });
  return result.count;
}

/**
 * Removes a single by-reference assignment (unassign). Idempotent (uses
 * deleteMany so a missing assignment is not an error). Never touches the master
 * blob or any other assignee (AC9).
 */
export async function unassignLibraryItem(input: {
  libraryItemId: string;
  customerId: string;
}): Promise<number> {
  const result = await prisma.libraryAssignment.deleteMany({
    where: {
      libraryItemId: input.libraryItemId,
      customerId: input.customerId
    }
  });
  return result.count;
}

/**
 * Deletes a LibraryItem row (cascading its LibraryItemTag + LibraryAssignment
 * rows via the schema `onDelete: Cascade`) then best-effort deletes the master
 * blob. Shared `Tag` rows are intentionally left intact (AC11). The row is
 * removed first so the admin UI reflects deletion immediately even if the
 * best-effort blob cleanup later fails (mirrors the learning-material delete).
 *
 * @param input.storageKey - the already-loaded master storage key (the caller
 *   loads the item for its own 404 check, so we avoid a re-query).
 */
export async function deleteLibraryItem(input: {
  libraryItemId: string;
  storageKey: string;
}): Promise<void> {
  await prisma.libraryItem.delete({ where: { id: input.libraryItemId } });

  const storage = createMaterialStorageDriver();
  await storage.delete({ storageKey: input.storageKey }).catch((error) => {
    logError("library_item.storage_delete_failed", error, {
      id: input.libraryItemId,
      storageKey: input.storageKey,
      phase: "delete"
    });
  });
}
