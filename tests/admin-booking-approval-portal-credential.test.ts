import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/admin/booking-requests/[id]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminPatch(id: string, token: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/booking-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

function baseRequestData(overrides?: Partial<Parameters<typeof prisma.bookingRequest.create>[0]["data"]>) {
  return {
    firstName: "Alex",
    lastName: "Student",
    name: "Alex Student",
    email: "alex.student@example.com",
    phone: "0400123456",
    address: "66 High Street, Northcote VIC 3070",
    houseNumber: "66",
    streetName: "High",
    streetType: "Street",
    suburb: "Northcote",
    state: "VIC",
    postcode: "3070",
    lessonMode: "in_person" as const,
    skillLevel: "beginner" as const,
    lessonDuration: "min60" as const,
    requestedStartAt: new Date("2026-06-03T09:00:00.000Z"),
    status: "pending" as const,
    ...overrides
  };
}

describe("admin-booking-approval-portal-credential", () => {
  beforeEach(async () => {
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.outboundEmail.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("resolves customer, persists customerId, and sends first-time portal credentials on approval", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData()
    });

    const response = await PATCH(
      adminPatch(requestRow.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );
    expect(response.status).toBe(200);

    const approvedRequest = await prisma.bookingRequest.findUniqueOrThrow({
      where: {
        id: requestRow.id
      }
    });
    expect(approvedRequest.status).toBe("approved");
    expect(approvedRequest.customerId).toBeTruthy();

    const booking = await prisma.booking.findFirstOrThrow({
      where: {
        requestId: requestRow.id
      }
    });
    expect(booking.customerId).toBe(approvedRequest.customerId);

    const credential = await prisma.customerPortalCredential.findUnique({
      where: {
        customerId: approvedRequest.customerId || ""
      }
    });
    expect(credential).not.toBeNull();

    const emailRow = await prisma.outboundEmail.findFirstOrThrow({
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(emailRow.subject).toContain("approved");
    expect(emailRow.htmlBody).toContain("/student/login");
    expect(emailRow.htmlBody).toContain("Temporary password");
  });

  it("does not rotate portal credentials on later approvals for same customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const firstRequest = await prisma.bookingRequest.create({
      data: baseRequestData()
    });
    const secondRequest = await prisma.bookingRequest.create({
      data: baseRequestData({
        requestedStartAt: new Date("2026-06-10T09:00:00.000Z"),
        notes: "Second lesson request"
      })
    });

    await PATCH(
      adminPatch(firstRequest.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: firstRequest.id }) }
    );
    const credentialAfterFirst = await prisma.customerPortalCredential.findFirstOrThrow();
    const firstEmail = await prisma.outboundEmail.findFirstOrThrow({
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(firstEmail.htmlBody).toContain("Temporary password");

    await PATCH(
      adminPatch(secondRequest.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: secondRequest.id }) }
    );

    const credentials = await prisma.customerPortalCredential.findMany();
    expect(credentials).toHaveLength(1);
    expect(credentials[0]?.id).toBe(credentialAfterFirst.id);

    const emails = await prisma.outboundEmail.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(emails).toHaveLength(2);
    expect(emails[1]?.htmlBody).not.toContain("Temporary password");
  });

  it("preserves first/last names when approving recurring requests", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const startAt = new Date("2026-06-03T09:00:00.000Z");
    const recurrenceEndAt = new Date("2026-06-24T09:00:00.000Z");

    const requestRow = await prisma.bookingRequest.create({
      data: baseRequestData({
        isRecurring: true,
        recurrenceEndAt,
        requestedStartAt: startAt
      })
    });

    const response = await PATCH(
      adminPatch(requestRow.id, token, {
        action: "approve"
      }),
      { params: Promise.resolve({ id: requestRow.id }) }
    );
    expect(response.status).toBe(200);

    const createdBookings = await prisma.booking.findMany({
      where: { requestId: requestRow.id },
      orderBy: { startAt: "asc" }
    });
    expect(createdBookings.length).toBeGreaterThan(1);
    for (const booking of createdBookings) {
      expect(booking.firstName).toBe("Alex");
      expect(booking.lastName).toBe("Student");
    }

    const series = await prisma.bookingSeries.findFirst({
      where: { customerId: createdBookings[0]?.customerId || "" }
    });
    expect(series?.firstName).toBe("Alex");
    expect(series?.lastName).toBe("Student");
  });
});
