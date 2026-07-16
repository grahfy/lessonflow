import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as uploadCustomerMaterial } from "@/app/api/admin/customers/[id]/learning-materials/route";
import {
  DELETE as deleteLibraryRoute,
  GET as getLibraryItem,
  PUT as replaceLibraryFile
} from "@/app/api/admin/library/[id]/route";
import { POST as uploadLibrary } from "@/app/api/admin/library/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

type UploadEnvelope = {
  item: { id: string; title: string; materialType: string; mimeType: string };
  duplicateOf: { id: string; title: string; matchKind: "filename" | "legacy_title" } | null;
};

describe("library-upload-duplicate-probe", () => {
  beforeEach(async () => {
    await prisma.libraryItemTag.deleteMany();
    await prisma.libraryAssignment.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  async function ownerCookie() {
    const admin = await ensureOwnerAdmin();
    return { admin, cookie: `${getSessionCookieName()}=${createSessionToken(admin.email)}` };
  }

  async function upload(cookie: string, file: File, title?: string): Promise<{ status: number; body: UploadEnvelope }> {
    const form = new FormData();
    if (title) {
      form.set("title", title);
    }
    form.set("file", file);
    const response = await uploadLibrary(
      new NextRequest("http://localhost/api/admin/library", { method: "POST", body: form, headers: { cookie } })
    );
    return { status: response.status, body: (await response.json()) as UploadEnvelope };
  }

  it("accepts a Guitar Pro file (octet-stream) and persists its normalized originalFilename (AC-I1)", async () => {
    const { cookie } = await ownerCookie();
    const { status, body } = await upload(
      cookie,
      new File([Buffer.from("gp5-bytes")], "  Sweet Child.gp5 ", { type: "application/octet-stream" }),
      "Sweet Child"
    );
    expect(status).toBe(201);
    expect(body.item.materialType).toBe("guitar_pro");
    expect(body.item.mimeType).toBe("application/octet-stream");
    expect(body.duplicateOf).toBeNull();

    const row = await prisma.libraryItem.findUnique({ where: { id: body.item.id } });
    expect(row?.originalFilename).toBe("Sweet Child.gp5");
  });

  it("flags a re-upload of the same filename + size as matchKind filename; both rows exist", async () => {
    const { cookie } = await ownerCookie();
    const gpFile = () => new File([Buffer.from("gp5-bytes")], "Sweet Child.gp5", { type: "application/octet-stream" });

    const first = await upload(cookie, gpFile());
    const second = await upload(cookie, gpFile());

    expect(second.status).toBe(201);
    expect(second.body.duplicateOf).toEqual({
      id: first.body.item.id,
      title: first.body.item.title,
      matchKind: "filename"
    });
    // Spec: "uploaded but flagged" — the duplicate row IS created; review resolves it.
    expect(await prisma.libraryItem.count()).toBe(2);
  });

  it("same filename with a different size is not a duplicate", async () => {
    const { cookie } = await ownerCookie();
    await upload(cookie, new File([Buffer.from("short")], "riff.mp3", { type: "audio/mpeg" }));
    const other = await upload(cookie, new File([Buffer.from("much-longer-bytes")], "riff.mp3", { type: "audio/mpeg" }));
    expect(other.body.duplicateOf).toBeNull();
  });

  it("falls back to legacy_title for pre-column rows (originalFilename NULL)", async () => {
    const { cookie } = await ownerCookie();
    const bytes = Buffer.from("legacy-audio-bytes");

    // A legacy row: title derived the way legacy uploads did (filename sans
    // extension, sanitized) and no originalFilename captured.
    await prisma.libraryItem.create({
      data: {
        title: "Warm Up",
        materialType: "audio",
        storageKey: "library/legacy-warm-up.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: bytes.length,
        originalFilename: null
      }
    });

    const { body } = await upload(cookie, new File([bytes], "Warm Up.mp3", { type: "audio/mpeg" }));
    expect(body.duplicateOf?.matchKind).toBe("legacy_title");
    expect(body.duplicateOf?.title).toBe("Warm Up");
  });

  it("still rejects Guitar Pro on the per-customer upload route (AC-I1 — base classifier unchanged)", async () => {
    const { cookie } = await ownerCookie();
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "GP Student",
        email: "gp-student@example.com",
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
      })
    });

    const form = new FormData();
    form.set("file", new File([Buffer.from("gp5-bytes")], "Solo.gp5", { type: "application/octet-stream" }));
    const response = await uploadCustomerMaterial(
      new NextRequest(`http://localhost/api/admin/customers/${customer.id}/learning-materials`, {
        method: "POST",
        body: form,
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: customer.id }) }
    );
    expect(response.status).toBe(400);
    expect(await prisma.learningMaterial.count()).toBe(0);
  });

  it("replace-file PUT with a .gp5 updates type + originalFilename; dedupe and download name follow (AC-I9)", async () => {
    const { cookie } = await ownerCookie();
    const created = await upload(cookie, new File([Buffer.from("mp3-bytes")], "track.mp3", { type: "audio/mpeg" }));
    expect(created.body.item.materialType).toBe("audio");

    const replaceForm = new FormData();
    const gpBytes = Buffer.from("gp5-replacement-bytes");
    replaceForm.set("file", new File([gpBytes], "Etude.gp5", { type: "application/octet-stream" }));
    const replaced = await replaceLibraryFile(
      new NextRequest(`http://localhost/api/admin/library/${created.body.item.id}`, {
        method: "PUT",
        body: replaceForm,
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: created.body.item.id }) }
    );
    expect(replaced.status).toBe(200);
    const { item } = (await replaced.json()) as { item: { id: string; materialType: string } };
    expect(item.materialType).toBe("guitar_pro");

    // The pointer-swap updated originalFilename to the replacement's normalized name.
    const row = await prisma.libraryItem.findUnique({ where: { id: created.body.item.id } });
    expect(row?.originalFilename).toBe("Etude.gp5");

    // A subsequent upload of the same file is flagged duplicate against the replaced item.
    const reupload = await upload(
      cookie,
      new File([gpBytes], "Etude.gp5", { type: "application/octet-stream" })
    );
    expect(reupload.body.duplicateOf).toEqual({
      id: created.body.item.id,
      title: created.body.item.title,
      matchKind: "filename"
    });

    // The download filename carries the new extension (originalFilename fallback).
    const download = await getLibraryItem(
      new NextRequest(`http://localhost/api/admin/library/${created.body.item.id}`, {
        method: "GET",
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: created.body.item.id }) }
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain('.gp5"');
  });

  it("Discard deletes only the just-created duplicate; master and its assignments survive (AC-I6)", async () => {
    const { cookie } = await ownerCookie();
    const gpFile = () => new File([Buffer.from("gp5-bytes")], "Anthem.gp5", { type: "application/octet-stream" });

    const master = await upload(cookie, gpFile());
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Assigned Student",
        email: "assigned@example.com",
        phone: "0400111333",
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
    await prisma.libraryAssignment.create({
      data: { libraryItemId: master.body.item.id, customerId: customer.id }
    });

    const dup = await upload(cookie, gpFile());
    expect(dup.body.duplicateOf?.id).toBe(master.body.item.id);

    // Discard = DELETE on the NEW item id (captured at flag time — P3 guard).
    const discarded = await deleteLibraryRoute(
      new NextRequest(`http://localhost/api/admin/library/${dup.body.item.id}`, {
        method: "DELETE",
        headers: { cookie }
      }),
      { params: Promise.resolve({ id: dup.body.item.id }) }
    );
    expect(discarded.status).toBe(200);

    expect(await prisma.libraryItem.findUnique({ where: { id: dup.body.item.id } })).toBeNull();
    expect(await prisma.libraryItem.findUnique({ where: { id: master.body.item.id } })).not.toBeNull();
    expect(
      await prisma.libraryAssignment.count({ where: { libraryItemId: master.body.item.id } })
    ).toBe(1);
  });

  it("prefers the filename match over a legacy match and picks the oldest master", async () => {
    const { cookie } = await ownerCookie();
    const gpFile = () => new File([Buffer.from("gp5-bytes")], "Etude.gp5", { type: "application/octet-stream" });

    const first = await upload(cookie, gpFile());
    await upload(cookie, gpFile());
    const third = await upload(cookie, gpFile());

    // Oldest filename match wins — the flagged "existing item" is the original master.
    expect(third.body.duplicateOf?.id).toBe(first.body.item.id);
    expect(third.body.duplicateOf?.matchKind).toBe("filename");
  });
});
