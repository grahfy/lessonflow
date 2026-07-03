import { describe, expect, it } from "vitest";

import {
  canAssignLibraryItem,
  canManageAssignedTeacher,
  canManageLibrary,
  canManagePrimaryTeacherCustomer,
  type AdminPermissionActor
} from "@/lib/admin/permissions";
import { buildLibrarySearchWhere } from "@/lib/library/library-search";
import { buildLearningMaterialStorageKey, buildLibraryItemStorageKey } from "@/lib/student-portal/materials";

/**
 * Pure-unit coverage for the Library's security- and correctness-critical helpers.
 * No DB or filesystem: these are the isolated contracts behind AC3/AC3b (search),
 * AC14 (storage-key namespace isolation), and AC7/AC13 (permission helpers).
 */
describe("library-search / buildLibrarySearchWhere", () => {
  it("AND-combines one existence probe per selected category (never a top-level OR)", () => {
    const where = buildLibrarySearchWhere({
      tagFilters: [
        { category: "Decade", value: "80s" },
        { category: "Style", value: "Rock" },
        { category: "Key", value: "Drop-D" }
      ]
    });

    // Top-level shape is a discrete AND of independent clauses — no top-level OR
    // that could widen past the category intersection (AC3 / pre-mortem S3).
    expect(where).toHaveProperty("AND");
    expect(where).not.toHaveProperty("OR");
    const and = (where as { AND: unknown[] }).AND;
    expect(Array.isArray(and)).toBe(true);
    expect(and).toHaveLength(3);
    // Each category is its OWN `tags.some` clause (logical AND across categories),
    // not a single `some` with an `in` list (which would be OR).
    expect(and).toEqual([
      { tags: { some: { tag: { category: "Decade", value: "80s" } } } },
      { tags: { some: { tag: { category: "Style", value: "Rock" } } } },
      { tags: { some: { tag: { category: "Key", value: "Drop-D" } } } }
    ]);
  });

  it("returns {} (match all) when there are no facets and no query", () => {
    expect(buildLibrarySearchWhere({ tagFilters: [] })).toEqual({});
    expect(buildLibrarySearchWhere({ tagFilters: [], q: "   " })).toEqual({});
  });

  it("nests the free-text q as a discrete AND element (title OR Artist tag)", () => {
    const where = buildLibrarySearchWhere({ tagFilters: [], q: "Hendrix" });
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { title: { contains: "Hendrix" } },
            { tags: { some: { tag: { category: "Artist", value: { contains: "Hendrix" } } } } }
          ]
        }
      ]
    });
  });

  it("AC3b: q can only NARROW within the facet intersection, never widen it", () => {
    const where = buildLibrarySearchWhere({
      tagFilters: [{ category: "Style", value: "Rock" }],
      q: "Some Title"
    });

    // The category clause and the q-OR clause are SIBLINGS inside a single AND, so
    // an item that matches the title but LACKS the Rock tag is still excluded: the
    // category constraint must also hold. There is no top-level OR.
    expect(where).not.toHaveProperty("OR");
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(2);
    expect(and[0]).toEqual({ tags: { some: { tag: { category: "Style", value: "Rock" } } } });
    expect(and[1]).toHaveProperty("OR");
    // The Rock facet is a top-level AND sibling — it constrains the whole result.
    expect(and).toContainEqual({ tags: { some: { tag: { category: "Style", value: "Rock" } } } });
  });

  it("OR-combines multiple values within the SAME category via `value: { in: [...] }`", () => {
    const where = buildLibrarySearchWhere({
      tagFilters: [
        { category: "Decade", value: "80s" },
        { category: "Decade", value: "90s" }
      ]
    });

    // A single category with two picked values collapses to ONE existence probe
    // whose value is an OR-list — an item in EITHER decade matches (union), and
    // there is still no top-level OR that could bypass a cross-category AND.
    expect(where).not.toHaveProperty("OR");
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(1);
    expect(and[0]).toEqual({
      tags: { some: { tag: { category: "Decade", value: { in: ["80s", "90s"] } } } }
    });
  });

  it("keeps DISTINCT categories as separate AND probes (union within, intersection across)", () => {
    const where = buildLibrarySearchWhere({
      tagFilters: [
        { category: "Decade", value: "80s" },
        { category: "Decade", value: "90s" },
        { category: "Style", value: "Rock" }
      ]
    });

    // Two Decade values OR into one probe; the Style probe is a separate AND
    // sibling — so an item must be (80s OR 90s) AND Rock.
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(2);
    expect(and).toContainEqual({
      tags: { some: { tag: { category: "Decade", value: { in: ["80s", "90s"] } } } }
    });
    expect(and).toContainEqual({ tags: { some: { tag: { category: "Style", value: "Rock" } } } });
  });

  it("AC3b holds for same-category OR combined with q: q still cannot widen past the facets", () => {
    const where = buildLibrarySearchWhere({
      tagFilters: [
        { category: "Style", value: "Rock" },
        { category: "Style", value: "Blues" }
      ],
      q: "Sunshine"
    });

    // The (Rock OR Blues) probe and the q-OR clause are siblings inside one AND,
    // so a title matching "Sunshine" that carries NEITHER style is still excluded.
    expect(where).not.toHaveProperty("OR");
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(2);
    expect(and).toContainEqual({
      tags: { some: { tag: { category: "Style", value: { in: ["Rock", "Blues"] } } } }
    });
    expect(and[1]).toHaveProperty("OR");
  });

  it("de-duplicates repeated values within a category", () => {
    const where = buildLibrarySearchWhere({
      tagFilters: [
        { category: "Decade", value: "80s" },
        { category: "Decade", value: "80s" }
      ]
    });
    // A repeated pick collapses back to a single-value equality probe.
    expect(where).toEqual({
      AND: [{ tags: { some: { tag: { category: "Decade", value: "80s" } } } }]
    });
  });

  it("escapes SQL LIKE wildcards in q so `%` and `_` match literally (no injection, no wildcard)", () => {
    const where = buildLibrarySearchWhere({ tagFilters: [{ category: "Style", value: "Rock" }], q: "50% o_o" });
    const and = (where as { AND: Array<{ OR?: Array<{ title?: { contains: string } }> }> }).AND;
    const orClause = and.find((clause) => clause.OR);
    // `%` → `\%`, `_` → `\_`: the raw wildcards never reach the LIKE unescaped.
    expect(orClause?.OR?.[0]).toEqual({ title: { contains: "50\\% o\\_o" } });
  });

  it("escapes a literal backslash before the wildcards (no double-escaping of the escape char)", () => {
    const where = buildLibrarySearchWhere({ tagFilters: [], q: "a\\b%c" });
    const and = (where as { AND: Array<{ OR?: Array<{ title?: { contains: string } }> }> }).AND;
    // `\` → `\\`, `%` → `\%`, single-pass so each source char is escaped once.
    expect(and[0].OR?.[0]).toEqual({ title: { contains: "a\\\\b\\%c" } });
  });

  it("passes non-wildcard special characters through unchanged", () => {
    const q = "AC/DC \"live\" o'clock";
    const where = buildLibrarySearchWhere({ tagFilters: [{ category: "Style", value: "Rock" }], q });
    const and = (where as { AND: Array<{ OR?: Array<{ title?: { contains: string } }> }> }).AND;
    const orClause = and.find((clause) => clause.OR);
    // No `%`, `_`, or `\` in this query → contains matches the raw text verbatim.
    expect(orClause?.OR?.[0]).toEqual({ title: { contains: q } });
  });

  it("trims the query before deciding whether it is present", () => {
    const where = buildLibrarySearchWhere({ tagFilters: [], q: "  Nirvana  " });
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { title: { contains: "Nirvana" } },
            { tags: { some: { tag: { category: "Artist", value: { contains: "Nirvana" } } } } }
          ]
        }
      ]
    });
  });
});

