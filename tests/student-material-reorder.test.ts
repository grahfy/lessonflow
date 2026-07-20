import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as portalGET } from "@/app/api/student/portal/route";
import { PATCH as studentReorderPATCH } from "@/app/api/student/learning-materials/reorder/route";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

type Snapshot = { id: string; folderId: string | null; sortOrder: number }[];

describe("student-material-reorder", () => {
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

  let counter = 0;

  async function createStudent(name: string, email: string, phone: string) {
    return prisma.customer.create({
      data: customerSnapshotFromInput({
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
      })
    });
  }

  async function createMaterial(options: {
    customerId: string;
    folderId?: string | null;
    bookingId?: string | null;
    title: string;
    createdAt: string;
  }) {
    counter += 1;
    return prisma.learningMaterial.create({
      data: {
        customerId: options.customerId,
        folderId: options.folderId ?? null,
        bookingId: options.bookingId ?? null,
        title: options.title,
        description: null,
        materialType: "pdf",
        storageKey: `${options.customerId}/student-reorder-${counter}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        createdAt: new Date(options.createdAt)
      }
    });
  }

  function cookieFor(customerId: string) {
    return `${getStudentSessionCookieName()}=${createStudentSessionToken(customerId)}`;
  }

  function reorderRequest(cookie: string | null, body: unknown, contentType = "application/json") {
    return new NextRequest("http://localhost/api/student/learning-materials/reorder", {
      method: "PATCH",
      headers: { "content-type": contentType, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });
  }

  async function snapshot(): Promise<Snapshot> {
    return prisma.learningMaterial.findMany({
      select: { id: true, folderId: true, sortOrder: true },
      orderBy: { id: "asc" }
    });
  }

  /** Standalone material ids in the order the portal actually returns them. */
  async function portalStandaloneIds(cookie: string): Promise<string[]> {
    const response = await portalGET(
      new NextRequest("http://localhost/api/student/portal", { headers: { cookie } })
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { standaloneMaterials: { id: string }[] };
    return payload.standaloneMaterials.map((material) => material.id);
  }

  async function seedThree(customerId: string) {
    const a = await createMaterial({ customerId, title: "A", createdAt: "2026-05-03T10:00:00.000Z" });
    const b = await createMaterial({ customerId, title: "B", createdAt: "2026-05-02T10:00:00.000Z" });
    const c = await createMaterial({ customerId, title: "C", createdAt: "2026-05-01T10:00:00.000Z" });
    return { a, b, c };
  }

  it("own reorder persists across a fresh portal GET", async () => {
    const student = await createStudent("Own Student", "own@example.com", "0400300001");
    const cookie = cookieFor(student.id);
    const { a, b, c } = await seedThree(student.id);

    expect(await portalStandaloneIds(cookie)).toEqual([a.id, b.id, c.id]);

    const response = await studentReorderPATCH(
      reorderRequest(cookie, { folderId: null, movedId: c.id, orderedIds: [c.id, a.id, b.id] })
    );
    expect(response.status).toBe(200);

    expect(await portalStandaloneIds(cookie)).toEqual([c.id, a.id, b.id]);
  });

  it("another student's material id -> 404 and zero rows changed", async () => {
    const student = await createStudent("Mine", "mine@example.com", "0400300002");
    const stranger = await createStudent("Theirs", "theirs@example.com", "0400300003");
    const cookie = cookieFor(student.id);
    const { a, b } = await seedThree(student.id);
    const foreign = await createMaterial({
      customerId: stranger.id,
      title: "Foreign",
      createdAt: "2026-05-01T10:00:00.000Z"
    });

    const before = await snapshot();
    const response = await studentReorderPATCH(
      reorderRequest(cookie, { folderId: null, movedId: foreign.id, orderedIds: [foreign.id, a.id, b.id] })
    );
    expect(response.status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });

  it("another student's destination folder -> 404 (no existence oracle) and zero rows changed", async () => {
    const student = await createStudent("Mine", "mine2@example.com", "0400300004");
    const stranger = await createStudent("Theirs", "theirs2@example.com", "0400300005");
    const cookie = cookieFor(student.id);
    const { a } = await seedThree(student.id);
    const foreignFolder = await prisma.studentMaterialFolder.create({
      data: { customerId: stranger.id, name: "Not Yours", parentId: null }
    });

    const before = await snapshot();
    const response = await studentReorderPATCH(
      reorderRequest(cookie, { folderId: foreignFolder.id, movedId: a.id, orderedIds: [a.id] })
    );
    expect(response.status).toBe(404);
    // Same status and body as a nonexistent folder: the response must not
    // distinguish "absent" from "someone else's".
    expect((await response.json()) as { error: string; code?: string }).toEqual({ error: "Not found." });
    expect(await snapshot()).toEqual(before);
  });

  it("a nonexistent destination folder -> 404, byte-identical to the foreign-folder response", async () => {
    const student = await createStudent("Mine", "mine3@example.com", "0400300006");
    const cookie = cookieFor(student.id);
    const { a } = await seedThree(student.id);

    const response = await studentReorderPATCH(
      reorderRequest(cookie, { folderId: "folder_does_not_exist", movedId: a.id, orderedIds: [a.id] })
    );
    expect(response.status).toBe(404);
    expect((await response.json()) as { error: string }).toEqual({ error: "Not found." });
  });

  it("unauthenticated -> 401", async () => {
    const student = await createStudent("Anon", "anon@example.com", "0400300007");
    const { a } = await seedThree(student.id);

    const response = await studentReorderPATCH(
      reorderRequest(null, { folderId: null, movedId: a.id, orderedIds: [a.id] })
    );
    expect(response.status).toBe(401);
  });

  it("an archived student -> 401", async () => {
    const student = await createStudent("Archived", "archived@example.com", "0400300008");
    const cookie = cookieFor(student.id);
    const { a } = await seedThree(student.id);
    await prisma.customer.update({ where: { id: student.id }, data: { isArchived: true } });

    const response = await studentReorderPATCH(
      reorderRequest(cookie, { folderId: null, movedId: a.id, orderedIds: [a.id] })
    );
    expect(response.status).toBe(401);
  });

  it("content-type: text/plain -> 415", async () => {
    const student = await createStudent("Plain", "plain@example.com", "0400300009");
    const cookie = cookieFor(student.id);
    const { a } = await seedThree(student.id);

    const response = await studentReorderPATCH(
      reorderRequest(cookie, { folderId: null, movedId: a.id, orderedIds: [a.id] }, "text/plain")
    );
    expect(response.status).toBe(415);
  });

  it("INV-4 DIVERGENCE: a booking-linked own material reorders successfully", async () => {
    // Deliberate: an admin who is not the assigned teacher would get 403 here.
    // If this ever starts failing, the student route grew an INV-4 gate that was
    // decided against — reopen the decision rather than editing this test.
    const student = await createStudent("Booked", "booked@example.com", "0400300010");
    const cookie = cookieFor(student.id);
    const teacher = await prisma.adminUser.create({
      data: {
        email: "inv4-teacher@example.com",
        role: "teacher",
        firstName: "Ada",
        lastName: "Teacher",
        displayName: "Ada",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });
    const booking = await prisma.booking.create({
      data: {
        name: "Lesson Student",
        email: "booked@example.com",
        phone: "0400300010",
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
        customerId: student.id,
        // A REAL assigned teacher. With null, any future INV-4 gate would permit
        // the write and this tripwire would stay green through exactly the
        // change it exists to catch.
        assignedTeacherId: teacher.id
      }
    });

    const linked = await createMaterial({
      customerId: student.id,
      bookingId: booking.id,
      title: "Linked",
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const plain = await createMaterial({
      customerId: student.id,
      title: "Plain",
      createdAt: "2026-05-02T10:00:00.000Z"
    });

    const response = await studentReorderPATCH(
      reorderRequest(cookie, { folderId: null, movedId: linked.id, orderedIds: [plain.id, linked.id] })
    );
    expect(response.status).toBe(200);

    const reloaded = await prisma.learningMaterial.findUnique({ where: { id: linked.id } });
    expect(reloaded?.sortOrder).toBe(2);
  });

  it("a smuggled body customerId is ignored: the ONLY foreign field", async () => {
    // Everything here is the student's own EXCEPT `customerId` and the folder,
    // both of which belong to the stranger. If the body's `customerId` were
    // honoured the folder check would pass and the student's own material would
    // land in the stranger's folder. Deleting the `customerId` line must change
    // nothing — that is what makes this test load-bearing rather than a
    // restatement of the foreign-material-id case above.
    const student = await createStudent("Mine", "mine4@example.com", "0400300011");
    const stranger = await createStudent("Theirs", "theirs4@example.com", "0400300012");
    const cookie = cookieFor(student.id);
    const { a } = await seedThree(student.id);
    const strangerFolder = await prisma.studentMaterialFolder.create({
      data: { customerId: stranger.id, name: "Stranger Folder", parentId: null }
    });

    const before = await snapshot();
    const response = await studentReorderPATCH(
      reorderRequest(cookie, {
        customerId: stranger.id,
        folderId: strangerFolder.id,
        movedId: a.id,
        orderedIds: [a.id]
      })
    );
    expect(response.status).toBe(404);

    const reloaded = await prisma.learningMaterial.findUniqueOrThrow({ where: { id: a.id } });
    expect(reloaded.folderId).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it("a lib: id belonging to another student -> 404 and zero LibraryAssignment rows changed", async () => {
    const student = await createStudent("Mine", "mine5@example.com", "0400300013");
    const stranger = await createStudent("Theirs", "theirs5@example.com", "0400300014");
    const cookie = cookieFor(student.id);
    await seedThree(student.id);

    const item = await prisma.libraryItem.create({
      data: {
        title: "Stranger's Tab",
        description: null,
        materialType: "pdf",
        storageKey: "library/student-foreign.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048
      }
    });
    await prisma.libraryAssignment.create({
      data: { libraryItemId: item.id, customerId: stranger.id }
    });

    const before = await prisma.libraryAssignment.findMany({
      select: { libraryItemId: true, customerId: true, folderId: true, sortOrder: true },
      orderBy: { libraryItemId: "asc" }
    });

    const response = await studentReorderPATCH(
      reorderRequest(cookie, {
        folderId: null,
        movedId: `lib:${item.id}`,
        orderedIds: [`lib:${item.id}`]
      })
    );
    expect(response.status).toBe(404);

    // The CASE update's `WHERE customerId` is the only thing standing between a
    // student and another student's assignment rows.
    expect(
      await prisma.libraryAssignment.findMany({
        select: { libraryItemId: true, customerId: true, folderId: true, sortOrder: true },
        orderBy: { libraryItemId: "asc" }
      })
    ).toEqual(before);
  });

  it("a student CAN place their own lib: assignment", async () => {
    const student = await createStudent("Own Lib", "ownlib@example.com", "0400300015");
    const cookie = cookieFor(student.id);
    const folder = await prisma.studentMaterialFolder.create({
      data: { customerId: student.id, name: "Mine", parentId: null }
    });
    const item = await prisma.libraryItem.create({
      data: {
        title: "My Tab",
        description: null,
        materialType: "pdf",
        storageKey: "library/student-own.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048
      }
    });
    await prisma.libraryAssignment.create({
      data: { libraryItemId: item.id, customerId: student.id }
    });

    const response = await studentReorderPATCH(
      reorderRequest(cookie, {
        folderId: folder.id,
        movedId: `lib:${item.id}`,
        orderedIds: [`lib:${item.id}`]
      })
    );
    expect(response.status).toBe(200);

    const assignment = await prisma.libraryAssignment.findFirstOrThrow({
      where: { libraryItemId: item.id, customerId: student.id }
    });
    expect(assignment.folderId).toBe(folder.id);
    expect(assignment.sortOrder).toBe(1);
  });
});
