import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { POST as bookingNotifyPost } from "@/app/api/admin/bookings/[id]/notify/route";
import { POST as requestNotifyPost } from "@/app/api/admin/booking-requests/[id]/notify/route";

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
    await prisma.bookingRequest.deleteMany();
  });

  it("sends booking reminders and writes audit + outbound records", async () => {
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
    expect(res.status).toBe(200);

    const emailRow = await prisma.outboundEmail.findFirst({
      where: {
        toEmail: "student@example.com"
      }
    });
    expect(emailRow?.subject).toContain("reminder");

    const auditRow = await prisma.bookingAuditLog.findFirst({
      where: {
        bookingId: booking.id
      }
    });
    expect(auditRow?.action).toBe("reminder_sent");
  });

  it("sends custom request emails and stores request context in audit details", async () => {
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
    expect(res.status).toBe(200);

    const emailRow = await prisma.outboundEmail.findFirst({
      where: {
        toEmail: "pending@example.com",
        subject: "Custom note"
      }
    });
    expect(emailRow?.subject).toBe("Custom note");

    const auditRow = await prisma.bookingAuditLog.findFirst({
      where: {
        action: "custom_email_sent"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(auditRow?.action).toBe("custom_email_sent");
    expect(auditRow?.details).toContain(`requestId=${requestRow.id}`);
  });
});
