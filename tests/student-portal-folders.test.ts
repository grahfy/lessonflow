import { describe, expect, it } from "vitest";

import {
  assertNoCycle,
  assertSameCustomerFolder,
  assertUniqueSiblingName,
  buildFolderTree,
  deriveLessonFolderName,
  FolderValidationError,
  LESSONS_PARENT_FOLDER_NAME,
  normalizeFolderName,
  relocateChildrenToParent,
  type FolderNode
} from "@/lib/student-portal/folders";

function folder(partial: Partial<FolderNode> & Pick<FolderNode, "id">): FolderNode {
  return {
    customerId: "cust-1",
    parentId: null,
    name: partial.id,
    sourceBookingId: null,
    ...partial
  };
}

describe("normalizeFolderName", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeFolderName("  My   Folder ")).toBe("my folder");
    expect(normalizeFolderName("LESSONS")).toBe("lessons");
  });
});

describe("assertUniqueSiblingName (INV-1)", () => {
  const siblings: FolderNode[] = [
    folder({ id: "a", name: "Scales", parentId: "root" }),
    folder({ id: "b", name: "Songs", parentId: "root" })
  ];

  it("returns the trimmed name when unique", () => {
    expect(
      assertUniqueSiblingName({ name: "  Theory  ", customerId: "cust-1", parentId: "root", siblings })
    ).toBe("Theory");
  });

  it("rejects empty names", () => {
    expect(() =>
      assertUniqueSiblingName({ name: "   ", customerId: "cust-1", parentId: "root", siblings })
    ).toThrowError(FolderValidationError);
  });

  it("rejects names over 255 chars", () => {
    expect(() =>
      assertUniqueSiblingName({
        name: "x".repeat(256),
        customerId: "cust-1",
        parentId: "root",
        siblings
      })
    ).toThrowError(/255/);
  });

  it("rejects case/whitespace-insensitive duplicate siblings", () => {
    expect(() =>
      assertUniqueSiblingName({ name: "  scales ", customerId: "cust-1", parentId: "root", siblings })
    ).toThrowError(/already exists/);
  });

  it("allows the same name under a different parent", () => {
    expect(
      assertUniqueSiblingName({ name: "Scales", customerId: "cust-1", parentId: "other", siblings })
    ).toBe("Scales");
  });

  it("allows renaming a folder to its own current name (excludeId)", () => {
    expect(
      assertUniqueSiblingName({
        name: "Scales",
        customerId: "cust-1",
        parentId: "root",
        siblings,
        excludeId: "a"
      })
    ).toBe("Scales");
  });
});

describe("assertNoCycle (INV-2)", () => {
  // root -> mid -> leaf
  const folders: FolderNode[] = [
    folder({ id: "root", parentId: null }),
    folder({ id: "mid", parentId: "root" }),
    folder({ id: "leaf", parentId: "mid" })
  ];

  it("allows moving to root (null parent)", () => {
    expect(() => assertNoCycle("mid", null, folders)).not.toThrow();
  });

  it("hard-rejects the self-parent case", () => {
    expect(() => assertNoCycle("mid", "mid", folders)).toThrowError(/own parent/);
  });

  it("rejects moving a folder into its own descendant", () => {
    expect(() => assertNoCycle("root", "leaf", folders)).toThrowError(/descendant/);
  });

  it("allows a legitimate move into an unrelated subtree", () => {
    const extra = [...folders, folder({ id: "other", parentId: "root" })];
    expect(() => assertNoCycle("leaf", "other", extra)).not.toThrow();
  });
});

describe("assertSameCustomerFolder (INV-3)", () => {
  it("permits a null target (move to root)", () => {
    expect(() => assertSameCustomerFolder("cust-1", null)).not.toThrow();
  });

  it("permits a same-customer target", () => {
    expect(() => assertSameCustomerFolder("cust-1", { customerId: "cust-1" })).not.toThrow();
  });

  it("rejects a cross-customer target", () => {
    expect(() => assertSameCustomerFolder("cust-1", { customerId: "cust-2" })).toThrowError(
      /different customer/
    );
  });
});

describe("buildFolderTree", () => {
  it("nests children under parents and attaches material ids", () => {
    const folders: FolderNode[] = [
      folder({ id: "root", parentId: null, name: "Root" }),
      folder({ id: "child", parentId: "root", name: "Child" })
    ];
    const materials = new Map<string | null, string[]>([
      ["root", ["m1"]],
      ["child", ["m2", "m3"]]
    ]);
    const tree = buildFolderTree(folders, materials);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].materialIds).toEqual(["m1"]);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("child");
    expect(tree[0].children[0].materialIds).toEqual(["m2", "m3"]);
  });

  it("treats a stray parentId as a root node (graceful degradation)", () => {
    const folders: FolderNode[] = [folder({ id: "orphan", parentId: "ghost" })];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("orphan");
  });

  it("sorts siblings by name", () => {
    const folders: FolderNode[] = [
      folder({ id: "z", parentId: null, name: "Zebra" }),
      folder({ id: "a", parentId: null, name: "Apple" })
    ];
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.name)).toEqual(["Apple", "Zebra"]);
  });
});

describe("relocateChildrenToParent (AC-4)", () => {
  it("moves direct children and materials up to the folder's parent", () => {
    const folders: FolderNode[] = [
      folder({ id: "target", parentId: "grandparent" }),
      folder({ id: "childFolder", parentId: "target" }),
      folder({ id: "unrelated", parentId: "grandparent" })
    ];
    const result = relocateChildrenToParent(
      { id: "target", parentId: "grandparent" },
      folders,
      ["mat-1", "mat-2"]
    );
    expect(result.newParentId).toBe("grandparent");
    expect(result.childFolderIds).toEqual(["childFolder"]);
    expect(result.materialIds).toEqual(["mat-1", "mat-2"]);
  });

  it("relocates to root when the deleted folder is top-level", () => {
    const folders: FolderNode[] = [folder({ id: "target", parentId: null })];
    const result = relocateChildrenToParent({ id: "target", parentId: null }, folders, []);
    expect(result.newParentId).toBeNull();
    expect(result.childFolderIds).toEqual([]);
  });
});

describe("deriveLessonFolderName (AC-14)", () => {
  it("formats a date (APP_TIMEZONE) plus the lesson mode label", () => {
    const name = deriveLessonFolderName({ startAt: "2026-03-14T03:00:00.000Z", lessonMode: "in_person" });
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2} · In-person lesson$/);
  });

  it("labels video lessons", () => {
    const name = deriveLessonFolderName({ startAt: "2026-03-14T03:00:00.000Z", lessonMode: "video" });
    expect(name).toContain("Video lesson");
  });

  it("exposes the canonical Lessons parent name", () => {
    expect(LESSONS_PARENT_FOLDER_NAME).toBe("Lessons");
  });
});
