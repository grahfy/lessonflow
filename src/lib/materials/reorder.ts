import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * Shared move+reorder implementation for the admin and student surfaces, and
 * the ONE place `LearningMaterial` and `LibraryAssignment` meet.
 *
 * Everything is scoped by `customerId` structurally: the sibling load, the
 * ownership check and both write predicates carry it, so a caller cannot
 * forget it. `storageKey`, `title` and `mimeType` never appear in any SET
 * clause — only `folderId` and `sortOrder` move (Principle 2). No blob is ever
 * touched: an assignment is a join row, so placing a library item copies
 * nothing and the shared master is untouched.
 *
 * Callers map `reason` to their own status codes; the student route in
 * particular must NOT leak "cross_customer" as a distinct code (folder-id
 * existence oracle).
 */

/** Tree-id prefix marking a `LibraryAssignment` rather than a `LearningMaterial`. */
export const LIBRARY_TREE_ID_PREFIX = "lib:";

export function libraryTreeId(libraryItemId: string): string {
  return `${LIBRARY_TREE_ID_PREFIX}${libraryItemId}`;
}

/** `lib:xyz` → `xyz`; anything else → null. */
export function libraryItemIdFromTreeId(treeId: string): string | null {
  return treeId.startsWith(LIBRARY_TREE_ID_PREFIX)
    ? treeId.slice(LIBRARY_TREE_ID_PREFIX.length)
    : null;
}

export type ReorderInput = {
  customerId: string;
  folderId: string | null;
  movedId: string | null;
  orderedIds: string[];
};

export type ReorderResult =
  | { ok: true; materials: { id: string; folderId: string | null; sortOrder: number }[] }
  | { ok: false; reason: "not_found" | "cross_customer" | "stale" | "forbidden_booking"; detail?: string };

export type ReorderOptions = {
  /** INV-4 gate, applied to EVERY id in the list. Omitted ⇒ no booking gate. */
  canManageBooking?: (assignedTeacherId: string | null) => boolean;
};

export const REORDER_MAX_IDS = 200;

/** The canonical read order for materials inside one folder. */
export const materialOrderBy = [
  { sortOrder: "asc" as const },
  { createdAt: "desc" as const },
  { id: "asc" as const }
];

/**
 * The same key as `materialOrderBy`, applied across the two merged collections.
 * `id` is the TREE id (`lib:`-prefixed for assignments) so the tiebreak the DB
 * applies within one table and the tiebreak applied across both agree.
 */
export type TreeOrderKey = { id: string; sortOrder: number; createdAt: Date };

