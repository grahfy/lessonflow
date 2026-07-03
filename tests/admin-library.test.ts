import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as unassignLibrary } from "@/app/api/admin/library/[id]/assignments/[customerId]/route";
import { POST as assignLibrary } from "@/app/api/admin/library/[id]/assignments/route";
import { GET as getLibrary, POST as uploadLibrary } from "@/app/api/admin/library/route";
import {
  DELETE as deleteLibraryRoute,
  PATCH as patchLibrary,
  PUT as replaceLibraryFile
} from "@/app/api/admin/library/[id]/route";
import { POST as addTag } from "@/app/api/admin/library/[id]/tags/route";
import { POST as promoteToLibrary } from "@/app/api/admin/learning-materials/[id]/promote-to-library/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { replaceLibraryItemFile } from "@/lib/library/library-service";
import * as observability from "@/lib/observability";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";

const STORAGE_ROOT = getLocalMaterialStorageRoot();

/** Returns true when a blob exists on disk for the given storage key. */
async function blobExists(storageKey: string): Promise<boolean> {
  try {
    await fs.access(path.join(STORAGE_ROOT, storageKey));
    return true;
  } catch {
    return false;
  }
}

/** Counts files directly under the isolated `library/` namespace dir. */
async function libraryBlobCount(): Promise<number> {
  try {
    const entries = await fs.readdir(path.join(STORAGE_ROOT, "library"));
    return entries.length;
  } catch {
    return 0;
  }
}

