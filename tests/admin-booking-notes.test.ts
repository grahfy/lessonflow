import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin } from "@/lib/admin-auth";
import { getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { PATCH as patchBooking } from "@/app/api/admin/bookings/[id]/route";
import { POST as postNotesImage } from "@/app/api/admin/bookings/[id]/notes-image/route";
import { PATCH as patchBookingRequest } from "@/app/api/admin/booking-requests/[id]/route";
import { POST as postRequestNotesImage } from "@/app/api/admin/booking-requests/[id]/notes-image/route";
import { GET as getStudentPortal } from "@/app/api/student/portal/route";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import {
  buildBookingNoteImageStorageKey,
  buildBookingNoteImageUrl,
  buildBookingRequestNoteImageStorageKey,
  buildBookingRequestNoteImageUrl,
  createNoteImageRecordWithRollback,
} from "@/lib/note-images";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import * as materialStorageModule from "@/lib/student-portal/material-storage";
import { tiptapJsonToPlainText, plainTextToTiptapJson } from "@/lib/tiptap-utils";
import { createStudentSessionToken } from "@/lib/student-portal/session";

function adminPatchRequest(url: string, body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`,
    },
  });
}

const SAMPLE_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Worked on " }, { type: "text", marks: [{ type: "bold" }], text: "chord transitions" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Practice Am to C daily." }],
    },
  ],
};

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function expectStorageMissing(storageKey: string) {
  const driver = createMaterialStorageDriver();
  await expect(driver.get({ storageKey })).rejects.toThrow();
}

describe("admin-booking-notes", () => {
  beforeEach(async () => {
    await (prisma as any).storageCleanupTask.deleteMany();
    await prisma.bookingRequestNoteImage.deleteMany();
    await prisma.bookingNoteImage.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("saves notesContent and derives plain-text notes", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Test Student",
        email: "test@example.com",
        phone: "0400-000-000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/bookings/x", {
      action: "edit",
      notesContent: SAMPLE_DOC,
    }, token);
    const res = await patchBooking(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(200);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // notesContent should be stored as JSON
    expect(updated.notesContent).toBeTruthy();
    const stored = updated.notesContent as Record<string, unknown>;
    expect(stored.type).toBe("doc");

    // Plain-text notes should be derived from the JSON
    expect(updated.notes).toContain("chord transitions");
    expect(updated.notes).toContain("Practice Am to C daily.");
  });

  it("clears notesContent when set to null", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Test Student",
        email: "test@example.com",
        phone: "0400-000-000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
        notesContent: SAMPLE_DOC,
        notes: "Worked on chord transitions",
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/bookings/x", {
      action: "edit",
      notesContent: null,
      notes: null,
    }, token);
    const res = await patchBooking(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(200);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.notesContent).toBeNull();
    expect(updated.notes).toBeNull();
  });

  it("backward compat: booking with only plain-text notes still works", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Legacy Student",
        email: "legacy@example.com",
        phone: "0400-000-000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
        notes: "Old plain text note",
      },
    });

    // Editing without notesContent should preserve the old notes
    const req = adminPatchRequest("http://localhost/api/admin/bookings/x", {
      action: "edit",
      lessonDuration: "min30",
    }, token);
    const res = await patchBooking(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(200);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.notes).toBe("Old plain text note");
    expect(updated.notesContent).toBeNull();
  });

  it("student portal includes notesContent", async () => {
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Portal Student",
        email: "portal@example.com",
        phone: "0400000000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
      }),
    });

    const admin = await ensureOwnerAdmin();

    await prisma.booking.create({
      data: {
        name: "Portal Student",
        email: "portal@example.com",
        phone: "0400-000-000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2027-06-01T09:00:00.000Z"),
        endAt: new Date("2027-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
        customerId: customer.id,
        notesContent: SAMPLE_DOC,
        notes: "Worked on chord transitions\nPractice Am to C daily.",
      },
    });

    const studentToken = createStudentSessionToken(customer.id);
    const req = new NextRequest("http://localhost/api/student/portal", {
      method: "GET",
      headers: {
        cookie: `student_session=${studentToken}`,
      },
    });
    const res = await getStudentPortal(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    const upcoming = data.upcoming as Array<Record<string, unknown>>;
    expect(upcoming.length).toBe(1);
    expect(upcoming[0].notesContent).toBeTruthy();
    const nc = upcoming[0].notesContent as Record<string, unknown>;
    expect(nc.type).toBe("doc");
  });
});

describe("tiptap-utils", () => {
  it("extracts plain text from TipTap JSON", () => {
    const text = tiptapJsonToPlainText(SAMPLE_DOC);
    expect(text).toContain("Worked on");
    expect(text).toContain("chord transitions");
    expect(text).toContain("Practice Am to C daily.");
  });

  it("converts plain text to minimal TipTap document", () => {
    const doc = plainTextToTiptapJson("Line one\nLine two");
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(2);
    expect((doc.content[0] as Record<string, unknown>).type).toBe("paragraph");
  });

  it("returns empty doc for blank text", () => {
    const doc = plainTextToTiptapJson("");
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(0);
  });

  it("returns empty string for null/invalid input", () => {
    expect(tiptapJsonToPlainText(null)).toBe("");
    expect(tiptapJsonToPlainText(undefined)).toBe("");
    expect(tiptapJsonToPlainText("not json")).toBe("");
  });

  it("rolls back stored note images when metadata creation fails", async () => {
    const storageKey = buildBookingNoteImageStorageKey("rollback-booking", randomUUID(), "png");
    const driver = createMaterialStorageDriver();

    await driver.put({
      storageKey,
      buffer: Buffer.from(PNG_BYTES),
      mimeType: "image/png",
    });

    await expect(
      createNoteImageRecordWithRollback({
        db: prisma,
        storageKey,
        scope: "booking_note_image",
        entityId: "rollback-booking",
        createRecord: async () => {
          throw new Error("metadata insert failed");
        },
      })
    ).rejects.toThrow("metadata insert failed");

    await expectStorageMissing(storageKey);
  });

  it("queues rollback cleanup when blob deletion fails during metadata rollback", async () => {
    const deleteSpy = vi.spyOn(materialStorageModule, "createMaterialStorageDriver").mockReturnValue({
      put: async () => undefined,
      get: async () => ({ buffer: Buffer.from(PNG_BYTES) }),
      delete: async () => {
        throw new Error("storage offline");
      },
    });

    await expect(
      createNoteImageRecordWithRollback({
        db: prisma,
        storageKey: "bookings/rollback-booking/notes/rollback.png",
        scope: "booking_note_image",
        entityId: "rollback-booking",
        createRecord: async () => {
          throw new Error("metadata insert failed");
        },
      })
    ).rejects.toThrow("metadata insert failed");

    const queued = await (prisma as any).storageCleanupTask.findUniqueOrThrow({
      where: { storageKey: "bookings/rollback-booking/notes/rollback.png" },
    });
    expect(queued.scope).toBe("booking_note_image");
    expect(queued.entityId).toBe("rollback-booking");

    deleteSpy.mockRestore();
  });
});

describe("notes-image upload", () => {
  beforeEach(async () => {
    await (prisma as any).storageCleanupTask.deleteMany();
    await prisma.bookingRequestNoteImage.deleteMany();
    await prisma.bookingNoteImage.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("rejects non-image files", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Test Student",
        email: "test@example.com",
        phone: "0400-000-000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
      },
    });

    const formData = new FormData();
    formData.append("file", new File(["test content"], "document.pdf", { type: "application/pdf" }));

    const req = new NextRequest("http://localhost/api/admin/bookings/x/notes-image", {
      method: "POST",
      body: formData,
      headers: {
        cookie: `${getSessionCookieName()}=${token}`,
      },
    });

    const res = await postNotesImage(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("JPEG, PNG, GIF, and WebP");
  });

  it("rejects oversized images", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Test Student",
        email: "test@example.com",
        phone: "0400-000-000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
      },
    });

    // Create a 6MB file (over the 5MB limit)
    const oversized = new Uint8Array(6 * 1024 * 1024);
    const formData = new FormData();
    formData.append("file", new File([oversized], "big.png", { type: "image/png" }));

    const req = new NextRequest("http://localhost/api/admin/bookings/x/notes-image", {
      method: "POST",
      body: formData,
      headers: {
        cookie: `${getSessionCookieName()}=${token}`,
      },
    });

    const res = await postNotesImage(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("5 MB");
  });

  it("accepts valid images and returns URL", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Test Student",
        email: "test@example.com",
        phone: "0400-000-000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
      },
    });

    const formData = new FormData();
    formData.append("file", new File([PNG_BYTES], "test.png", { type: "image/png" }));

    const req = new NextRequest("http://localhost/api/admin/bookings/x/notes-image", {
      method: "POST",
      body: formData,
      headers: {
        cookie: `${getSessionCookieName()}=${token}`,
      },
    });

    const res = await postNotesImage(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.url).toContain(`/api/admin/bookings/${booking.id}/notes-image/`);
    expect(data.id).toBeTruthy();

    // Verify the DB record was created
    const images = await prisma.bookingNoteImage.findMany({ where: { bookingId: booking.id } });
    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toBe("image/png");
  });

  it("removes unreferenced booking note images when notesContent is saved without them", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Cleanup Student",
        email: "cleanup@example.com",
        phone: "0400-000-002",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
      },
    });

    const imageId = randomUUID();
    const storageKey = buildBookingNoteImageStorageKey(booking.id, imageId, "png");
    const driver = createMaterialStorageDriver();
    await driver.put({
      storageKey,
      buffer: Buffer.from(PNG_BYTES),
      mimeType: "image/png",
    });

    await prisma.bookingNoteImage.create({
      data: {
        id: imageId,
        bookingId: booking.id,
        storageKey,
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
      },
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        notesContent: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: {
                src: buildBookingNoteImageUrl(booking.id, imageId),
                alt: "To remove",
              },
            },
          ],
        },
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/bookings/x", {
      action: "edit",
      notesContent: SAMPLE_DOC,
    }, token);
    const res = await patchBooking(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(200);

    expect(await prisma.bookingNoteImage.count({ where: { bookingId: booking.id } })).toBe(0);
    await expectStorageMissing(storageKey);
  });

  it("removes all booking note images when notesContent is cleared", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Clear Images Student",
        email: "clear-images@example.com",
        phone: "0400-000-003",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
      },
    });

    const imageId = randomUUID();
    const storageKey = buildBookingNoteImageStorageKey(booking.id, imageId, "png");
    const driver = createMaterialStorageDriver();
    await driver.put({
      storageKey,
      buffer: Buffer.from(PNG_BYTES),
      mimeType: "image/png",
    });

    await prisma.bookingNoteImage.create({
      data: {
        id: imageId,
        bookingId: booking.id,
        storageKey,
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/bookings/x", {
      action: "edit",
      notesContent: null,
      notes: null,
    }, token);
    const res = await patchBooking(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(200);

    expect(await prisma.bookingNoteImage.count({ where: { bookingId: booking.id } })).toBe(0);
    await expectStorageMissing(storageKey);
  });

  it("keeps a durable cleanup task when booking blob deletion fails after save", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Queued Cleanup Student",
        email: "queued-cleanup@example.com",
        phone: "0400-000-004",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id,
      },
    });

    const imageId = randomUUID();
    const storageKey = buildBookingNoteImageStorageKey(booking.id, imageId, "png");
    const realDriver = createMaterialStorageDriver();
    await realDriver.put({
      storageKey,
      buffer: Buffer.from(PNG_BYTES),
      mimeType: "image/png",
    });

    await prisma.bookingNoteImage.create({
      data: {
        id: imageId,
        bookingId: booking.id,
        storageKey,
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
      },
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        notesContent: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: {
                src: buildBookingNoteImageUrl(booking.id, imageId),
                alt: "To queue",
              },
            },
          ],
        },
      },
    });

    const deleteSpy = vi.spyOn(materialStorageModule, "createMaterialStorageDriver").mockReturnValue({
      put: realDriver.put.bind(realDriver),
      get: realDriver.get.bind(realDriver),
      delete: async (input) => {
        if (input.storageKey === storageKey) {
          throw new Error("storage offline");
        }
        return realDriver.delete(input);
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/bookings/x", {
      action: "edit",
      notesContent: SAMPLE_DOC,
    }, token);
    const res = await patchBooking(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(200);

    expect(await prisma.bookingNoteImage.count({ where: { bookingId: booking.id } })).toBe(0);
    const queued = await (prisma as any).storageCleanupTask.findUniqueOrThrow({
      where: { storageKey },
    });
    expect(queued.scope).toBe("booking_note_image");
    expect(queued.entityId).toBe(booking.id);
    expect(queued.attemptCount).toBe(1);
    expect(queued.lastError).toContain("storage offline");

    deleteSpy.mockRestore();
    await realDriver.delete({ storageKey }).catch(() => undefined);
  });
});

describe("booking-request rich notes", () => {
  beforeEach(async () => {
    await (prisma as any).storageCleanupTask.deleteMany();
    await prisma.bookingRequestNoteImage.deleteMany();
    await prisma.bookingNoteImage.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("saves booking request notesContent and derives plain-text notes", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        firstName: "Request",
        lastName: "Student",
        name: "Request Student",
        email: "request@example.com",
        phone: "0400000000",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        requestedStartAt: new Date("2026-06-01T09:00:00.000Z"),
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/booking-requests/x", {
      action: "edit",
      notesContent: SAMPLE_DOC,
    }, token);
    const res = await patchBookingRequest(req, { params: Promise.resolve({ id: bookingRequest.id }) });
    expect(res.status).toBe(200);

    const updated = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: bookingRequest.id } });
    expect(updated.notesContent).toBeTruthy();
    expect(updated.notes).toContain("chord transitions");
    expect(updated.notes).toContain("Practice Am to C daily.");
  });

  it("uploads booking request note images", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        firstName: "Image",
        lastName: "Request",
        name: "Image Request",
        email: "request-image@example.com",
        phone: "0400000001",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        requestedStartAt: new Date("2026-06-01T09:00:00.000Z"),
      },
    });

    const formData = new FormData();
    formData.append("file", new File([PNG_BYTES], "request.png", { type: "image/png" }));

    const req = new NextRequest("http://localhost/api/admin/booking-requests/x/notes-image", {
      method: "POST",
      body: formData,
      headers: {
        cookie: `${getSessionCookieName()}=${token}`,
      },
    });

    const res = await postRequestNotesImage(req, { params: Promise.resolve({ id: bookingRequest.id }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.url).toContain(`/api/admin/booking-requests/${bookingRequest.id}/notes-image/`);

    const images = await prisma.bookingRequestNoteImage.findMany({
      where: { bookingRequestId: bookingRequest.id }
    });
    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe("image/png");
  });

  it("removes unreferenced booking-request note images when notesContent is saved without them", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        firstName: "Request",
        lastName: "Cleanup",
        name: "Request Cleanup",
        email: "request-cleanup@example.com",
        phone: "0400000002",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        requestedStartAt: new Date("2026-06-01T09:00:00.000Z"),
      },
    });

    const imageId = randomUUID();
    const storageKey = buildBookingRequestNoteImageStorageKey(bookingRequest.id, imageId, "png");
    const driver = createMaterialStorageDriver();
    await driver.put({
      storageKey,
      buffer: Buffer.from(PNG_BYTES),
      mimeType: "image/png",
    });

    await prisma.bookingRequestNoteImage.create({
      data: {
        id: imageId,
        bookingRequestId: bookingRequest.id,
        storageKey,
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
      },
    });

    await prisma.bookingRequest.update({
      where: { id: bookingRequest.id },
      data: {
        notesContent: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: {
                src: buildBookingRequestNoteImageUrl(bookingRequest.id, imageId),
                alt: "To remove",
              },
            },
          ],
        },
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/booking-requests/x", {
      action: "edit",
      notesContent: SAMPLE_DOC,
    }, token);
    const res = await patchBookingRequest(req, { params: Promise.resolve({ id: bookingRequest.id }) });
    expect(res.status).toBe(200);

    expect(await prisma.bookingRequestNoteImage.count({ where: { bookingRequestId: bookingRequest.id } })).toBe(0);
    await expectStorageMissing(storageKey);
  });

  it("clears booking-request note images when notesContent is set to null", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        firstName: "Request",
        lastName: "Clear",
        name: "Request Clear",
        email: "request-clear@example.com",
        phone: "0400000003",
        address: "1 Main St",
        houseNumber: "1",
        streetName: "Main",
        streetType: "St",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        requestedStartAt: new Date("2026-06-01T09:00:00.000Z"),
      },
    });

    const imageId = randomUUID();
    const storageKey = buildBookingRequestNoteImageStorageKey(bookingRequest.id, imageId, "png");
    const driver = createMaterialStorageDriver();
    await driver.put({
      storageKey,
      buffer: Buffer.from(PNG_BYTES),
      mimeType: "image/png",
    });

    await prisma.bookingRequestNoteImage.create({
      data: {
        id: imageId,
        bookingRequestId: bookingRequest.id,
        storageKey,
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
      },
    });

    const req = adminPatchRequest("http://localhost/api/admin/booking-requests/x", {
      action: "edit",
      notesContent: null,
      notes: null,
    }, token);
    const res = await patchBookingRequest(req, { params: Promise.resolve({ id: bookingRequest.id }) });
    expect(res.status).toBe(200);

    expect(await prisma.bookingRequestNoteImage.count({ where: { bookingRequestId: bookingRequest.id } })).toBe(0);
    await expectStorageMissing(storageKey);
  });
});
