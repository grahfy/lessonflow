import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as materialsGET } from "@/app/api/admin/customers/[id]/learning-materials/route";
import { PATCH as reorderPATCH } from "@/app/api/admin/learning-materials/reorder/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

type MaterialRow = { id: string; folderId: string | null; sortOrder: number };

describe("material-reorder", () => {
  beforeEach(async () => {
    await prisma.libraryAssignment.deleteMany();
    await prisma.libraryItemTag.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.studentMaterialFolder.deleteMany();
    await prisma.adminUser.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  let uniqueCounter = 0;

  async function createCustomer(name: string, email: string, phone: string, primaryTeacherId?: string | null) {
    return prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name,
          email,
          phone,
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "12",
          streetName: "Smith",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070"
        }),
        primaryTeacherId: primaryTeacherId ?? null
      }
    });
  }

  async function createTeacher(email: string, displayName: string) {
    return prisma.adminUser.create({
      data: {
        email,
        role: "teacher",
        firstName: displayName,
        lastName: "Teacher",
        displayName,
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });
  }

  async function createBooking(customerId: string, email: string, assignedTeacherId: string | null) {
    return prisma.booking.create({
      data: {
        name: "Lesson Student",
        email,
        phone: "0400100999",
        address: "12 Smith Street, Northcote VIC 3070",
        houseNumber: "12",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-07-01T09:00:00.000Z"),
        endAt: new Date("2026-07-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId,
        assignedTeacherId
      }
    });
  }

  /**
   * `createdAt` is explicit so the all-zero `sortOrder` baseline has a
   * deterministic `createdAt desc` order rather than depending on insert timing.
   */
  async function createMaterial(options: {
    customerId: string;
    folderId?: string | null;
    bookingId?: string | null;
    title: string;
    createdAt: string;
  }) {
    uniqueCounter += 1;
    return prisma.learningMaterial.create({
      data: {
        customerId: options.customerId,
        folderId: options.folderId ?? null,
        bookingId: options.bookingId ?? null,
        title: options.title,
        description: null,
        materialType: "pdf",
        storageKey: `${options.customerId}/reorder-${uniqueCounter}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        createdAt: new Date(options.createdAt)
      }
    });
  }


  /** A LibraryItem assigned to `customerId`. Returns the `lib:` tree id. */
  async function assignLibraryItem(customerId: string, title: string, createdAt: string) {
    uniqueCounter += 1;
    const item = await prisma.libraryItem.create({
      data: {
        title,
        description: null,
        materialType: "pdf",
        storageKey: `library/reorder-${uniqueCounter}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 2048
      }
    });
    await prisma.libraryAssignment.create({
      data: { libraryItemId: item.id, customerId, createdAt: new Date(createdAt) }
    });
    return { item, treeId: `lib:${item.id}` };
  }

  async function createFolder(customerId: string, name: string) {
    return prisma.studentMaterialFolder.create({
      data: { customerId, name, parentId: null }
    });
  }

  async function ownerCookie() {
    const admin = await ensureOwnerAdmin();
    return { admin, cookie: `${getSessionCookieName()}=${createSessionToken(admin.email)}` };
  }

  function reorderRequest(cookie: string | null, body: unknown) {
    return new NextRequest("http://localhost/api/admin/learning-materials/reorder", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify(body)
    });
  }

  /** Full ordering state, used to prove a rejected request wrote nothing. */
  async function snapshot(): Promise<MaterialRow[]> {
    const rows = await prisma.learningMaterial.findMany({
      select: { id: true, folderId: true, sortOrder: true },
      orderBy: { id: "asc" }
    });
    return rows;
  }

  async function libSnapshot() {
    return prisma.libraryAssignment.findMany({
      select: { libraryItemId: true, folderId: true, sortOrder: true },
      orderBy: { libraryItemId: "asc" }
    });
  }

  async function adminMaterialIds(customerId: string, cookie: string): Promise<string[]> {
    const response = await materialsGET(
      new NextRequest(`http://localhost/api/admin/customers/${customerId}/learning-materials`, {
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: customerId }) }
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { materials: { id: string; sortOrder: number }[] };
    return payload.materials.map((material) => material.id);
  }

  /** Three root-folder materials whose baseline order is exactly [a, b, c]. */
  async function seedFolderOfThree(customerId: string) {
    const folder = await createFolder(customerId, "Scales");
    const a = await createMaterial({
      customerId,
      folderId: folder.id,
      title: "A",
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const b = await createMaterial({
      customerId,
      folderId: folder.id,
      title: "B",
      createdAt: "2026-05-02T10:00:00.000Z"
    });
    const c = await createMaterial({
      customerId,
      folderId: folder.id,
      title: "C",
      createdAt: "2026-05-01T10:00:00.000Z"
    });
    return { folder, a, b, c };
  }

  it("persists a new order across a fresh admin GET", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Order Student", "order@example.com", "0400200001");
    const { folder, a, b, c } = await seedFolderOfThree(customer.id);

    expect(await adminMaterialIds(customer.id, cookie)).toEqual([a.id, b.id, c.id]);

    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: c.id,
        orderedIds: [c.id, a.id, b.id]
      })
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { materials: MaterialRow[] };
    expect(payload.materials).toEqual([
      { id: c.id, folderId: folder.id, sortOrder: 1 },
      { id: a.id, folderId: folder.id, sortOrder: 2 },
      { id: b.id, folderId: folder.id, sortOrder: 3 }
    ]);

    expect(await adminMaterialIds(customer.id, cookie)).toEqual([c.id, a.id, b.id]);
  });

  it("a newly uploaded file lands at the TOP of a reordered folder (unpinned-above-pinned)", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Unpinned Student", "unpinned@example.com", "0400200002");
    const { folder, a, b, c } = await seedFolderOfThree(customer.id);

    await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: c.id,
        orderedIds: [c.id, a.id, b.id]
      })
    );

    const fresh = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      title: "Fresh",
      createdAt: "2026-06-01T10:00:00.000Z"
    });

    expect(await adminMaterialIds(customer.id, cookie)).toEqual([fresh.id, c.id, a.id, b.id]);
  });

  it("a material id belonging to another customer -> 404 and zero rows changed", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Own Student", "own@example.com", "0400200003");
    const stranger = await createCustomer("Other Student", "other@example.com", "0400200004");
    const { folder, a, b } = await seedFolderOfThree(customer.id);
    const foreign = await createMaterial({
      customerId: stranger.id,
      title: "Foreign",
      createdAt: "2026-05-01T10:00:00.000Z"
    });

    const before = await snapshot();
    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: foreign.id,
        orderedIds: [foreign.id, a.id, b.id]
      })
    );
    expect(response.status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });

  it("a destination folder belonging to another customer -> 400 CROSS_CUSTOMER and zero rows changed", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Own Student", "own2@example.com", "0400200005");
    const stranger = await createCustomer("Other Student", "other2@example.com", "0400200006");
    const { a, b, c } = await seedFolderOfThree(customer.id);
    const foreignFolder = await createFolder(stranger.id, "Not Yours");

    const before = await snapshot();
    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: foreignFolder.id,
        movedId: a.id,
        orderedIds: [a.id, b.id, c.id]
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()) as { code?: string }).toMatchObject({ code: "CROSS_CUSTOMER" });
    expect(await snapshot()).toEqual(before);
  });

  it("a sibling that moved out concurrently -> 409 and no revert", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Stale Student", "stale@example.com", "0400200007");
    const { folder, a, b, c } = await seedFolderOfThree(customer.id);
    const elsewhere = await createFolder(customer.id, "Elsewhere");

    // Another client moves C out from under the first client's snapshot.
    await prisma.learningMaterial.update({
      where: { id: c.id },
      data: { folderId: elsewhere.id, sortOrder: 0 }
    });

    const before = await snapshot();
    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: null,
        orderedIds: [b.id, a.id, c.id]
      })
    );
    expect(response.status).toBe(409);
    expect((await response.json()) as { code?: string }).toMatchObject({ code: "STALE_ORDER" });

    // C is NOT yanked back into the original folder.
    expect(await snapshot()).toEqual(before);
    const reloaded = await prisma.learningMaterial.findUnique({ where: { id: c.id } });
    expect(reloaded?.folderId).toBe(elsewhere.id);
  });

  it("two clients ordering the same set differently -> the second gets 409", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Race Student", "race@example.com", "0400200008");
    const { folder, a, b, c } = await seedFolderOfThree(customer.id);

    const first = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: c.id,
        orderedIds: [c.id, a.id, b.id]
      })
    );
    expect(first.status).toBe(200);

    // The second client is still working from the pre-drop view [a, b, c].
    const afterFirst = await snapshot();
    const second = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: b.id,
        orderedIds: [b.id, a.id, c.id]
      })
    );
    expect(second.status).toBe(409);
    expect(await snapshot()).toEqual(afterFirst);
  });

  it("INV-4: a booking-linked SIBLING owned by another teacher -> 403 and zero writes", async () => {
    const teacherA = await createTeacher("teacher-a@example.com", "Ada");
    const teacherB = await createTeacher("teacher-b@example.com", "Bo");
    const customer = await createCustomer("Inv4 Student", "inv4@example.com", "0400200009", teacherA.id);
    const folder = await createFolder(customer.id, "Shared");
    const booking = await createBooking(customer.id, "inv4@example.com", teacherB.id);

    const mine = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      title: "Mine",
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const theirs = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      bookingId: booking.id,
      title: "Theirs",
      createdAt: "2026-05-02T10:00:00.000Z"
    });

    const before = await snapshot();
    const response = await reorderPATCH(
      reorderRequest(`${getSessionCookieName()}=${createSessionToken(teacherA.email)}`, {
        customerId: customer.id,
        folderId: folder.id,
        // `movedId` is teacher A's OWN material; the violation is the sibling.
        movedId: mine.id,
        orderedIds: [theirs.id, mine.id]
      })
    );
    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it("unauthenticated -> 401", async () => {
    const customer = await createCustomer("Anon Student", "anon@example.com", "0400200010");
    const { folder, a } = await seedFolderOfThree(customer.id);

    const response = await reorderPATCH(
      reorderRequest(null, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: a.id,
        orderedIds: [a.id]
      })
    );
    expect(response.status).toBe(401);
  });

  it("201 ids -> 400", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Cap Student", "cap@example.com", "0400200011");
    const folder = await createFolder(customer.id, "Big");

    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: null,
        orderedIds: Array.from({ length: 201 }, (_, index) => `mat_${index}`)
      })
    );
    expect(response.status).toBe(400);
  });

  it("a lib: key dragged into a folder persists on LibraryAssignment, no blob copy", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Lib Student", "lib@example.com", "0400200012");
    const folder = await createFolder(customer.id, "Repertoire");
    const { item, treeId } = await assignLibraryItem(customer.id, "Shared Tab", "2026-05-01T10:00:00.000Z");

    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: treeId,
        orderedIds: [treeId]
      })
    );
    expect(response.status).toBe(200);

    const assignment = await prisma.libraryAssignment.findFirstOrThrow({
      where: { libraryItemId: item.id, customerId: customer.id }
    });
    expect(assignment.folderId).toBe(folder.id);
    expect(assignment.sortOrder).toBe(1);

    // The shared master is untouched: one row, same storageKey, no per-student copy.
    expect(await prisma.libraryItem.count()).toBe(1);
    expect((await prisma.libraryItem.findFirstOrThrow()).storageKey).toBe(item.storageKey);
  });

  it("a mixed material + lib: order interleaves identically on the admin GET", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Mix Student", "mix@example.com", "0400200013");
    const folder = await createFolder(customer.id, "Mixed");
    const a = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      title: "A",
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const { treeId } = await assignLibraryItem(customer.id, "Shared", "2026-05-02T10:00:00.000Z");
    const b = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      title: "B",
      createdAt: "2026-05-01T10:00:00.000Z"
    });

    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: treeId,
        // Baseline is already [a, lib, b], so asserting that back proves nothing
        // — an unwritten table produces it too. Send an order the baseline
        // CANNOT produce. Non-moved siblings keep [a, b] so staleness passes.
        orderedIds: [a.id, b.id, treeId]
      })
    );
    expect(response.status).toBe(200);

    expect(await adminMaterialIds(customer.id, cookie)).toEqual([a.id, b.id, treeId]);
  });

  it("a stale MIXED sibling list -> 409 and zero rows changed in either table", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Stale Mix", "stalemix@example.com", "0400200014");
    const folder = await createFolder(customer.id, "Mixed");
    const a = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      title: "A",
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const b = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      title: "B",
      createdAt: "2026-05-01T10:00:00.000Z"
    });
    const { treeId } = await assignLibraryItem(customer.id, "Shared", "2026-05-02T10:00:00.000Z");
    await prisma.libraryAssignment.updateMany({ data: { folderId: folder.id } });

    // Baseline merged order is [a, lib, b] (all sortOrder 0, createdAt desc).
    expect(await adminMaterialIds(customer.id, cookie)).toEqual([a.id, treeId, b.id]);

    // First client drags B to the front.
    expect(
      (await reorderPATCH(
        reorderRequest(cookie, {
          customerId: customer.id,
          folderId: folder.id,
          movedId: b.id,
          orderedIds: [b.id, a.id, treeId]
        })
      )).status
    ).toBe(200);

    const afterFirst = await snapshot();
    const afterFirstLib = await libSnapshot();

    // Second client is still on the pre-drop view [a, lib, b]: its non-moved
    // siblings read [a, b], but the server now holds [b, a].
    const second = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: treeId,
        orderedIds: [a.id, treeId, b.id]
      })
    );
    expect(second.status).toBe(409);
    expect(await snapshot()).toEqual(afterFirst);
    expect(await libSnapshot()).toEqual(afterFirstLib);
  });

  it("deleting the LibraryItem drops the row from the tree without touching sibling sortOrder", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Del Student", "del@example.com", "0400200015");
    const folder = await createFolder(customer.id, "Mixed");
    const a = await createMaterial({
      customerId: customer.id,
      folderId: folder.id,
      title: "A",
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const { item, treeId } = await assignLibraryItem(customer.id, "Shared", "2026-05-02T10:00:00.000Z");

    await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: treeId,
        orderedIds: [treeId, a.id]
      })
    );
    expect(await adminMaterialIds(customer.id, cookie)).toEqual([treeId, a.id]);

    const materialsBefore = await snapshot();
    await prisma.libraryItem.delete({ where: { id: item.id } });

    expect(await adminMaterialIds(customer.id, cookie)).toEqual([a.id]);
    // The cascade removed only the join row; sibling order keys are untouched.
    expect(await snapshot()).toEqual(materialsBefore);
  });

  it("CONCURRENT: two overlapping reorders of the same folder -> exactly one 200, one 409", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Race2 Student", "race2@example.com", "0400200016");
    const { folder, a, b, c } = await seedFolderOfThree(customer.id);

    // Both requests are in flight before either commits. The FOR UPDATE lock in
    // reorderMaterials is what serializes them; without it both pass their
    // staleness check and the last writer silently wins.
    const [first, second] = await Promise.all([
      reorderPATCH(
        reorderRequest(cookie, {
          customerId: customer.id,
          folderId: folder.id,
          movedId: c.id,
          orderedIds: [c.id, a.id, b.id]
        })
      ),
      reorderPATCH(
        reorderRequest(cookie, {
          customerId: customer.id,
          folderId: folder.id,
          movedId: a.id,
          orderedIds: [a.id, b.id, c.id]
        })
      )
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("CONCURRENT: a reorder cannot resurrect a material another client moved out", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Resurrect", "resurrect@example.com", "0400200017");
    const { folder, a, b, c } = await seedFolderOfThree(customer.id);
    const elsewhere = await createFolder(customer.id, "Elsewhere");

    // Client A moves C out; client B reorders the folder believing C is still in
    // it. B's CASE update sets folderId unconditionally, so without the lock it
    // would drag C back into `folder`.
    const [, reorder] = await Promise.all([
      reorderPATCH(
        reorderRequest(cookie, {
          customerId: customer.id,
          folderId: elsewhere.id,
          movedId: c.id,
          orderedIds: [c.id]
        })
      ),
      reorderPATCH(
        reorderRequest(cookie, {
          customerId: customer.id,
          folderId: folder.id,
          movedId: b.id,
          orderedIds: [b.id, a.id, c.id]
        })
      )
    ]);

    const reloaded = await prisma.learningMaterial.findUniqueOrThrow({ where: { id: c.id } });
    if (reorder.status === 200) {
      // Only legal if the reorder committed FIRST; C then still ends up moved out.
      expect(reloaded.folderId).toBe(elsewhere.id);
    } else {
      expect(reorder.status).toBe(409);
      expect(reloaded.folderId).toBe(elsewhere.id);
    }
  });

  it("a material moved in from another folder lands at the REQUESTED position, not appended", async () => {
    // The client bug this guards: `orderedIds` was re-derived as
    // [...siblings, movedId], so every drop landed at the bottom regardless of
    // where the insertion affordance pointed. A test that only checks the
    // destination folder passes with that bug present.
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Between Student", "between@example.com", "0400200018");
    const { folder, a, b, c } = await seedFolderOfThree(customer.id);
    const other = await createFolder(customer.id, "Other");
    const incoming = await createMaterial({
      customerId: customer.id,
      folderId: other.id,
      title: "Incoming",
      createdAt: "2026-05-04T10:00:00.000Z"
    });

    const response = await reorderPATCH(
      reorderRequest(cookie, {
        customerId: customer.id,
        folderId: folder.id,
        movedId: incoming.id,
        // Dropped BETWEEN a and b.
        orderedIds: [a.id, incoming.id, b.id, c.id]
      })
    );
    expect(response.status).toBe(200);

    expect(await adminMaterialIds(customer.id, cookie)).toEqual([a.id, incoming.id, b.id, c.id]);
    // Explicitly not last — the exact symptom of the dropped `orderedIds`.
    expect((await adminMaterialIds(customer.id, cookie)).at(-1)).not.toBe(incoming.id);
  });
});
