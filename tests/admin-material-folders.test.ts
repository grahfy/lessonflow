import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  GET as customerFoldersGET,
  POST as customerFoldersPOST
} from "@/app/api/admin/customers/[id]/material-folders/route";
import { DELETE as folderDELETE, PATCH as folderPATCH } from "@/app/api/admin/material-folders/[id]/route";
import { PATCH as materialMovePATCH } from "@/app/api/admin/learning-materials/[id]/move/route";
import {
  GET as materialsGET,
  POST as materialsPOST
} from "@/app/api/admin/customers/[id]/learning-materials/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

type FolderTreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  sourceBookingId: string | null;
  children: FolderTreeNode[];
  materialIds: string[];
};

describe("admin-material-folders", () => {
  beforeEach(async () => {
    // Order matters for FK integrity: materials reference folders (SetNull) and
    // bookings (SetNull); folders self-reference via parentId (Cascade) and the
    // customer (Cascade). Delete leaf-first so nothing is blocked.
    await prisma.learningMaterial.deleteMany();
    await prisma.studentMaterialFolder.deleteMany();
    await prisma.adminUser.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function createCustomer(
    name: string,
    email: string,
    phone: string,
    postcode: string,
    primaryTeacherId?: string | null
  ) {
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
          postcode
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

  async function createBooking(
    customerId: string,
    email: string,
    phone: string,
    assignedTeacherId?: string | null
  ) {
    return prisma.booking.create({
      data: {
        name: "Lesson Student",
        email,
        phone,
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
        assignedTeacherId: assignedTeacherId ?? null
      }
    });
  }

  async function ownerCookie() {
    const admin = await ensureOwnerAdmin();
    return { admin, cookie: `${getSessionCookieName()}=${createSessionToken(admin.email)}` };
  }

  function teacherCookie(email: string) {
    return `${getSessionCookieName()}=${createSessionToken(email)}`;
  }

  function jsonRequest(url: string, method: string, cookie: string, body?: unknown) {
    return new NextRequest(url, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  async function createFolder(customerId: string, cookie: string, name: string, parentId?: string | null) {
    const response = await customerFoldersPOST(
      jsonRequest(
        `http://localhost/api/admin/customers/${customerId}/material-folders`,
        "POST",
        cookie,
        { name, ...(parentId === undefined ? {} : { parentId }) }
      ),
      { params: Promise.resolve({ id: customerId }) }
    );
    return response;
  }

  function flattenTree(nodes: FolderTreeNode[]): FolderTreeNode[] {
    return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
  }

  it("AC-5 create: POST creates folders at root and nested, GET returns the customer-scoped tree", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Tree Student", "tree@example.com", "0400100001", "3070");

    const rootResponse = await createFolder(customer.id, cookie, "Scales");
    expect(rootResponse.status).toBe(201);
    const rootFolder = (await rootResponse.json()) as { folder: { id: string; parentId: string | null } };
    expect(rootFolder.folder.parentId).toBeNull();

    const childResponse = await createFolder(customer.id, cookie, "Major", rootFolder.folder.id);
    expect(childResponse.status).toBe(201);
    const childFolder = (await childResponse.json()) as { folder: { id: string; parentId: string | null } };
    expect(childFolder.folder.parentId).toBe(rootFolder.folder.id);

    // A second customer's folder must NOT leak into the first customer's tree.
    const otherCustomer = await createCustomer("Other Student", "other@example.com", "0400100002", "3070");
    await createFolder(otherCustomer.id, cookie, "Foreign");

    const treeResponse = await customerFoldersGET(
      new NextRequest(`http://localhost/api/admin/customers/${customer.id}/material-folders`, {
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: customer.id }) }
    );
    expect(treeResponse.status).toBe(200);
    const treePayload = (await treeResponse.json()) as { folders: FolderTreeNode[] };
    expect(treePayload.folders).toHaveLength(1);
    expect(treePayload.folders[0]?.id).toBe(rootFolder.folder.id);
    expect(treePayload.folders[0]?.children).toHaveLength(1);
    expect(treePayload.folders[0]?.children[0]?.id).toBe(childFolder.folder.id);
    const allNames = flattenTree(treePayload.folders).map((node) => node.name);
    expect(allNames).not.toContain("Foreign");
  });

  it("INV-1 create: duplicate sibling name (case/whitespace-insensitive) -> 400, empty -> 400, same name under different parent -> ok", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Inv1 Student", "inv1@example.com", "0400100003", "3070");

    const first = await createFolder(customer.id, cookie, "Practice");
    expect(first.status).toBe(201);

    // Case/whitespace-insensitive duplicate at the same level is rejected.
    const dup = await createFolder(customer.id, cookie, "  praCTICE ");
    expect(dup.status).toBe(400);
    const dupBody = (await dup.json()) as { code?: string };
    expect(dupBody.code).toBe("DUPLICATE_SIBLING");

    // Empty name is rejected (zod min(1) -> generic 400 with details).
    const empty = await createFolder(customer.id, cookie, "");
    expect(empty.status).toBe(400);

    // Same name under a DIFFERENT parent is allowed.
    const parent = (await first.json()) as { folder: { id: string } };
    const nested = await createFolder(customer.id, cookie, "Practice", parent.folder.id);
    expect(nested.status).toBe(201);
  });

  it("AC-6 rename: PATCH renames a folder; renaming to its own name is allowed", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Rename Student", "rename@example.com", "0400100004", "3070");

    const created = await createFolder(customer.id, cookie, "Old Name");
    const { folder } = (await created.json()) as { folder: { id: string } };

    const renamed = await folderPATCH(
      jsonRequest(`http://localhost/api/admin/material-folders/${folder.id}`, "PATCH", cookie, {
        name: "New Name"
      }),
      { params: Promise.resolve({ id: folder.id }) }
    );
    expect(renamed.status).toBe(200);
    const renamedBody = (await renamed.json()) as { folder: { name: string } };
    expect(renamedBody.folder.name).toBe("New Name");

    // Renaming to its own (current) name is allowed because excludeId skips self.
    const selfRename = await folderPATCH(
      jsonRequest(`http://localhost/api/admin/material-folders/${folder.id}`, "PATCH", cookie, {
        name: "New Name"
      }),
      { params: Promise.resolve({ id: folder.id }) }
    );
    expect(selfRename.status).toBe(200);

    // Renaming to a name that clashes with a sibling is rejected (INV-1).
    const sibling = await createFolder(customer.id, cookie, "Sibling");
    const { folder: siblingFolder } = (await sibling.json()) as { folder: { id: string } };
    const clash = await folderPATCH(
      jsonRequest(`http://localhost/api/admin/material-folders/${siblingFolder.id}`, "PATCH", cookie, {
        name: "New Name"
      }),
      { params: Promise.resolve({ id: siblingFolder.id }) }
    );
    expect(clash.status).toBe(400);
  });

  it("AC-7/AC-4 delete-relocate: DELETE moves child folder + material up to the grandparent, deletes nothing", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Relocate Student", "relocate@example.com", "0400100005", "3070");

    // grandparent (root) -> parent -> child folder; a material lives directly in parent.
    const grandparentRes = await createFolder(customer.id, cookie, "Grandparent");
    const { folder: grandparent } = (await grandparentRes.json()) as { folder: { id: string } };
    const parentRes = await createFolder(customer.id, cookie, "Parent", grandparent.id);
    const { folder: parent } = (await parentRes.json()) as { folder: { id: string } };
    const childRes = await createFolder(customer.id, cookie, "Child", parent.id);
    const { folder: child } = (await childRes.json()) as { folder: { id: string } };

    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        folderId: parent.id,
        title: "In parent",
        materialType: "pdf",
        storageKey: "tests/relocate-material.pdf",
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });

    const deleteRes = await folderDELETE(
      jsonRequest(`http://localhost/api/admin/material-folders/${parent.id}`, "DELETE", cookie),
      { params: Promise.resolve({ id: parent.id }) }
    );
    expect(deleteRes.status).toBe(200);

    // Parent row is gone, NOTHING else deleted.
    expect(await prisma.studentMaterialFolder.findUnique({ where: { id: parent.id } })).toBeNull();
    const remainingFolders = await prisma.studentMaterialFolder.findMany({ where: { customerId: customer.id } });
    expect(remainingFolders.map((f) => f.id).sort()).toEqual([grandparent.id, child.id].sort());

    // Child folder and the material both relocated UP to the grandparent.
    const relocatedChild = await prisma.studentMaterialFolder.findUnique({ where: { id: child.id } });
    expect(relocatedChild?.parentId).toBe(grandparent.id);
    const relocatedMaterial = await prisma.learningMaterial.findUnique({ where: { id: material.id } });
    expect(relocatedMaterial?.folderId).toBe(grandparent.id);
    // The material itself still exists (nothing deleted).
    expect(await prisma.learningMaterial.count({ where: { customerId: customer.id } })).toBe(1);
  });

  it("AC-8 move: PATCH moves a material into a folder and back to root, storageKey unchanged (R5)", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Move Student", "move@example.com", "0400100006", "3070");
    const folderRes = await createFolder(customer.id, cookie, "Target");
    const { folder } = (await folderRes.json()) as { folder: { id: string } };

    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        title: "Movable",
        materialType: "pdf",
        storageKey: "tests/move-material.pdf",
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });
    const originalStorageKey = material.storageKey;

    const intoFolder = await materialMovePATCH(
      jsonRequest(`http://localhost/api/admin/learning-materials/${material.id}/move`, "PATCH", cookie, {
        folderId: folder.id
      }),
      { params: Promise.resolve({ id: material.id }) }
    );
    expect(intoFolder.status).toBe(200);
    const intoBody = (await intoFolder.json()) as { material: { folderId: string | null } };
    expect(intoBody.material.folderId).toBe(folder.id);
    expect((await prisma.learningMaterial.findUnique({ where: { id: material.id } }))?.storageKey).toBe(
      originalStorageKey
    );

    const backToRoot = await materialMovePATCH(
      jsonRequest(`http://localhost/api/admin/learning-materials/${material.id}/move`, "PATCH", cookie, {
        folderId: null
      }),
      { params: Promise.resolve({ id: material.id }) }
    );
    expect(backToRoot.status).toBe(200);
    const afterMaterial = await prisma.learningMaterial.findUnique({ where: { id: material.id } });
    expect(afterMaterial?.folderId).toBeNull();
    // R5: storageKey is NEVER regenerated by a move.
    expect(afterMaterial?.storageKey).toBe(originalStorageKey);
  });

  it("AC-8 move: a cross-customer target folder is rejected (INV-3)", async () => {
    const { cookie } = await ownerCookie();
    const customerA = await createCustomer("Move A", "movea@example.com", "0400100007", "3070");
    const customerB = await createCustomer("Move B", "moveb@example.com", "0400100008", "3070");
    const foreignFolderRes = await createFolder(customerB.id, cookie, "Foreign Target");
    const { folder: foreignFolder } = (await foreignFolderRes.json()) as { folder: { id: string } };

    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customerA.id,
        title: "A material",
        materialType: "pdf",
        storageKey: "tests/cross-move.pdf",
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });

    const response = await materialMovePATCH(
      jsonRequest(`http://localhost/api/admin/learning-materials/${material.id}/move`, "PATCH", cookie, {
        folderId: foreignFolder.id
      }),
      { params: Promise.resolve({ id: material.id }) }
    );
    expect(response.status).toBe(400);
    // No write happened.
    expect((await prisma.learningMaterial.findUnique({ where: { id: material.id } }))?.folderId).toBeNull();
  });

  it("AC-9 upload: folderId persists; booking + unrelated folder is accepted (independence)", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Upload Student", "upload@example.com", "0400100009", "3070");
    const booking = await createBooking(customer.id, customer.email, customer.phone);
    const folderRes = await createFolder(customer.id, cookie, "Uploads");
    const { folder } = (await folderRes.json()) as { folder: { id: string } };

    const form = new FormData();
    form.set("bookingId", booking.id);
    form.set("folderId", folder.id);
    form.set("title", "Booking material in folder");
    form.set("file", new File([Buffer.from("pdf-content")], "in-folder.pdf", { type: "application/pdf" }));

    const uploadRes = await materialsPOST(
      new NextRequest(`http://localhost/api/admin/customers/${customer.id}/learning-materials`, {
        method: "POST",
        body: form,
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: customer.id }) }
    );
    expect(uploadRes.status).toBe(201);
    const uploadBody = (await uploadRes.json()) as {
      material: { id: string; bookingId: string | null; folderId: string | null };
    };
    // A material can be booking-linked AND placed in an arbitrary folder.
    expect(uploadBody.material.bookingId).toBe(booking.id);
    expect(uploadBody.material.folderId).toBe(folder.id);
    const stored = await prisma.learningMaterial.findUnique({ where: { id: uploadBody.material.id } });
    expect(stored?.folderId).toBe(folder.id);
  });

  it("AC-9 upload: a cross-customer folderId is rejected", async () => {
    const { cookie } = await ownerCookie();
    const customerA = await createCustomer("Upload A", "uploada@example.com", "0400100010", "3070");
    const customerB = await createCustomer("Upload B", "uploadb@example.com", "0400100011", "3070");
    const foreignFolderRes = await createFolder(customerB.id, cookie, "Foreign Upload");
    const { folder: foreignFolder } = (await foreignFolderRes.json()) as { folder: { id: string } };

    const form = new FormData();
    form.set("folderId", foreignFolder.id);
    form.set("file", new File([Buffer.from("pdf-content")], "bad.pdf", { type: "application/pdf" }));

    const uploadRes = await materialsPOST(
      new NextRequest(`http://localhost/api/admin/customers/${customerA.id}/learning-materials`, {
        method: "POST",
        body: form,
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: customerA.id }) }
    );
    expect(uploadRes.status).toBe(400);
    expect(await prisma.learningMaterial.count({ where: { customerId: customerA.id } })).toBe(0);
  });

  it("INV-4 teacher auth: primary (non-assigned) teacher cannot delete-relocate or move a booking-linked material; no writes happen", async () => {
    const teacherPrimary = await createTeacher("folders-primary@example.com", "Folders Primary");
    const teacherAssigned = await createTeacher("folders-assigned@example.com", "Folders Assigned");
    const cookie = teacherCookie(teacherPrimary.email);

    const customer = await createCustomer(
      "Split Folder Student",
      "split.folder@example.com",
      "0400100012",
      "3070",
      teacherPrimary.id
    );
    const booking = await createBooking(customer.id, customer.email, customer.phone, teacherAssigned.id);

    // Primary teacher creates a folder (allowed by canManagePrimaryTeacherCustomer).
    const folderRes = await createFolder(customer.id, cookie, "Shared");
    expect(folderRes.status).toBe(201);
    const { folder } = (await folderRes.json()) as { folder: { id: string } };

    // A booking-linked material owned (assigned) by the OTHER teacher, placed in the folder.
    const bookingMaterial = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: booking.id,
        folderId: folder.id,
        uploadedById: teacherAssigned.id,
        title: "Assigned-only notes",
        materialType: "pdf",
        storageKey: "tests/assigned-notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128
      }
    });

    // (a) delete-relocate of the folder containing that booking material -> 403, no writes.
    const deleteRes = await folderDELETE(
      jsonRequest(`http://localhost/api/admin/material-folders/${folder.id}`, "DELETE", cookie),
      { params: Promise.resolve({ id: folder.id }) }
    );
    expect(deleteRes.status).toBe(403);
    expect(await prisma.studentMaterialFolder.findUnique({ where: { id: folder.id } })).not.toBeNull();
    expect((await prisma.learningMaterial.findUnique({ where: { id: bookingMaterial.id } }))?.folderId).toBe(
      folder.id
    );

    // (b) move of that booking-linked material -> 403, no writes.
    const moveRes = await materialMovePATCH(
      jsonRequest(`http://localhost/api/admin/learning-materials/${bookingMaterial.id}/move`, "PATCH", cookie, {
        folderId: null
      }),
      { params: Promise.resolve({ id: bookingMaterial.id }) }
    );
    expect(moveRes.status).toBe(403);
    expect((await prisma.learningMaterial.findUnique({ where: { id: bookingMaterial.id } }))?.folderId).toBe(
      folder.id
    );

    // A NON-booking-linked material is movable by the primary teacher.
    const generalMaterial = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        folderId: folder.id,
        uploadedById: teacherPrimary.id,
        title: "General resource",
        materialType: "pdf",
        storageKey: "tests/general-resource.pdf",
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });
    const generalMoveRes = await materialMovePATCH(
      jsonRequest(`http://localhost/api/admin/learning-materials/${generalMaterial.id}/move`, "PATCH", cookie, {
        folderId: null
      }),
      { params: Promise.resolve({ id: generalMaterial.id }) }
    );
    expect(generalMoveRes.status).toBe(200);
    expect((await prisma.learningMaterial.findUnique({ where: { id: generalMaterial.id } }))?.folderId).toBeNull();
  });

  it("AC-11 auth: no admin session is rejected on every folder route (401)", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Auth Student", "auth@example.com", "0400100013", "3070");
    const folderRes = await createFolder(customer.id, cookie, "Authed");
    const { folder } = (await folderRes.json()) as { folder: { id: string } };
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        title: "Auth material",
        materialType: "pdf",
        storageKey: "tests/auth-material.pdf",
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });

    const noCookie = "";

    const listFolders = await customerFoldersGET(
      new NextRequest(`http://localhost/api/admin/customers/${customer.id}/material-folders`, {
        headers: { cookie: noCookie }
      }),
      { params: Promise.resolve({ id: customer.id }) }
    );
    expect([401, 403]).toContain(listFolders.status);

    const createFolderRes = await customerFoldersPOST(
      jsonRequest(
        `http://localhost/api/admin/customers/${customer.id}/material-folders`,
        "POST",
        noCookie,
        { name: "Nope" }
      ),
      { params: Promise.resolve({ id: customer.id }) }
    );
    expect([401, 403]).toContain(createFolderRes.status);

    const renameRes = await folderPATCH(
      jsonRequest(`http://localhost/api/admin/material-folders/${folder.id}`, "PATCH", noCookie, { name: "Nope" }),
      { params: Promise.resolve({ id: folder.id }) }
    );
    expect([401, 403]).toContain(renameRes.status);

    const deleteRes = await folderDELETE(
      jsonRequest(`http://localhost/api/admin/material-folders/${folder.id}`, "DELETE", noCookie),
      { params: Promise.resolve({ id: folder.id }) }
    );
    expect([401, 403]).toContain(deleteRes.status);

    const moveRes = await materialMovePATCH(
      jsonRequest(`http://localhost/api/admin/learning-materials/${material.id}/move`, "PATCH", noCookie, {
        folderId: folder.id
      }),
      { params: Promise.resolve({ id: material.id }) }
    );
    expect([401, 403]).toContain(moveRes.status);
  });

  it("C0 payload: learning-materials GET returns a folders tree and every material carries folderId", async () => {
    const { cookie } = await ownerCookie();
    const customer = await createCustomer("Payload Student", "payload@example.com", "0400100014", "3070");
    const booking = await createBooking(customer.id, customer.email, customer.phone);
    const folderRes = await createFolder(customer.id, cookie, "Payload Folder");
    const { folder } = (await folderRes.json()) as { folder: { id: string } };

    // A booking-linked material placed inside a folder.
    const bookingMaterial = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: booking.id,
        folderId: folder.id,
        title: "Booking material",
        materialType: "pdf",
        storageKey: "tests/payload-booking.pdf",
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });
    // A general (root) material.
    await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        title: "Root material",
        materialType: "pdf",
        storageKey: "tests/payload-root.pdf",
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });

    const response = await materialsGET(
      new NextRequest(`http://localhost/api/admin/customers/${customer.id}/learning-materials`, {
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: customer.id }) }
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      folders: FolderTreeNode[];
      materials: Array<{ id: string; folderId: string | null }>;
    };

    expect(Array.isArray(payload.folders)).toBe(true);
    expect(payload.folders.map((f) => f.id)).toContain(folder.id);

    // Every material row carries a folderId field (null or a folder id).
    for (const m of payload.materials) {
      expect(m).toHaveProperty("folderId");
    }

    // The booking-linked material appears once with its folderId.
    const matches = payload.materials.filter((m) => m.id === bookingMaterial.id);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.folderId).toBe(folder.id);
  });
});
