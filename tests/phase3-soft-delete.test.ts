import { describe, expect, it } from "vitest";

import { activeWhere, excludeArchived, excludeDeleted } from "@/lib/db/soft-delete";

/**
 * Unit tests for the Phase 3 soft-delete `where`-clause helpers
 * (src/lib/db/soft-delete.ts). These document the convention: `isArchived`
 * models vs the financial `isDeleted` (Invoice) flag. The helpers must produce
 * exactly the right fragment so call sites stay consistent and greppable.
 */
describe("phase3-soft-delete helpers", () => {
  it("excludeArchived() targets isArchived: false", () => {
    expect(excludeArchived()).toEqual({ isArchived: false });
  });

  it("excludeDeleted() targets isDeleted: false (Invoice column)", () => {
    expect(excludeDeleted()).toEqual({ isDeleted: false });
  });

  it("activeWhere() is an alias of excludeArchived()", () => {
    expect(activeWhere()).toEqual({ isArchived: false });
    expect(activeWhere()).toEqual(excludeArchived());
  });

  it("excludeArchived and excludeDeleted target distinct columns", () => {
    expect(Object.keys(excludeArchived())).toEqual(["isArchived"]);
    expect(Object.keys(excludeDeleted())).toEqual(["isDeleted"]);
  });

  it("returns fresh objects safe to spread into a where clause", () => {
    const where = { ...excludeArchived(), email: "a@b.com" };
    expect(where).toEqual({ isArchived: false, email: "a@b.com" });

    // Mutating the spread result must not affect a subsequent helper call.
    where.isArchived = true as unknown as false;
    expect(excludeArchived()).toEqual({ isArchived: false });
  });
});
