import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import * as bookingEvents from "@/lib/booking-events";
import { prisma } from "@/lib/db";
import { PATCH as patchBooking } from "@/app/api/admin/bookings/[id]/route";
import { PATCH as patchBookingRequest } from "@/app/api/admin/booking-requests/[id]/route";
import { DELETE as deleteBookingRequest } from "@/app/api/admin/booking-requests/[id]/route";
import { buildBookingRequestNoteImageStorageKey } from "@/lib/note-images";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import * as materialStorageModule from "@/lib/student-portal/material-storage";

// These tests call route handlers directly (without spinning up Next.js) so they
// can assert booking/request mutation semantics against a real Prisma DB.
function adminRequest(url: string, body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-booking-mutations", () => {
  beforeEach(async () => {
    // Clear dependent tables in child-to-parent order to keep each scenario
    // focused on the mutation under test rather than leftover relational state.
    await (prisma as any).storageCleanupTask.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("edits and moves confirmed bookings", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Student",
        email: "student@example.com",
        phone: "0400-000-000",
        address: "66 Street",
        houseNumber: "66",
        streetName: "Street",
        streetType: "Rd",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    // The URL path id here is cosmetic; the route reads the Prisma id from the
    // params object passed to the handler invocation below.
    const editReq = adminRequest("http://localhost/api/admin/bookings/id_1", {
      action: "edit",
      name: "Student Updated",
      lessonDuration: "min30",
      notes: "Bring notebook"
    }, token);
    const editRes = await patchBooking(editReq, { params: Promise.resolve({ id: booking.id }) });
    expect(editRes.status).toBe(200);

    const movedReq = adminRequest("http://localhost/api/admin/bookings/id_1", {
      action: "move",
      newStartAt: "2026-06-01T11:00:00.000Z"
    }, token);
    const moveRes = await patchBooking(movedReq, { params: Promise.resolve({ id: booking.id }) });
    expect(moveRes.status).toBe(200);

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id }
    });
    expect(updated.name).toBe("Student Updated");
    expect(updated.lessonDuration).toBe("min30");
    expect(updated.startAt.toISOString()).toBe("2026-06-01T11:00:00.000Z");
    expect(updated.endAt.toISOString()).toBe("2026-06-01T11:30:00.000Z");
  });

  it("persists confirmed booking notes longer than the legacy varchar limit", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const longNotes = "Practice alternate picking and chord transitions. ".repeat(6).trim();

    const booking = await prisma.booking.create({
      data: {
        name: "Long Notes Student",
        email: "long.notes.student@example.com",
        phone: "0400-000-014",
        address: "66 Street",
        houseNumber: "66",
        streetName: "Street",
        streetType: "Rd",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    const editReq = adminRequest("http://localhost/api/admin/bookings/id_1", {
      action: "edit",
      notes: longNotes
    }, token);
    const editRes = await patchBooking(editReq, { params: Promise.resolve({ id: booking.id }) });
    expect(editRes.status).toBe(200);

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id }
    });
    expect(updated.notes).toBe(longNotes);
    expect(longNotes.length).toBeGreaterThan(191);
  });

  it("accepts blank custom duration when editing a preset confirmed booking", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Preset Student",
        email: "preset.student@example.com",
        phone: "0400-000-012",
        address: "66 Street",
        houseNumber: "66",
        streetName: "Street",
        streetType: "Rd",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        customDurationMinutes: null,
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    const editReq = adminRequest("http://localhost/api/admin/bookings/id_1", {
      action: "edit",
      lessonDuration: "min30",
      customDurationMinutes: ""
    }, token);
    const editRes = await patchBooking(editReq, { params: Promise.resolve({ id: booking.id }) });
    expect(editRes.status).toBe(200);

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id }
    });
    expect(updated.lessonDuration).toBe("min30");
    expect(updated.customDurationMinutes).toBeNull();
    expect(updated.endAt.toISOString()).toBe("2026-06-01T09:30:00.000Z");
  });

  it("returns partial success when a booking move persists but notification delivery fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Delivery Failure",
        email: "delivery.failure@example.com",
        phone: "0400-000-010",
        address: "66 Street",
        houseNumber: "66",
        streetName: "Street",
        streetType: "Rd",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    vi.spyOn(bookingEvents, "sendCustomerBookingMovedEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const moveReq = adminRequest("http://localhost/api/admin/bookings/id_1", {
      action: "move",
      newStartAt: "2026-06-01T11:00:00.000Z"
    }, token);
    const moveRes = await patchBooking(moveReq, { params: Promise.resolve({ id: booking.id }) });
    expect(moveRes.status).toBe(200);

    const payload = (await moveRes.json()) as {
      ok?: boolean;
      partial?: boolean;
      warning?: string;
      deliveryStatus?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.partial).toBe(true);
    expect(payload.warning).toContain("smtp offline");
    expect(payload.deliveryStatus).toBe("failed");

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id }
    });
    expect(updated.startAt.toISOString()).toBe("2026-06-01T11:00:00.000Z");
    expect(updated.endAt.toISOString()).toBe("2026-06-01T12:00:00.000Z");
  });

  it("returns partial success when a booking move persists but no live mail provider is configured", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Queued Move",
        email: "queued.move@example.com",
        phone: "0400-000-011",
        address: "66 Street",
        houseNumber: "66",
        streetName: "Street",
        streetType: "Rd",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    vi.spyOn(bookingEvents, "sendCustomerBookingMovedEmail").mockResolvedValueOnce({
      status: "queued_no_smtp"
    });

    const moveReq = adminRequest("http://localhost/api/admin/bookings/id_1", {
      action: "move",
      newStartAt: "2026-06-01T11:00:00.000Z"
    }, token);
    const moveRes = await patchBooking(moveReq, { params: Promise.resolve({ id: booking.id }) });
    expect(moveRes.status).toBe(200);

    const payload = (await moveRes.json()) as {
      ok?: boolean;
      partial?: boolean;
      deliveryStatus?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.partial).toBe(true);
    expect(payload.deliveryStatus).toBe("queued_no_smtp");
  });

  it("edits and cancels pending requests via cancel action", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Pending Student",
        email: "pending@example.com",
        phone: "0400-000-001",
        address: "11 Street",
        houseNumber: "11",
        streetName: "Street",
        streetType: "Ave",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        requestedStartAt: new Date("2026-06-04T09:00:00.000Z"),
        status: "pending"
      }
    });

    const editReq = adminRequest("http://localhost/api/admin/booking-requests/id_1", {
      action: "edit",
      phone: "0411-111-111",
      requestedStartAt: "2026-06-04T12:00:00.000Z"
    }, token);
    const editRes = await patchBookingRequest(editReq, { params: Promise.resolve({ id: requestRow.id }) });
    expect(editRes.status).toBe(200);

    const cancelReq = adminRequest("http://localhost/api/admin/booking-requests/id_1", {
      action: "cancel"
    }, token);
    const cancelRes = await patchBookingRequest(cancelReq, { params: Promise.resolve({ id: requestRow.id }) });
    expect(cancelRes.status).toBe(202);
    const payload = (await cancelRes.json()) as {
      ok?: boolean;
      partial?: boolean;
      deliveryStatus?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.partial).toBe(true);
    expect(payload.deliveryStatus).toBe("queued_no_smtp");

    const updated = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(updated.phone).toBe("0411-111-111");
    expect(updated.requestedStartAt.toISOString()).toBe("2026-06-04T12:00:00.000Z");
    expect(updated.status).toBe("cancelled");
  });

  it("accepts blank custom duration when editing a preset pending request", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Preset Request",
        email: "preset.request@example.com",
        phone: "0400-000-013",
        address: "11 Street",
        houseNumber: "11",
        streetName: "Street",
        streetType: "Ave",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        customDurationMinutes: null,
        requestedStartAt: new Date("2026-06-04T09:00:00.000Z"),
        status: "pending"
      }
    });

    const editReq = adminRequest("http://localhost/api/admin/booking-requests/id_1", {
      action: "edit",
      lessonDuration: "min30",
      customDurationMinutes: ""
    }, token);
    const editRes = await patchBookingRequest(editReq, { params: Promise.resolve({ id: requestRow.id }) });
    expect(editRes.status).toBe(200);

    const updated = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(updated.lessonDuration).toBe("min30");
    expect(updated.customDurationMinutes).toBeNull();
  });

  it("persists booking request notes longer than the legacy varchar limit", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const longNotes = "Student requested extra focus on timing, rhythm, and finger independence. ".repeat(5).trim();

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Long Request Notes",
        email: "long.request.notes@example.com",
        phone: "0400-000-015",
        address: "11 Street",
        houseNumber: "11",
        streetName: "Street",
        streetType: "Ave",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        requestedStartAt: new Date("2026-06-04T09:00:00.000Z"),
        status: "pending"
      }
    });

    const editReq = adminRequest("http://localhost/api/admin/booking-requests/id_1", {
      action: "edit",
      notes: longNotes
    }, token);
    const editRes = await patchBookingRequest(editReq, { params: Promise.resolve({ id: requestRow.id }) });
    expect(editRes.status).toBe(200);

    const updated = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(updated.notes).toBe(longNotes);
    expect(longNotes.length).toBeGreaterThan(191);
  });

  it("returns partial success when request cancellation persists but notification delivery fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Cancel Failure",
        email: "cancel.failure@example.com",
        phone: "0400-000-021",
        address: "11 Street",
        houseNumber: "11",
        streetName: "Street",
        streetType: "Ave",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        requestedStartAt: new Date("2026-06-04T09:00:00.000Z"),
        status: "pending"
      }
    });

    vi.spyOn(bookingEvents, "sendCustomerBookingStatusEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const cancelReq = adminRequest("http://localhost/api/admin/booking-requests/id_1", {
      action: "cancel"
    }, token);
    const cancelRes = await patchBookingRequest(cancelReq, { params: Promise.resolve({ id: requestRow.id }) });
    expect(cancelRes.status).toBe(202);

    const payload = (await cancelRes.json()) as {
      ok?: boolean;
      partial?: boolean;
      warning?: string;
      deliveryStatus?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.partial).toBe(true);
    expect(payload.warning).toContain("smtp offline");
    expect(payload.deliveryStatus).toBe("failed");

    const updated = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(updated.status).toBe("cancelled");
  });

  it("permanently deletes non-approved booking requests", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Delete Me",
        email: "deleteme@example.com",
        phone: "0400-000-099",
        address: "12 Street",
        houseNumber: "12",
        streetName: "Street",
        streetType: "St",
        suburb: "Coburg",
        state: "VIC",
        postcode: "3058",
        lessonMode: "video",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-06-10T09:00:00.000Z"),
        status: "cancelled"
      }
    });

    // DELETE uses a raw NextRequest because adminRequest() is PATCH-specific.
    const request = new NextRequest(`http://localhost/api/admin/booking-requests/${requestRow.id}`, {
      method: "DELETE",
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });
    const response = await deleteBookingRequest(request, { params: Promise.resolve({ id: requestRow.id }) });
    expect(response.status).toBe(200);

    const deleted = await prisma.bookingRequest.findUnique({ where: { id: requestRow.id } });
    expect(deleted).toBeNull();
  });

  it("deletes booking-request note image storage when removing a non-approved request", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Delete Me With Images",
        email: "deleteme-images@example.com",
        phone: "0400-000-098",
        address: "12 Street",
        houseNumber: "12",
        streetName: "Street",
        streetType: "St",
        suburb: "Coburg",
        state: "VIC",
        postcode: "3058",
        lessonMode: "video",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-06-10T09:00:00.000Z"),
        status: "cancelled"
      }
    });

    const imageId = "delete-request-image";
    const storageKey = buildBookingRequestNoteImageStorageKey(requestRow.id, imageId, "png");
    const storage = createMaterialStorageDriver();
    await storage.put({
      storageKey,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    });

    await prisma.bookingRequestNoteImage.create({
      data: {
        id: imageId,
        bookingRequestId: requestRow.id,
        storageKey,
        mimeType: "image/png",
        sizeBytes: 4,
      },
    });

    const request = new NextRequest(`http://localhost/api/admin/booking-requests/${requestRow.id}`, {
      method: "DELETE",
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });
    const response = await deleteBookingRequest(request, { params: Promise.resolve({ id: requestRow.id }) });
    expect(response.status).toBe(200);

    await expect(storage.get({ storageKey })).rejects.toThrow();
    expect(await prisma.bookingRequest.findUnique({ where: { id: requestRow.id } })).toBeNull();
  });

  it("queues booking-request blob cleanup when request deletion cannot remove storage immediately", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Delete Me Queued",
        email: "deleteme-queued@example.com",
        phone: "0400-000-097",
        address: "12 Street",
        houseNumber: "12",
        streetName: "Street",
        streetType: "St",
        suburb: "Coburg",
        state: "VIC",
        postcode: "3058",
        lessonMode: "video",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-06-10T09:00:00.000Z"),
        status: "cancelled"
      }
    });

    const imageId = "queued-request-image";
    const storageKey = buildBookingRequestNoteImageStorageKey(requestRow.id, imageId, "png");
    const realDriver = createMaterialStorageDriver();
    await realDriver.put({
      storageKey,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    });

    await prisma.bookingRequestNoteImage.create({
      data: {
        id: imageId,
        bookingRequestId: requestRow.id,
        storageKey,
        mimeType: "image/png",
        sizeBytes: 4,
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

    const request = new NextRequest(`http://localhost/api/admin/booking-requests/${requestRow.id}`, {
      method: "DELETE",
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });
    const response = await deleteBookingRequest(request, { params: Promise.resolve({ id: requestRow.id }) });
    expect(response.status).toBe(200);

    expect(await prisma.bookingRequest.findUnique({ where: { id: requestRow.id } })).toBeNull();
    const queued = await (prisma as any).storageCleanupTask.findUniqueOrThrow({
      where: { storageKey },
    });
    expect(queued.scope).toBe("booking_request_note_image");
    expect(queued.entityId).toBe(requestRow.id);
    expect(queued.attemptCount).toBe(1);
    expect(queued.lastError).toContain("storage offline");

    deleteSpy.mockRestore();
    await realDriver.delete({ storageKey }).catch(() => undefined);
  });
});
