import { describe, expect, it } from "vitest";

import {
  getDescendantFolderIds,
  resolveDrop,
  zoneForRect,
  type DndFile,
  type DndFolder,
  type DragItem,
  type DropTarget
} from "@/lib/materials/tree-dnd";

const rect = { top: 100, height: 40 };

/**
 *   root
 *   ├─ a
 *   │  └─ a1
 *   │     └─ a2
 *   └─ b
 *
 * files: f-root (root), f-a (in a)
 */
const folders: DndFolder[] = [
  {
    id: "a",
    parentId: null,
    children: [{ id: "a1", parentId: "a", children: [{ id: "a2", parentId: "a1", children: [] }] }]
  },
  { id: "b", parentId: null, children: [] }
];

const materials: DndFile[] = [
  { id: "f-root", folderId: null },
  { id: "f-a", folderId: "a" }
];

describe("zoneForRect", () => {
  it("splits a file row 50/50 with no into band", () => {
    expect(zoneForRect(119, rect, false, false)).toBe("before");
    expect(zoneForRect(121, rect, false, false)).toBe("after");
    expect(zoneForRect(105, rect, false, true)).toBe("before");
    expect(zoneForRect(135, rect, false, true)).toBe("after");
  });

  it("gives a folder row a 25/50/25 band under a mouse", () => {
    expect(zoneForRect(105, rect, true, false)).toBe("before");
    expect(zoneForRect(115, rect, true, false)).toBe("into");
    expect(zoneForRect(120, rect, true, false)).toBe("into");
    expect(zoneForRect(128, rect, true, false)).toBe("into");
    expect(zoneForRect(135, rect, true, false)).toBe("after");
  });

  it("widens the edges to 30/40/30 under a finger", () => {
    // 129/111 are `into` on mouse (25% edge) but hit the wider touch edges.
    expect(zoneForRect(129, rect, true, true)).toBe("after");
    expect(zoneForRect(129, rect, true, false)).toBe("into");
    expect(zoneForRect(111, rect, true, true)).toBe("before");
    expect(zoneForRect(111, rect, true, false)).toBe("into");
    expect(zoneForRect(120, rect, true, true)).toBe("into");
  });

  it("treats a zero-height rect as the midpoint rather than dividing by zero", () => {
    expect(zoneForRect(100, { top: 100, height: 0 }, true, false)).toBe("into");
    expect(zoneForRect(100, { top: 100, height: 0 }, false, false)).toBe("after");
  });
});

describe("getDescendantFolderIds", () => {
  it("collects the whole subtree, excluding the folder itself", () => {
    expect(getDescendantFolderIds(folders, "a")).toEqual(new Set(["a1", "a2"]));
    expect(getDescendantFolderIds(folders, "a2")).toEqual(new Set());
    expect(getDescendantFolderIds(folders, "missing")).toEqual(new Set());
  });
});

describe("resolveDrop", () => {
  const file = { kind: "file", id: "f-root" } as const;

  it("drops a file into a folder", () => {
    expect(resolveDrop(file, { kind: "folder", id: "a", zone: "into" }, folders, materials)).toEqual({
      folderId: "a",
      orderedIds: ["f-a", "f-root"],
      movedId: "f-root"
    });
  });

  it("collapses before/after on a folder row to that folder's parent", () => {
    expect(resolveDrop(file, { kind: "folder", id: "a1", zone: "before" }, folders, materials)).toEqual({
      folderId: "a",
      orderedIds: ["f-a", "f-root"],
      movedId: "f-root"
    });
    expect(resolveDrop(file, { kind: "folder", id: "a1", zone: "after" }, folders, materials)).toEqual({
      folderId: "a",
      orderedIds: ["f-a", "f-root"],
      movedId: "f-root"
    });
    // a1's parent is `a`, which is already f-a's folder → no-op.
    expect(
      resolveDrop({ kind: "file", id: "f-a" }, { kind: "folder", id: "a1", zone: "after" }, folders, materials)
    ).toBeNull();
  });

  it("drops onto the root row", () => {
    expect(resolveDrop({ kind: "file", id: "f-a" }, { kind: "root", id: "__root__", zone: "into" }, folders, materials)).toEqual(
      { folderId: null, orderedIds: ["f-root", "f-a"], movedId: "f-a" }
    );
  });

  it("targets a file row's own folder", () => {
    expect(resolveDrop(file, { kind: "file", id: "f-a", zone: "before" }, folders, materials)).toEqual({
      folderId: "a",
      orderedIds: ["f-root", "f-a"],
      movedId: "f-root"
    });
  });

  it("rejects a no-op drop", () => {
    expect(resolveDrop(file, { kind: "root", id: "__root__", zone: "into" }, folders, materials)).toBeNull();
    expect(resolveDrop({ kind: "file", id: "f-a" }, { kind: "folder", id: "a", zone: "into" }, folders, materials)).toBeNull();
    expect(resolveDrop({ kind: "folder", id: "b" }, { kind: "root", id: "__root__", zone: "into" }, folders, materials)).toBeNull();
  });

  it("rejects a folder dropped into itself or a descendant", () => {
    const a = { kind: "folder", id: "a" } as const;
    expect(resolveDrop(a, { kind: "folder", id: "a", zone: "into" }, folders, materials)).toBeNull();
    expect(resolveDrop(a, { kind: "folder", id: "a1", zone: "into" }, folders, materials)).toBeNull();
    expect(resolveDrop(a, { kind: "folder", id: "a2", zone: "into" }, folders, materials)).toBeNull();
    // a2's parent is a1, still inside `a`.
    expect(resolveDrop(a, { kind: "folder", id: "a2", zone: "before" }, folders, materials)).toBeNull();
  });

  it("allows a folder into an unrelated sibling", () => {
    expect(resolveDrop({ kind: "folder", id: "a" }, { kind: "folder", id: "b", zone: "into" }, folders, materials)).toEqual({
      folderId: "b",
      orderedIds: [],
      movedId: "a"
    });
  });

  it("keeps a folder drag out of the destination's file order", () => {
    expect(resolveDrop({ kind: "folder", id: "b" }, { kind: "folder", id: "a", zone: "into" }, folders, materials)).toEqual({
      folderId: "a",
      orderedIds: ["f-a"],
      movedId: "b"
    });
  });

  it("rejects unknown ids rather than guessing a destination", () => {
    expect(resolveDrop({ kind: "file", id: "nope" }, { kind: "folder", id: "a", zone: "into" }, folders, materials)).toBeNull();
    expect(resolveDrop(file, { kind: "folder", id: "nope", zone: "before" }, folders, materials)).toBeNull();
    expect(resolveDrop(file, { kind: "file", id: "nope", zone: "before" }, folders, materials)).toBeNull();
  });
});