export function compareTreeOrder(a: TreeOrderKey, b: TreeOrderKey): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const at = a.createdAt.getTime();
  const bt = b.createdAt.getTime();
  if (at !== bt) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function reorderMaterials(
  input: ReorderInput,
  opts: ReorderOptions = {}
): Promise<ReorderResult> {
  const { customerId, folderId, movedId, orderedIds } = input;

  // 1. Shape.
  if (orderedIds.length < 1 || orderedIds.length > REORDER_MAX_IDS) {
    return { ok: false, reason: "not_found", detail: "Invalid list length." };
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, reason: "not_found", detail: "Duplicate ids." };
  }

  const materialIds = orderedIds.filter((id) => libraryItemIdFromTreeId(id) === null);
  const libraryItemIds = orderedIds
    .map(libraryItemIdFromTreeId)
    .filter((id): id is string => id !== null);

  // 2. Ownership + existence in one comparison across BOTH tables: a
  // cross-customer or nonexistent id simply does not come back, so the combined
  // length catches IDOR and 404 alike.
  const [rows, assignments] = await Promise.all([
    materialIds.length
      ? prisma.learningMaterial.findMany({
          where: { id: { in: materialIds }, customerId },
          select: {
            id: true,
            folderId: true,
            bookingId: true,
            booking: { select: { assignedTeacherId: true } }
          }
        })
      : Promise.resolve([]),
    libraryItemIds.length
      ? prisma.libraryAssignment.findMany({
          where: { libraryItemId: { in: libraryItemIds }, customerId },
          select: { libraryItemId: true, folderId: true }
        })
      : Promise.resolve([])
  ]);
  if (rows.length !== materialIds.length || assignments.length !== libraryItemIds.length) {
    return { ok: false, reason: "not_found" };
  }

  // 3. INV-4 over EVERY id, not just `movedId`. The per-id move route gates only
  // the URL material; a sibling list would otherwise let teacher A rewrite
  // sortOrder on rows linked to teacher B's bookings. Library rows have no
  // booking, so the gate does not apply to them.
  const canManageBooking = opts.canManageBooking;
  if (canManageBooking) {
    for (const row of rows) {
      if (row.bookingId && !canManageBooking(row.booking?.assignedTeacherId ?? null)) {
        return { ok: false, reason: "forbidden_booking" };
      }
    }
  }

  // 4. Destination folder must exist AND belong to this customer. One reason for
  // both so the response is not an existence oracle. Checked BEFORE the sibling
  // comparison below: an unknown folder is a bad destination, never "stale".
  if (folderId !== null) {
    const folder = await prisma.studentMaterialFolder.findFirst({
      where: { id: folderId, customerId },
      select: { id: true }
    });
    if (!folder) {
      return { ok: false, reason: "cross_customer" };
    }
  }

  // 5-7 run inside ONE interactive transaction with a locking read.
  //
  // TOCTOU: with the checks on the autocommit connection and only the writes in
  // a transaction, admin B could pass its staleness check, admin A could move
  // material X out of the folder, and B's CASE update — which sets `folderId`
  // unconditionally on every id in its list — would RESURRECT X into the folder.
  // Two simultaneous reorders both passed and the 409 never fired.
  //
  // The `SELECT ... FOR UPDATE` below locks the destination folder's rows AND
  // the moved row before the comparison, so a concurrent writer blocks until we
  // commit and then fails its own check. Lock ordering: one ranged select per
  // table, always materials-then-assignments, each `ORDER BY id` — every client
  // takes the same locks in the same order, which is the property the
  // single-CASE-update design was chosen to preserve.
  if (movedId !== null && !orderedIds.includes(movedId)) {
    return { ok: false, reason: "not_found", detail: "movedId not in orderedIds." };
  }

  const positionOf = new Map(orderedIds.map((id, index) => [id, index + 1]));

  return prisma.$transaction(async (tx) => {
    // `<=>` is the NULL-safe equality MySQL needs for a root-folder (NULL) match.
    const lockedMaterials = await tx.$queryRaw<
      { id: string; folderId: string | null; sortOrder: number; createdAt: Date }[]
    >(Prisma.sql`
      SELECT \`id\`, \`folderId\`, \`sortOrder\`, \`createdAt\`
      FROM \`LearningMaterial\`
      WHERE \`customerId\` = ${customerId}
        AND (\`folderId\` <=> ${folderId}${
          materialIds.length ? Prisma.sql` OR \`id\` IN (${Prisma.join(materialIds)})` : Prisma.empty
        })
      ORDER BY \`id\`
      FOR UPDATE
    `);
    const lockedAssignments = await tx.$queryRaw<
      { libraryItemId: string; folderId: string | null; sortOrder: number; createdAt: Date }[]
    >(Prisma.sql`
      SELECT \`libraryItemId\`, \`folderId\`, \`sortOrder\`, \`createdAt\`
      FROM \`LibraryAssignment\`
      WHERE \`customerId\` = ${customerId}
        AND (\`folderId\` <=> ${folderId}${
          libraryItemIds.length ? Prisma.sql` OR \`libraryItemId\` IN (${Prisma.join(libraryItemIds)})` : Prisma.empty
        })
      ORDER BY \`libraryItemId\`
      FOR UPDATE
    `);

    const locked = [
      ...lockedMaterials.map((row) => ({ ...row, treeId: row.id })),
      ...lockedAssignments.map((row) => ({ ...row, treeId: libraryTreeId(row.libraryItemId) }))
    ];
    const lockedByTreeId = new Map(locked.map((row) => [row.treeId, row]));

    // 5. Only `movedId` may be arriving from elsewhere; every other row must
    // still live in the destination folder AS OF THE LOCK.
    for (const treeId of orderedIds) {
      if (treeId === movedId) continue;
      if (lockedByTreeId.get(treeId)?.folderId !== folderId) {
        return { ok: false, reason: "stale" as const };
      }
    }

    // 6. ORDERED staleness check. Set equality is permutation-invariant and
    // therefore blind to the exact concurrent-reorder race this exists to catch.
    // `movedId` is dropped from BOTH sides: on the client side it is the row
    // being placed, on the server side it may or may not already live here
    // (in-folder reorder vs. move-in). What must agree is the relative order of
    // everything else — that is exactly the state the client based its drop on.
    const currentIds = locked
      .filter((row) => row.folderId === folderId)
      .sort((a, b) => compareTreeOrder({ id: a.treeId, sortOrder: a.sortOrder, createdAt: a.createdAt }, { id: b.treeId, sortOrder: b.sortOrder, createdAt: b.createdAt }))
      .map((row) => row.treeId)
      .filter((id) => id !== movedId);
    const expectedIds = orderedIds.filter((id) => id !== movedId);
    if (
      expectedIds.length !== currentIds.length ||
      expectedIds.some((id, index) => id !== currentIds[index])
    ) {
      return { ok: false, reason: "stale" as const };
    }

    // 7. ONE statement per table, not N. `orderedIds.map(id => tx.update(...))`
    // is up to 200 sequential round trips against the mariadb adapter → P2028 at
    // the 5s default, 200 held row locks, and a cross-client deadlock when two
    // clients order the same folder differently. Each CASE update makes the
    // ownership predicate part of the write.
    // ponytail: whole-list rewrite, O(n) per drop. Fractional indices if a
    // folder ever holds thousands.
    if (materialIds.length) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE \`LearningMaterial\`
        SET \`folderId\` = ${folderId},
            \`sortOrder\` = CASE \`id\` ${Prisma.join(
              materialIds.map((id) => Prisma.sql`WHEN ${id} THEN ${positionOf.get(id)}`),
              " "
            )} END
        WHERE \`customerId\` = ${customerId} AND \`id\` IN (${Prisma.join(materialIds)})
      `);
    }
    if (libraryItemIds.length) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE \`LibraryAssignment\`
        SET \`folderId\` = ${folderId},
            \`sortOrder\` = CASE \`libraryItemId\` ${Prisma.join(
              libraryItemIds.map((id) => Prisma.sql`WHEN ${id} THEN ${positionOf.get(libraryTreeId(id))}`),
              " "
            )} END
        WHERE \`customerId\` = ${customerId} AND \`libraryItemId\` IN (${Prisma.join(libraryItemIds)})
      `);
    }

    return {
      ok: true as const,
      materials: orderedIds.map((id, index) => ({ id, folderId, sortOrder: index + 1 }))
    };
  });
}
