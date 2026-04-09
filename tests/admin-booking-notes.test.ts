import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin } from "@/lib/admin-auth";
import { getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { PATCH as patchBooking } from "@/app/api/admin/bookings/[id]/route";
import { POST as postNotesImage } from "@/app/api/admin/bookings/[id]/notes-image/route";
import { GET as getStudentPortal } from "@/app/api/student/portal/route";
import { customerSnapshotFromInput } from "@/lib/customer-match";
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

describe("admin-booking-notes", () => {
  beforeEach(async () => {
    await prisma.bookingNoteImage.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
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
});

describe("notes-image upload", () => {
  beforeEach(async () => {
    await prisma.bookingNoteImage.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
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

    // Create a small valid PNG (1x1 pixel)
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const formData = new FormData();
    formData.append("file", new File([pngBytes], "test.png", { type: "image/png" }));

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
});
