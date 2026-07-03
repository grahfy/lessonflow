import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as downloadLibrary } from "@/app/api/student/library/[id]/download/route";
import { GET as studentPortal } from "@/app/api/student/portal/route";
import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { studentPortalPayloadSchema } from "@/lib/student-portal/contracts";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";
import { buildLibraryItemStorageKey } from "@/lib/student-portal/materials";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

const STORAGE_ROOT = getLocalMaterialStorageRoot();

describe("student-library", () => {
  beforeEach(async () => {
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

  async function createCustomer(name: string, email: string) {
    return prisma.customer.create({
      data: customerSnapshotFromInput({
        name,
        email,
        phone: "0400333444",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "3",
        streetName: "Music",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });
  }

  /** Creates a LibraryItem with a real blob on disk and returns it. */
  async function createLibraryItem(content: string, mimeType = "audio/mpeg") {
    await ensureOwnerAdmin();
    const storageKey = buildLibraryItemStorageKey({ extension: ".mp3" });
    await createMaterialStorageDriver().put({ storageKey, buffer: Buffer.from(content), mimeType });
    return prisma.libraryItem.create({
      data: {
        title: "Shared Master",
        materialType: "audio",
        storageKey,
        mimeType,
        sizeBytes: content.length
      }
    });
  }

  function studentDownload(itemId: string, customerId: string | null, headers: Record<string, string> = {}) {
    const requestHeaders: Record<string, string> = { ...headers };
    if (customerId) {
      requestHeaders.cookie = `${getStudentSessionCookieName()}=${createStudentSessionToken(customerId)}`;
    }
    const request = new NextRequest(`http://localhost/api/student/library/${itemId}/download`, {
      headers: requestHeaders
    });
    return downloadLibrary(request, { params: Promise.resolve({ id: itemId }) });
  }

  it("AC10: an assigned student streams the master → 200", async () => {
    const student = await createCustomer("Assigned Student", "assigned@example.com");
    const item = await createLibraryItem("shared-audio-bytes");
    await prisma.libraryAssignment.create({ data: { libraryItemId: item.id, customerId: student.id } });

    const response = await studentDownload(item.id, student.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-disposition") || "").toContain("Shared Master");
  });

  it("AC10: an UNassigned student → 404 (never 200, never 403 — non-assignee cannot confirm existence)", async () => {
    const student = await createCustomer("Assigned Student", "assigned@example.com");
    const outsider = await createCustomer("Outsider Student", "outsider@example.com");
    const item = await createLibraryItem("shared-audio-bytes");
    // Only `student` is assigned; `outsider` is not.
    await prisma.libraryAssignment.create({ data: { libraryItemId: item.id, customerId: student.id } });

    const response = await studentDownload(item.id, outsider.id);
    expect(response.status).toBe(404);
    expect(response.status).not.toBe(200);
    expect(response.status).not.toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Material not found or access denied.");
  });

  it("AC10: a non-existent item id for any student → 404 (indistinguishable from not-assigned)", async () => {
    const student = await createCustomer("Some Student", "some@example.com");
    const response = await studentDownload("does-not-exist", student.id);
    expect(response.status).toBe(404);
  });

  it("AC10: no student session → 401", async () => {
    const item = await createLibraryItem("shared-audio-bytes");
    const response = await studentDownload(item.id, null);
    expect(response.status).toBe(401);
  });

  it("AC10: a byte-range request from an assigned student → 206 with a correct content-range", async () => {
    const student = await createCustomer("Range Student", "range@example.com");
    const content = "0123456789"; // 10 bytes
    const item = await createLibraryItem(content);
    await prisma.libraryAssignment.create({ data: { libraryItemId: item.id, customerId: student.id } });

    const response = await studentDownload(item.id, student.id, { range: "bytes=2-5" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 2-5/${content.length}`);
    expect(response.headers.get("content-length")).toBe("4");
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe("2345");
  });

  it("AC5: the portal payload exposes the item under `assignedByTeacher` with working URLs and one shared blob", async () => {
    const student = await createCustomer("Portal Student", "portal@example.com");
    const item = await createLibraryItem("shared-audio-bytes");
    await prisma.libraryAssignment.create({ data: { libraryItemId: item.id, customerId: student.id } });

    const request = new NextRequest("http://localhost/api/student/portal", {
      headers: { cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(student.id)}` }
    });
    const response = await studentPortal(request);
    expect(response.status).toBe(200);

    const payload = studentPortalPayloadSchema.parse(await response.json());
    expect(payload.assignedByTeacher).toBeDefined();
    const assigned = payload.assignedByTeacher ?? [];
    expect(assigned).toHaveLength(1);
    const entry = assigned[0];
    // The entry id is the LibraryItem id and drives the assignment-gated download URLs.
    expect(entry.id).toBe(item.id);
    expect(entry.downloadUrl).toBe(`/api/student/library/${item.id}/download`);
    expect(entry.previewUrl).toBe(`/api/student/library/${item.id}/download?disposition=inline`);

    // The file is referenced, not duplicated: exactly one LibraryItem storageKey backs it.
    const rows = await prisma.libraryItem.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].storageKey).toBe(item.storageKey);
  });

  it("AC5: an item assigned to two students is a single master blob shared by reference", async () => {
    const studentA = await createCustomer("Shared A", "shared-a@example.com");
    const studentB = await createCustomer("Shared B", "shared-b@example.com");
    const item = await createLibraryItem("shared-audio-bytes");
    await prisma.libraryAssignment.createMany({
      data: [
        { libraryItemId: item.id, customerId: studentA.id },
        { libraryItemId: item.id, customerId: studentB.id }
      ]
    });

    // Both assignees resolve to the SAME single physical object (one storageKey).
    for (const student of [studentA, studentB]) {
      const response = await studentDownload(item.id, student.id);
      expect(response.status).toBe(200);
    }
    expect(await prisma.libraryItem.count()).toBe(1);
  });
});