describe("admin-library", () => {
  beforeEach(async () => {
    // FK-safe order: join tables → owned rows → vocab → actors. LibraryItem delete
    // would cascade the joins, but wiping them explicitly keeps the reset flat.
    await prisma.libraryItemTag.deleteMany();
    await prisma.libraryAssignment.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
    await fs.rm(STORAGE_ROOT, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function ownerCookie() {
    const admin = await ensureOwnerAdmin();
    return { admin, cookie: `${getSessionCookieName()}=${createSessionToken(admin.email)}` };
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

  async function createCustomer(name: string, email: string, primaryTeacherId?: string | null) {
    return prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          name,
          email,
          phone: "0400111222",
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

  function uploadRequest(cookie: string, file: File, extra: Record<string, string> = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(extra)) {
      form.set(key, value);
    }
    form.set("file", file);
    return new NextRequest("http://localhost/api/admin/library", {
      method: "POST",
      body: form,
      headers: { cookie }
    });
  }

  /** Uploads one audio item and returns its serialized payload. */
  async function uploadItem(cookie: string, title = "Master Track") {
    const response = await uploadLibrary(
      uploadRequest(cookie, new File([Buffer.from("audio-bytes")], "track.mp3", { type: "audio/mpeg" }), { title })
    );
    expect(response.status).toBe(201);
    const { item } = (await response.json()) as {
      item: { id: string; title: string; materialType: string; mimeType: string };
    };
    return item;
  }

  it("AC1: uploads a valid audio file → 201 with a LibraryItem row + blob under library/", async () => {
    const { admin, cookie } = await ownerCookie();

    const item = await uploadItem(cookie, "Warmup Scale");
    expect(item.materialType).toBe("audio");

    const row = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    expect(row).not.toBeNull();
    // LibraryItem is a non-customer-scoped store — the model has no customerId at all.
    expect(row).not.toHaveProperty("customerId");
    expect(row?.uploadedById).toBe(admin.id);
    expect(row?.storageKey.startsWith("library/")).toBe(true);
    expect(await blobExists(row!.storageKey)).toBe(true);
  });

  it("AC1: rejects a disallowed MIME (SVG) → 400 and creates no row", async () => {
    const { cookie } = await ownerCookie();

    const response = await uploadLibrary(
      uploadRequest(cookie, new File([Buffer.from("<svg/>")], "evil.svg", { type: "image/svg+xml" }))
    );
    expect(response.status).toBe(400);
    expect(await prisma.libraryItem.count()).toBe(0);
    expect(await libraryBlobCount()).toBe(0);
  });

  it("AC2: tag add-on-the-fly is idempotent; new value creates a new Tag", async () => {
    const { cookie } = await ownerCookie();
    const item = await uploadItem(cookie);

    const addRock = () =>
      addTag(
        new NextRequest(`http://localhost/api/admin/library/${item.id}/tags`, {
          method: "POST",
          body: JSON.stringify({ category: "Style", value: "Rock" }),
          headers: { cookie, "content-type": "application/json" }
        }),
        { params: Promise.resolve({ id: item.id }) }
      );

    const first = await addRock();
    expect(first.status).toBe(201);
    const second = await addRock(); // same (category,value) again
    expect(second.status).toBe(201);

    // Exactly one Tag row and one join row despite two POSTs.
    expect(await prisma.tag.count({ where: { category: "Style", value: "Rock" } })).toBe(1);
    expect(await prisma.libraryItemTag.count({ where: { libraryItemId: item.id } })).toBe(1);

    // A never-seen value creates a distinct Tag.
    const addDecade = await addTag(
      new NextRequest(`http://localhost/api/admin/library/${item.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ category: "Decade", value: "80s" }),
        headers: { cookie, "content-type": "application/json" }
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(addDecade.status).toBe(201);
    expect(await prisma.tag.count()).toBe(2);
    expect(await prisma.libraryItemTag.count({ where: { libraryItemId: item.id } })).toBe(2);
  });

  it("AC3/AC3b: search AND-combines facets and q never widens past the intersection", async () => {
    const { cookie } = await ownerCookie();
    const rockItem = await uploadItem(cookie, "Sunshine Of Your Love");
    const jazzItem = await uploadItem(cookie, "Sunshine Serenade");

    async function tag(id: string, category: string, value: string) {
      await addTag(
        new NextRequest(`http://localhost/api/admin/library/${id}/tags`, {
          method: "POST",
          body: JSON.stringify({ category, value }),
          headers: { cookie, "content-type": "application/json" }
        }),
        { params: Promise.resolve({ id }) }
      );
    }
    await tag(rockItem.id, "Style", "Rock");
    await tag(jazzItem.id, "Style", "Jazz");

    async function search(qs: string) {
      const res = await getLibrary(new NextRequest(`http://localhost/api/admin/library${qs}`, { headers: { cookie } }));
      expect(res.status).toBe(200);
      const { items } = (await res.json()) as { items: { id: string }[] };
      return items.map((i) => i.id);
    }

    // Facet only → just the Rock item.
    expect(await search("?tag=Style:Rock")).toEqual([rockItem.id]);

    // AC3b: q matches BOTH titles ("Sunshine") but the Rock facet must still
    // exclude the Jazz item — the title match never widens the result set.
    const rockAndQuery = await search("?tag=Style:Rock&q=Sunshine");
    expect(rockAndQuery).toContain(rockItem.id);
    expect(rockAndQuery).not.toContain(jazzItem.id);
  });

  it("AC4: invalid customerId → 400 naming the offender, creating nothing; valid duplicate → idempotent", async () => {
    const { cookie } = await ownerCookie();
    const item = await uploadItem(cookie);
    const customer = await createCustomer("Assignee One", "assignee1@example.com");

    // One bad id in the batch → 400, offender named, zero rows created.
    const badResponse = await assignLibrary(
      new NextRequest(`http://localhost/api/admin/library/${item.id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ customerIds: [customer.id, "does-not-exist"] }),
        headers: { cookie, "content-type": "application/json" }
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(badResponse.status).toBe(400);
    const badBody = (await badResponse.json()) as { error: string; invalidCustomerIds: string[] };
    expect(badBody.error).toContain("does-not-exist");
    expect(badBody.invalidCustomerIds).toContain("does-not-exist");
    expect(await prisma.libraryAssignment.count()).toBe(0);

    // Valid batch with a duplicate id → single row (createMany skipDuplicates).
    const goodResponse = await assignLibrary(
      new NextRequest(`http://localhost/api/admin/library/${item.id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ customerIds: [customer.id, customer.id] }),
        headers: { cookie, "content-type": "application/json" }
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(goodResponse.status).toBe(201);
    expect(await prisma.libraryAssignment.count({ where: { libraryItemId: item.id } })).toBe(1);

    // Re-assigning the same student again is a no-op (idempotent).
    const repeat = await assignLibrary(
      new NextRequest(`http://localhost/api/admin/library/${item.id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ customerIds: [customer.id] }),
        headers: { cookie, "content-type": "application/json" }
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(repeat.status).toBe(201);
    expect(await prisma.libraryAssignment.count({ where: { libraryItemId: item.id } })).toBe(1);
  });

  it("AC8b: unentitled teacher promoting a source they cannot read → 403, no LibraryItem, no blob", async () => {
    const teacherA = await createTeacher("promote-outsider@example.com", "Outsider");
    const teacherB = await createTeacher("promote-primary@example.com", "Primary");
    const cookie = `${getSessionCookieName()}=${createSessionToken(teacherA.email)}`;

    // Customer is managed by teacherB; teacherA is neither owner nor primary teacher.
    const customer = await createCustomer("Private Student", "private@example.com", teacherB.id);
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        uploadedById: teacherB.id,
        title: "Private notes",
        materialType: "pdf",
        storageKey: `${customer.id}/general/private.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 128
      }
    });

    const logSpy = vi.spyOn(observability, "logEvent");
    const libraryBefore = await libraryBlobCount();

    const response = await promoteToLibrary(
      new NextRequest(`http://localhost/api/admin/learning-materials/${material.id}/promote-to-library`, {
        method: "POST",
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: material.id }) }
    );

    expect(response.status).toBe(403);
    // No item created and no blob written — the source read never happened.
    expect(await prisma.libraryItem.count()).toBe(0);
    expect(await libraryBlobCount()).toBe(libraryBefore);
    // Observability: the denied source-read is a probing signal for the S4 leak.
    expect(logSpy).toHaveBeenCalledWith(
      "library.promote_denied",
      expect.objectContaining({ adminId: teacherA.id, materialId: material.id })
    );
  });

  it("AC8/AC14: entitled promote copies bytes to a new library/ key; deleting the source leaves the master intact", async () => {
    const { admin, cookie } = await ownerCookie();
    const customer = await createCustomer("Promote Student", "promote@example.com");

    const storage = createMaterialStorageDriver();
    const sourceKey = `${customer.id}/general/source.mp3`;
    await storage.put({ storageKey: sourceKey, buffer: Buffer.from("original-bytes"), mimeType: "audio/mpeg" });
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        uploadedById: admin.id,
        title: "Promotable riff",
        materialType: "audio",
        storageKey: sourceKey,
        mimeType: "audio/mpeg",
        sizeBytes: 14
      }
    });

    const response = await promoteToLibrary(
      new NextRequest(`http://localhost/api/admin/learning-materials/${material.id}/promote-to-library`, {
        method: "POST",
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: material.id }) }
    );
    expect(response.status).toBe(201);
    const { item } = (await response.json()) as { item: { id: string } };

    const libraryRow = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    expect(libraryRow?.storageKey.startsWith("library/")).toBe(true);
    expect(libraryRow?.storageKey).not.toBe(sourceKey); // distinct physical object
    expect(await blobExists(libraryRow!.storageKey)).toBe(true);

    // Deleting the SOURCE material's blob must not touch the library master.
    await storage.delete({ storageKey: sourceKey });
    await prisma.learningMaterial.delete({ where: { id: material.id } });
    expect(await blobExists(libraryRow!.storageKey)).toBe(true);
    const stillReadable = await storage.get({ storageKey: libraryRow!.storageKey });
    expect(stillReadable.buffer.toString()).toBe("original-bytes");
  });

  it("AC-replace success: PUT repoints the row to a new key, streams new bytes, and drops the old blob", async () => {
    const { cookie } = await ownerCookie();
    const item = await uploadItem(cookie);
    const before = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    const oldKey = before!.storageKey;

    const form = new FormData();
    form.set("file", new File([Buffer.from("replacement-bytes")], "new.mp3", { type: "audio/mpeg" }));
    const response = await replaceLibraryFile(
      new NextRequest(`http://localhost/api/admin/library/${item.id}`, { method: "PUT", body: form, headers: { cookie } }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(response.status).toBe(200);

    const after = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    expect(after!.storageKey).not.toBe(oldKey);
    expect(await blobExists(after!.storageKey)).toBe(true);
    expect(await blobExists(oldKey)).toBe(false); // old blob best-effort deleted

    const storage = createMaterialStorageDriver();
    const streamed = await storage.get({ storageKey: after!.storageKey });
    expect(streamed.buffer.toString()).toBe("replacement-bytes");
  });

  it("AC-replace failure: a failed pointer-swap leaves the old blob + row intact and cleans the stray new blob", async () => {
    const { cookie } = await ownerCookie();
    const item = await uploadItem(cookie);
    const before = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    const oldKey = before!.storageKey;
    const libraryBlobsBefore = await libraryBlobCount();

    // Drive the service directly with a bogus libraryItemId so the metadata swap
    // (prisma update) fails AFTER the new blob is written — exercising the
    // compensating best-effort delete of the freshly written blob (AC-replace).
    await expect(
      replaceLibraryItemFile({
        libraryItemId: "does-not-exist",
        oldStorageKey: oldKey,
        buffer: Buffer.from("doomed-bytes"),
        materialType: "audio",
        mimeType: "audio/mpeg",
        extension: ".mp3",
        sizeBytes: 12
      })
    ).rejects.toBeTruthy();

    // The real item still points at the old key and still streams the old bytes.
    const untouched = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    expect(untouched!.storageKey).toBe(oldKey);
    expect(await blobExists(oldKey)).toBe(true);
    // No stray new blob leaked into the library namespace.
    expect(await libraryBlobCount()).toBe(libraryBlobsBefore);
  });

  it("AC11: deleting a LibraryItem cascades tags-join + assignments, deletes the blob, but keeps Tag vocab", async () => {
    const { cookie } = await ownerCookie();
    const item = await uploadItem(cookie);
    const customer = await createCustomer("Cascade Student", "cascade@example.com");
    const row = await prisma.libraryItem.findUnique({ where: { id: item.id } });

    await addTag(
      new NextRequest(`http://localhost/api/admin/library/${item.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ category: "Style", value: "Rock" }),
        headers: { cookie, "content-type": "application/json" }
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    await prisma.libraryAssignment.create({ data: { libraryItemId: item.id, customerId: customer.id } });

    const response = await deleteLibraryRoute(
      new NextRequest(`http://localhost/api/admin/library/${item.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(response.status).toBe(200);

    expect(await prisma.libraryItem.count({ where: { id: item.id } })).toBe(0);
    expect(await prisma.libraryItemTag.count({ where: { libraryItemId: item.id } })).toBe(0);
    expect(await prisma.libraryAssignment.count({ where: { libraryItemId: item.id } })).toBe(0);
    expect(await blobExists(row!.storageKey)).toBe(false);
    // Shared vocabulary survives (Tag is not owned by the item).
    expect(await prisma.tag.count({ where: { category: "Style", value: "Rock" } })).toBe(1);
  });

  it("AC12: deleting a Customer cascades their assignments but never touches the item or blob", async () => {
    const { cookie } = await ownerCookie();
    const item = await uploadItem(cookie);
    const customer = await createCustomer("Deletable Student", "deletable@example.com");
    const row = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    await prisma.libraryAssignment.create({ data: { libraryItemId: item.id, customerId: customer.id } });

    await prisma.customer.delete({ where: { id: customer.id } });

    expect(await prisma.libraryAssignment.count({ where: { customerId: customer.id } })).toBe(0);
    expect(await prisma.libraryItem.count({ where: { id: item.id } })).toBe(1);
    expect(await blobExists(row!.storageKey)).toBe(true);
  });

  it("AC9: unassign removes only that student's join row; blob and other assignees are untouched", async () => {
    const { cookie } = await ownerCookie();
    const item = await uploadItem(cookie);
    const studentA = await createCustomer("Unassign A", "unassign-a@example.com");
    const studentB = await createCustomer("Unassign B", "unassign-b@example.com");
    const row = await prisma.libraryItem.findUnique({ where: { id: item.id } });
    await prisma.libraryAssignment.createMany({
      data: [
        { libraryItemId: item.id, customerId: studentA.id },
        { libraryItemId: item.id, customerId: studentB.id }
      ]
    });

    const response = await unassignLibrary(
      new NextRequest(`http://localhost/api/admin/library/${item.id}/assignments/${studentA.id}`, {
        method: "DELETE",
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: item.id, customerId: studentA.id }) }
    );
    expect(response.status).toBe(200);

    expect(await prisma.libraryAssignment.count({ where: { libraryItemId: item.id, customerId: studentA.id } })).toBe(0);
    expect(await prisma.libraryAssignment.count({ where: { libraryItemId: item.id, customerId: studentB.id } })).toBe(1);
    expect(await blobExists(row!.storageKey)).toBe(true); // master blob never deleted on unassign
  });

  it("AC7/AC13: a non-owner teacher may upload, edit, delete + assign library items (scoping bypass on library WRITE)", async () => {
    const teacher = await createTeacher("library-teacher@example.com", "Library Teacher");
    const cookie = `${getSessionCookieName()}=${createSessionToken(teacher.email)}`;
    const customer = await createCustomer("Any Student", "any-student@example.com");

    // Upload (WRITE) succeeds for a plain teacher.
    const item = await uploadItem(cookie, "Teacher Upload");

    // Edit (PATCH) succeeds.
    const patch = await patchLibrary(
      new NextRequest(`http://localhost/api/admin/library/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Renamed" }),
        headers: { cookie, "content-type": "application/json" }
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(patch.status).toBe(200);

    // Assign to ANY student succeeds (equality across teachers).
    const assign = await assignLibrary(
      new NextRequest(`http://localhost/api/admin/library/${item.id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ customerIds: [customer.id] }),
        headers: { cookie, "content-type": "application/json" }
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(assign.status).toBe(201);

    // Delete succeeds.
    const del = await deleteLibraryRoute(
      new NextRequest(`http://localhost/api/admin/library/${item.id}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(del.status).toBe(200);
  });

  it("AC13: the library WRITE bypass does NOT grant per-customer read — same teacher is 403 on promote of an unmanaged material", async () => {
    const teacher = await createTeacher("bypass-contained@example.com", "Contained");
    const otherTeacher = await createTeacher("owns-the-customer@example.com", "Owner Teacher");
    const cookie = `${getSessionCookieName()}=${createSessionToken(teacher.email)}`;

    // Teacher can WRITE to the library (upload succeeds).
    await uploadItem(cookie, "Allowed Write");

    // But promoting a per-customer material they do NOT manage is still forbidden.
    const customer = await createCustomer("Not Mine", "not-mine@example.com", otherTeacher.id);
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        uploadedById: otherTeacher.id,
        title: "Not yours",
        materialType: "pdf",
        storageKey: `${customer.id}/general/not-yours.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 64
      }
    });

    const promote = await promoteToLibrary(
      new NextRequest(`http://localhost/api/admin/learning-materials/${material.id}/promote-to-library`, {
        method: "POST",
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: material.id }) }
    );
    expect(promote.status).toBe(403);
  });
});