describe("library storage-key namespace isolation (AC14)", () => {
  it("always prefixes the isolated `library/` namespace and keeps the extension", () => {
    const key = buildLibraryItemStorageKey({ extension: ".mp3" });
    expect(key.startsWith("library/")).toBe(true);
    expect(key.split("/")[0]).toBe("library");
    expect(key.endsWith(".mp3")).toBe(true);
  });

  it("produces a unique key per call", () => {
    const a = buildLibraryItemStorageKey({ extension: ".pdf" });
    const b = buildLibraryItemStorageKey({ extension: ".pdf" });
    expect(a).not.toBe(b);
  });

  it("never collides with a customer-scoped key (which starts with the customerId)", () => {
    const customerId = "cmxexamplecustomerid00000";
    const customerKey = buildLearningMaterialStorageKey({ customerId, extension: ".mp3" });
    const libraryKey = buildLibraryItemStorageKey({ extension: ".mp3" });

    // A customer key's first path segment is the customerId; a library key's is the
    // literal `library`. The two namespaces cannot intersect.
    expect(customerKey.split("/")[0]).toBe(customerId);
    expect(libraryKey.split("/")[0]).toBe("library");
    expect(libraryKey.startsWith(`${customerId}/`)).toBe(false);
  });
});

describe("library permission helpers (AC7 / AC13)", () => {
  const owner: AdminPermissionActor = { id: "owner-1", role: "owner" };
  const teacher: AdminPermissionActor = { id: "teacher-1", role: "teacher" };

  it("canManageLibrary returns true for owner and any teacher", () => {
    expect(canManageLibrary(owner)).toBe(true);
    expect(canManageLibrary(teacher)).toBe(true);
  });

  it("canAssignLibraryItem returns true for owner and any teacher", () => {
    expect(canAssignLibraryItem(owner)).toBe(true);
    expect(canAssignLibraryItem(teacher)).toBe(true);
  });

  it("does NOT widen the existing per-customer scoping predicates (AC13 snapshot)", () => {
    // The additive library helpers must not have altered the two-tier per-customer
    // gates: a non-owning teacher is still denied a customer they don't manage.
    expect(canManagePrimaryTeacherCustomer(teacher, "other-teacher")).toBe(false);
    expect(canManagePrimaryTeacherCustomer(teacher, teacher.id)).toBe(true);
    expect(canManagePrimaryTeacherCustomer(owner, null)).toBe(true);

    expect(canManageAssignedTeacher(teacher, "other-teacher")).toBe(false);
    expect(canManageAssignedTeacher(teacher, teacher.id)).toBe(true);
    expect(canManageAssignedTeacher(owner, null)).toBe(true);
  });
});
