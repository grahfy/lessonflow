import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { PATCH as patchBooking } from "@/app/api/admin/bookings/[id]/route";
import { PATCH as patchBookingRequest } from "@/app/api/admin/booking-requests/[id]/route";
import { DELETE as deleteBookingRequest } from "@/app/api/admin/booking-requests/[id]/route";

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
    expect(cancelRes.status).toBe(200);

    const updated = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestRow.id }
    });
    expect(updated.phone).toBe("0411-111-111");
    expect(updated.requestedStartAt.toISOString()).toBe("2026-06-04T12:00:00.000Z");
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
});
