import { APP_TIMEZONE, toDateKey } from "@/lib/time";

/**
 * Pure, I/O-free helpers for the per-student material folder tree.
 *
 * A folder is the primary organizing axis for learning materials; `bookingId`
 * on a material is retained but demoted to display metadata. `folderId` is
 * logical only — physical `storageKey` layout never mirrors the tree. These
 * helpers enforce the structural invariants (INV-1..INV-3) and are exercised
 * by the admin folder routes, the read payloads, and the backfill script.
 */

/** Minimal folder shape shared by API/DB rows and the backfill script. */
export type FolderNode = {
  id: string;
  customerId: string;
  parentId: string | null;
  name: string;
  sourceBookingId: string | null;
};

/** A folder enriched with its children and the material ids placed directly in it. */
export type FolderTreeNode = FolderNode & {
  children: FolderTreeNode[];
  materialIds: string[];
};

/**
 * The canonical name of the per-customer parent folder that groups all
 * backfill-created lesson folders (AC-13/AC-14). Kept here so the backfill
 * script and any find-or-create logic agree on a single literal.
 */
export const LESSONS_PARENT_FOLDER_NAME = "Lessons";

/** Folder name limits (INV-1). */
export const MAX_FOLDER_NAME_LENGTH = 255;

/** Normalizes a folder name for case/whitespace-insensitive sibling comparison. */
export function normalizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export class FolderValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY_NAME"
      | "NAME_TOO_LONG"
      | "DUPLICATE_SIBLING"
      | "CYCLE"
      | "SELF_PARENT"
      | "CROSS_CUSTOMER"
  ) {
    super(message);
    this.name = "FolderValidationError";
  }
}

/**
 * INV-1: a folder name must be non-empty, <= MAX_FOLDER_NAME_LENGTH chars, and
 * unique (case/whitespace-insensitive) among siblings sharing the same
 * customerId + parentId. `excludeId` skips the folder being renamed.
 *
 * Sibling-name uniqueness is enforced HERE in app code (not a DB constraint)
 * because the relocate-up delete path can transiently create same-name siblings
 * mid-transaction; a hard DB unique key would abort that legitimate operation.
 */
export function assertUniqueSiblingName(input: {
  name: string;
  customerId: string;
  parentId: string | null;
  siblings: ReadonlyArray<FolderNode>;
  excludeId?: string;
}): string {
  const trimmed = input.name.trim();
  if (trimmed.length === 0) {
    throw new FolderValidationError("Folder name cannot be empty.", "EMPTY_NAME");
  }
  if (trimmed.length > MAX_FOLDER_NAME_LENGTH) {
    throw new FolderValidationError(
      `Folder name cannot exceed ${MAX_FOLDER_NAME_LENGTH} characters.`,
      "NAME_TOO_LONG"
    );
  }
  const normalized = normalizeFolderName(trimmed);
  const clash = input.siblings.some(
    (s) =>
      s.id !== input.excludeId &&
      s.customerId === input.customerId &&
      s.parentId === input.parentId &&
      normalizeFolderName(s.name) === normalized
  );
  if (clash) {
    throw new FolderValidationError(
      `A folder named "${trimmed}" already exists here.`,
      "DUPLICATE_SIBLING"
    );
  }
  return trimmed;
}

/**
 * INV-2: rejects moving/creating a folder under itself or one of its own
 * descendants. Hard-rejects the self-parent case (folderId === targetParentId)
 * in addition to any transitive-descendant cycle. `targetParentId === null`
 * (move to root) is always safe.
 */
export function assertNoCycle(
  folderId: string,
  targetParentId: string | null,
  allFolders: ReadonlyArray<FolderNode>
): void {
  if (targetParentId === null) return;
  if (folderId === targetParentId) {
    throw new FolderValidationError("A folder cannot be its own parent.", "SELF_PARENT");
  }
  const byId = new Map(allFolders.map((f) => [f.id, f]));
  // Walk the target's ancestor chain; if we reach folderId, the target is a
  // descendant of folderId and the move would create a cycle.
  let cursor: string | null = targetParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === folderId) {
      throw new FolderValidationError(
        "Cannot move a folder into one of its own descendants.",
        "CYCLE"
      );
    }
    if (seen.has(cursor)) break; // defensive: pre-existing cycle, stop walking
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
}

/**
 * INV-3: a folder target must belong to the same customer as the entity being
 * placed into it. Used for material moves and folder re-parenting.
 */
export function assertSameCustomerFolder(
  customerId: string,
  target: Pick<FolderNode, "customerId"> | null | undefined
): void {
  if (target && target.customerId !== customerId) {
    throw new FolderValidationError(
      "Target folder belongs to a different customer.",
      "CROSS_CUSTOMER"
    );
  }
}

/**
 * Builds the per-student folder tree from a flat folder list plus a mapping of
 * folderId -> material ids. Folders are scoped to one customer by the caller.
 * A material/folder whose parentId points at an unknown folder is treated as a
 * root node (graceful degradation for any stray reference).
 */
export function buildFolderTree(
  folders: ReadonlyArray<FolderNode>,
  materialsByFolderId: ReadonlyMap<string | null, ReadonlyArray<string>> = new Map()
): FolderTreeNode[] {
  const nodes = new Map<string, FolderTreeNode>();
  for (const f of folders) {
    nodes.set(f.id, {
      ...f,
      children: [],
      materialIds: [...(materialsByFolderId.get(f.id) ?? [])]
    });
  }
  const roots: FolderTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node); // top-level OR stray parentId -> render at root
    }
  }
  const sortRec = (list: FolderTreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/**
 * Computes the relocate-up update set for deleting `folder`: its direct child
 * materials and direct child folders move to `folder.parentId` (the parent, or
 * root when the parent is null). Pure — returns ids to update; the caller runs
 * the writes inside a transaction (AC-4/AC-7).
 */
export function relocateChildrenToParent(
  folder: Pick<FolderNode, "id" | "parentId">,
  allFolders: ReadonlyArray<FolderNode>,
  directMaterialIds: ReadonlyArray<string>
): {
  newParentId: string | null;
  childFolderIds: string[];
  materialIds: string[];
} {
  const childFolderIds = allFolders.filter((f) => f.parentId === folder.id).map((f) => f.id);
  return {
    newParentId: folder.parentId,
    childFolderIds,
    materialIds: [...directMaterialIds]
  };
}

/**
 * AC-14: derives a human-identifiable lesson-folder name from a booking, using
 * the app timezone so the date matches what students see elsewhere.
 * e.g. "2026-03-14 · In-person lesson".
 */
export function deriveLessonFolderName(booking: {
  startAt: string | Date;
  lessonMode: "in_person" | "video";
}): string {
  const datePart = toDateKey(booking.startAt, APP_TIMEZONE);
  const modeLabel = booking.lessonMode === "video" ? "Video lesson" : "In-person lesson";
  return `${datePart} · ${modeLabel}`;
}