/**
 * Folder `m` renders ONE container holding [m1, m2, g1, g2, g3] — subfolders
 * first, then files. Every index below is a position in the FILE list; an index
 * read off the rendered container would be 2 too high.
 */
describe("resolveDrop splice index over a mixed folder/file container", () => {
  const mixed: DndFolder[] = [
    {
      id: "m",
      parentId: null,
      children: [
        { id: "m1", parentId: "m", children: [] },
        { id: "m2", parentId: "m", children: [] }
      ]
    },
    { id: "x", parentId: null, children: [] }
  ];
  const files: DndFile[] = [
    { id: "p", folderId: "x" },
    { id: "g1", folderId: "m" },
    { id: "g2", folderId: "m" },
    { id: "g3", folderId: "m" }
  ];
  const drop = (active: DragItem, target: DropTarget) => resolveDrop(active, target, mixed, files);
  const incoming = { kind: "file", id: "p" } as const;

  it("splices before the first file at index 0, not at the folder count", () => {
    expect(drop(incoming, { kind: "file", id: "g1", zone: "before" })).toEqual({
      folderId: "m",
      orderedIds: ["p", "g1", "g2", "g3"],
      movedId: "p"
    });
  });

  it("puts `after` one past the target", () => {
    expect(drop(incoming, { kind: "file", id: "g1", zone: "after" })?.orderedIds).toEqual([
      "g1",
      "p",
      "g2",
      "g3"
    ]);
    expect(drop(incoming, { kind: "file", id: "g3", zone: "after" })?.orderedIds).toEqual([
      "g1",
      "g2",
      "g3",
      "p"
    ]);
    expect(drop(incoming, { kind: "file", id: "g3", zone: "before" })?.orderedIds).toEqual([
      "g1",
      "g2",
      "p",
      "g3"
    ]);
  });

  it("appends on a folder row, whose zones carry no file position", () => {
    for (const zone of ["into", "before", "after"] as const) {
      // `m1`'s parent is `m`, so before/after land in the same folder as `into m`.
      const target = zone === "into" ? { kind: "folder" as const, id: "m", zone } : { kind: "folder" as const, id: "m1", zone };
      expect(drop(incoming, target)?.orderedIds).toEqual(["g1", "g2", "g3", "p"]);
    }
  });

  it("reorders within one folder without double-counting the moved row", () => {
    expect(drop({ kind: "file", id: "g3" }, { kind: "file", id: "g1", zone: "before" })).toEqual({
      folderId: "m",
      orderedIds: ["g3", "g1", "g2"],
      movedId: "g3"
    });
    expect(drop({ kind: "file", id: "g1" }, { kind: "file", id: "g3", zone: "after" })?.orderedIds).toEqual([
      "g2",
      "g3",
      "g1"
    ]);
  });

  it("rejects a same-folder drop that lands on the position it already holds", () => {
    expect(drop({ kind: "file", id: "g1" }, { kind: "file", id: "g2", zone: "before" })).toBeNull();
    expect(drop({ kind: "file", id: "g2" }, { kind: "file", id: "g1", zone: "after" })).toBeNull();
    // Onto its own row, and onto the folder it already lives in.
    expect(drop({ kind: "file", id: "g2" }, { kind: "file", id: "g2", zone: "after" })).toBeNull();
    expect(drop({ kind: "file", id: "g1" }, { kind: "folder", id: "m", zone: "into" })).toBeNull();
  });
});
