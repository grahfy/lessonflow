/**
 * Pure geometry + legality rules for dragging rows around the materials tree.
 *
 * No React, no DOM ownership — `use-tree-drag.ts` feeds this module a pointer
 * position and a hit-tested rect, and it answers "which zone" and "which
 * destination folder, if any". Keeping it pure is what makes the interesting
 * half of drag-and-drop testable without a browser.
 *
 * `before`/`after` on a folder row still collapse to "that folder's parent" —
 * folder rows are `into`-only for files. Only file rows carry an index.
 */

export type DropZone = "before" | "into" | "after";

export type DropTarget = {
  kind: "folder" | "file" | "root";
  id: string;
  zone: DropZone;
};

export type DragItem = {
  kind: "folder" | "file";
  id: string;
};

/** Minimal structural shape of a tree folder (AdminFolderRow / TreeFolder both fit). */
export interface DndFolder {
  id: string;
  parentId: string | null;
  children: DndFolder[];
}

/** Minimal structural shape of a tree file. */
export interface DndFile {
  id: string;
  folderId: string | null;
}

/**
 * Pointer y → drop zone.
 *
 * Rows that accept `into` (folders) use a 25/50/25 band under a mouse and a
 * wider 30/40/30 under a finger, where the pointer is both fatter and hidden
 * under the hand. File rows have no `into` and split 50/50.
 */
export function zoneForRect(
  y: number,
  rect: { top: number; height: number },
  acceptsInto: boolean,
  touch: boolean
): DropZone {
  const ratio = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
  if (!acceptsInto) {
    return ratio < 0.5 ? "before" : "after";
  }
  const edge = touch ? 0.3 : 0.25;
  if (ratio < edge) return "before";
  if (ratio > 1 - edge) return "after";
  return "into";
}

/** Finds a folder node anywhere in the tree. */
function findFolder(nodes: DndFolder[], id: string): DndFolder | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findFolder(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Recursively aggregates all descendant folder IDs to prevent circular folder
 * moves. Excludes `folderId` itself — callers check that separately.
 */
export function getDescendantFolderIds(nodes: DndFolder[], folderId: string): Set<string> {
  const descendants = new Set<string>();
  const targetNode = findFolder(nodes, folderId);
  if (targetNode) {
    const walk = (n: DndFolder) => {
      descendants.add(n.id);
      for (const child of n.children) {
        walk(child);
      }
    };
    for (const child of targetNode.children) {
      walk(child);
    }
  }
  return descendants;
}

export type DropResolution = {
  folderId: string | null;
  /** The destination folder's complete post-drop FILE order. Folders are not in it. */
  orderedIds: string[];
  movedId: string;
};

/**
 * Destination folder + post-drop file order for a drop, or `null` when the drop
 * is illegal or a no-op.
 *
 * `{ folderId: null }` (a legal drop onto the root) and `null` (no drop) are
 * deliberately different returns — collapsing them would make "move to root"
 * unrepresentable.
 *
 * `orderedIds` covers files only. Folder rows and file rows share one rendered
 * container (folders first, then files), so any index taken from the rendered
 * list is offset by the folder count and "before folder X" has no file-list
 * position at all — hence folder rows append and only file rows carry an index.
 */
export function resolveDrop(
  active: DragItem,
  target: DropTarget,
  folders: DndFolder[],
  materials: DndFile[]
): DropResolution | null {
  let destination: string | null;

  // Dropping a row onto itself is never a move, at any zone.
  if (target.kind !== "root" && target.id === active.id) return null;

  if (target.kind === "root") {
    destination = null;
  } else if (target.kind === "folder") {
    if (target.zone === "into") {
      destination = target.id;
    } else {
      const node = findFolder(folders, target.id);
      if (!node) return null;
      destination = node.parentId;
    }
  } else {
    const file = materials.find((m) => m.id === target.id);
    if (!file) return null;
    destination = file.folderId;
  }

  // The destination's current file order, in tree order.
  const current = materials.filter((m) => m.folderId === destination).map((m) => m.id);

  if (active.kind === "folder") {
    // A folder may never land inside itself or anything it contains.
    if (destination === active.id) return null;
    if (destination !== null && getDescendantFolderIds(folders, active.id).has(destination)) {
      return null;
    }
    const node = findFolder(folders, active.id);
    if (!node) return null;
    if (node.parentId === destination) return null;
    // Folders carry no order of their own; the destination's files are untouched.
    return { folderId: destination, orderedIds: current, movedId: active.id };
  }

  const file = materials.find((m) => m.id === active.id);
  if (!file) return null;

  // Only a file row expresses a position. A folder or root row means "put it
  // here", so landing on the one it is already in is nothing at all — it must
  // not silently shunt the file to the end of its own folder.
  if (target.kind !== "file" && file.folderId === destination) return null;

  const siblings = current.filter((id) => id !== active.id);
  let index = siblings.length;
  if (target.kind === "file") {
    const at = siblings.indexOf(target.id);
    // A file row's destination IS its own folder, so `at` is only -1 if the
    // rendered list and `materials` disagree; appending beats guessing.
    if (at >= 0) index = target.zone === "after" ? at + 1 : at;
  }
  const orderedIds = [...siblings.slice(0, index), active.id, ...siblings.slice(index)];

  // Same folder AND same order is the only true no-op; a same-folder drop that
  // changes the order is a reorder, which the caller still has to persist.
  if (file.folderId === destination && orderedIds.every((id, i) => id === current[i])) {
    return null;
  }

  return { folderId: destination, orderedIds, movedId: active.id };
}
