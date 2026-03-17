import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { POST as bookingNotifyPost } from "@/app/api/admin/bookings/[id]/notify/route";
import { POST as requestNotifyPost } from "@/app/api/admin/booking-requests/[id]/notify/route";
import * as bookingEvents from "@/lib/booking-events";

function adminPost(url: string, body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-notify-actions", () => {
  beforeEach(async () => {
    await prisma.bookingAuditLog.deleteMany();
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("returns a configuration error for booking reminders when no live provider is configured", async () => {
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

    const req = adminPost("http://localhost/api/admin/bookings/booking_1/notify", { action: "reminder" }, token);
    const res = await bookingNotifyPost(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(503);

    const emailRow = await prisma.outboundEmail.findFirst({
      where: {
        toEmail: "student@example.com"
      }
    });
    expect(emailRow?.subject).toContain("reminder");
    expect(emailRow?.status).toBe("queued_no_smtp");

    const auditRow = await prisma.bookingAuditLog.findFirst({
      where: {
        bookingId: booking.id
      }
    });
    expect(auditRow).toBeNull();
  });

  it("returns a configuration error for booking-request custom emails when no live provider is configured", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    async function createPendingRequest() {
      return prisma.bookingRequest.create({
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
    }

    let requestRow = await createPendingRequest();
    const body = {
      action: "custom",
      subject: "Custom note",
      message: "Please confirm arrival time."
    };

    let res = await requestNotifyPost(
      adminPost("http://localhost/api/admin/booking-requests/request_1/notify", body, token),
      { params: Promise.resolve({ id: requestRow.id }) }
    );
    if (res.status === 404) {
      requestRow = await createPendingRequest();
      res = await requestNotifyPost(
        adminPost("http://localhost/api/admin/booking-requests/request_1/notify", body, token),
        { params: Promise.resolve({ id: requestRow.id }) }
      );
    }
    expect(res.status).toBe(503);

    const emailRow = await prisma.outboundEmail.findFirst({
      where: {
        toEmail: "pending@example.com",
        subject: "Custom note"
      }
    });
    expect(emailRow?.subject).toBe("Custom note");
    expect(emailRow?.status).toBe("queued_no_smtp");

    const auditRow = await prisma.bookingAuditLog.findFirst({
      where: {
        action: "custom_email_sent"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(auditRow).toBeNull();
  });

  it("returns an error when booking reminder delivery fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const booking = await prisma.booking.create({
      data: {
        name: "Reminder Failure",
        email: "reminder.failure@example.com",
        phone: "0400-000-002",
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
        startAt: new Date("2026-06-02T09:00:00.000Z"),
        endAt: new Date("2026-06-02T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        modifiedById: admin.id
      }
    });

    vi.spyOn(bookingEvents, "sendCustomerReminderEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const req = adminPost("http://localhost/api/admin/bookings/booking_1/notify", { action: "reminder" }, token);
    const res = await bookingNotifyPost(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(502);
  });

  it("returns an error when booking-request custom delivery fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: {
        name: "Request Failure",
        email: "request.failure@example.com",
        phone: "0400-000-003",
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
        requestedStartAt: new Date("2026-06-05T09:00:00.000Z"),
        status: "pending"
      }
    });

    vi.spyOn(bookingEvents, "sendCustomerCustomEmail").mockResolvedValueOnce({
      status: "failed",
      error: "smtp offline"
    });

    const res = await requestNotifyPost(
      adminPost(
        "http://localhost/api/admin/booking-requests/request_1/notify",
        { action: "custom", subject: "Custom note", message: "Please reply." },
        token
      ),
      { params: Promise.resolve({ id: requestRow.id }) }
    );
    expect(res.status).toBe(502);
  });
});
