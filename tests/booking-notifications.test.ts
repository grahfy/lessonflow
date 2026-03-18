import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/booking-requests/route";
import { PATCH as patchBookingRequest } from "@/app/api/admin/booking-requests/[id]/route";
import { PATCH as patchBooking } from "@/app/api/admin/bookings/[id]/route";
import { POST as notifyBooking } from "@/app/api/admin/bookings/[id]/notify/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";

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

describe("booking-notifications", () => {
  beforeEach(async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("records an outbound email for the owner when a booking request is submitted", async () => {
    const startAt = addDays(new Date(), 7).toISOString();

    const request = new Request("http://localhost/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Test",
        lastName: "Customer",
        name: "Test Customer",
        email: "test@example.com",
        phone: "0400-000-000",
        postcode: "3000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: startAt,
        isRecurring: false,
        captchaToken: "test-token",
        captchaAnswer: "test-answer"
      })
    });

    const response = await POST(request);
    // Public booking requests persist first, so degraded owner notification is a partial-success 202.
    expect([200, 202]).toContain(response.status);

    const outboundEmails = await prisma.outboundEmail.findMany();
    expect(outboundEmails.length).toBeGreaterThan(0);
    
    const ownerEmail = outboundEmails.find(e => e.subject.toLowerCase().includes("new booking request"));
    expect(ownerEmail).toBeDefined();
    expect(ownerEmail?.toEmail).toBe("admin@example.com");
  });

  it("records an outbound email for the customer when a booking request is rejected", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        name: "Reject Me",
        email: "reject@example.com",
        phone: "0400-000-000",
        address: "123 Fake St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: addDays(new Date(), 7)
      }
    });

    const request = adminRequest(`http://localhost/api/admin/booking-requests/${bookingRequest.id}`, {
      action: "reject"
    }, token);

    const response = await patchBookingRequest(request, { params: Promise.resolve({ id: bookingRequest.id }) });
    expect([200, 202]).toContain(response.status);

    const outboundEmails = await prisma.outboundEmail.findMany({
      where: { toEmail: "reject@example.com" }
    });
    expect(outboundEmails.length).toBeGreaterThan(0);
    expect(outboundEmails[0].subject.toLowerCase()).toContain("booking");
  });

  it("records an outbound email for the customer when a booking request is approved", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const bookingRequest = await prisma.bookingRequest.create({
      data: {
        name: "Approve Me",
        email: "approve@example.com",
        phone: "0400-000-000",
        address: "123 Fake St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: addDays(new Date(), 7)
      }
    });

    const request = adminRequest(`http://localhost/api/admin/booking-requests/${bookingRequest.id}`, {
      action: "approve"
    }, token);

    const response = await patchBookingRequest(request, { params: Promise.resolve({ id: bookingRequest.id }) });
    expect([200, 202]).toContain(response.status);

    const outboundEmails = await prisma.outboundEmail.findMany({
      where: { toEmail: "approve@example.com" }
    });
    expect(outboundEmails.length).toBeGreaterThan(0);
    expect(outboundEmails[0].subject.toLowerCase()).toContain("approved");
  });

  it("records an outbound email for the customer when a booking is moved", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Move Me",
        email: "move@example.com",
        phone: "0400-000-000",
        address: "123 Fake St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T09:30:00.000Z"),
        timezone: "Australia/Melbourne"
      }
    });

    const request = adminRequest(`http://localhost/api/admin/bookings/${booking.id}`, {
      action: "move",
      newStartAt: "2026-06-01T10:00:00.000Z"
    }, token);

    const response = await patchBooking(request, { params: Promise.resolve({ id: booking.id }) });
    expect(response.status).toBe(200);

    const outboundEmails = await prisma.outboundEmail.findMany({
      where: { toEmail: "move@example.com" }
    });
    expect(outboundEmails.length).toBeGreaterThan(0);
    expect(outboundEmails[0].subject.toLowerCase()).toContain("updated");
  });

  it("records an outbound email for the customer when a manual reminder is sent", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Remind Me",
        email: "remind@example.com",
        phone: "0400-000-000",
        address: "123 Fake St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T09:30:00.000Z"),
        timezone: "Australia/Melbourne"
      }
    });

    const request = new NextRequest(`http://localhost/api/admin/bookings/${booking.id}/notify`, {
      method: "POST",
      body: JSON.stringify({ action: "reminder" }),
      headers: {
        "content-type": "application/json",
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await notifyBooking(request, { params: Promise.resolve({ id: booking.id }) });
    expect(response.status).toBe(503);

    const outboundEmails = await prisma.outboundEmail.findMany({
      where: { toEmail: "remind@example.com" }
    });
    expect(outboundEmails.length).toBeGreaterThan(0);
    expect(outboundEmails[0].subject.toLowerCase()).toContain("reminder");
  });

  it("records an outbound email for the customer when a custom email is sent", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Custom Me",
        email: "custom@example.com",
        phone: "0400-000-000",
        address: "123 Fake St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        endAt: new Date("2026-06-01T09:30:00.000Z"),
        timezone: "Australia/Melbourne"
      }
    });

    const request = new NextRequest(`http://localhost/api/admin/bookings/${booking.id}/notify`, {
      method: "POST",
      body: JSON.stringify({
        action: "custom",
        subject: "Special Note",
        message: "This is a custom message"
      }),
      headers: {
        "content-type": "application/json",
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await notifyBooking(request, { params: Promise.resolve({ id: booking.id }) });
    expect(response.status).toBe(503);

    const outboundEmails = await prisma.outboundEmail.findMany({
      where: { toEmail: "custom@example.com" }
    });
    expect(outboundEmails.length).toBeGreaterThan(0);
    expect(outboundEmails[0].subject).toBe("Special Note");
  });
});
