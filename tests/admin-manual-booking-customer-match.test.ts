import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/admin/bookings/route";

function adminPost(body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/bookings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

function basePayload(startAt: string) {
  return {
    firstName: "Taylor",
    lastName: "Student",
    name: "Taylor Student",
    email: "taylor@example.com",
    phone: "0400123456",
    unitNumber: "2",
    houseNumber: "66",
    streetName: "High",
    streetType: "Street",
    suburb: "Northcote",
    state: "VIC",
    postcode: "3070",
    lessonMode: "video",
    skillLevel: "intermediate",
    lessonDuration: "min60",
    requestedStartAt: startAt,
    isRecurring: false
  };
}

describe("admin-manual-booking-customer-match", () => {
  beforeEach(async () => {
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("creates and links a customer automatically for new manual bookings", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = addDays(new Date(), 10).toISOString();

    const res = await POST(adminPost(basePayload(startAt), token));
    expect(res.status).toBe(200);

    const customer = await prisma.customer.findFirstOrThrow({
      where: {
        normalizedEmail: "taylor@example.com"
      }
    });
    const booking = await prisma.booking.findFirstOrThrow({
      where: {
        email: "taylor@example.com"
      }
    });
    expect(booking.customerId).toBe(customer.id);
    const credential = await prisma.customerPortalCredential.findUnique({
      where: {
        customerId: customer.id
      }
    });
    expect(credential).not.toBeNull();
  });

  it("returns conflict for existing deterministic customer match and allows using existing", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = addDays(new Date(), 11).toISOString();

    const existing = await prisma.customer.create({
      data: {
        fullName: "Taylor Existing",
        email: "taylor@example.com",
        phone: "0400123456",
        normalizedEmail: "taylor@example.com",
        normalizedPhone: "0400123456",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const conflictRes = await POST(adminPost(basePayload(startAt), token));
    expect(conflictRes.status).toBe(409);
    const conflictBody = (await conflictRes.json()) as { code?: string; customer?: { id: string } };
    expect(conflictBody.code).toBe("CUSTOMER_MATCH");
    expect(conflictBody.customer?.id).toBe(existing.id);

    const resolveRes = await POST(
      adminPost(
        {
          ...basePayload(startAt),
          customerId: existing.id
        },
        token
      )
    );
    expect(resolveRes.status).toBe(200);

    const booking = await prisma.booking.findFirstOrThrow({
      where: {
        startAt: new Date(startAt)
      }
    });
    expect(booking.customerId).toBe(existing.id);
    const credential = await prisma.customerPortalCredential.findUnique({
      where: {
        customerId: existing.id
      }
    });
    expect(credential).not.toBeNull();
  });

  it("updates existing customer profile when requested during conflict resolution", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = addDays(new Date(), 12).toISOString();

    const existing = await prisma.customer.create({
      data: {
        fullName: "Old Name",
        email: "taylor@example.com",
        phone: "0400123456",
        normalizedEmail: "taylor@example.com",
        normalizedPhone: "0400123456",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const updateRes = await POST(
      adminPost(
        {
          ...basePayload(startAt),
          firstName: "Taylor",
          lastName: "Updated",
          name: "Taylor Updated",
          customerId: existing.id,
          updateCustomerFromBooking: true
        },
        token
      )
    );
    expect(updateRes.status).toBe(200);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: existing.id }
    });
    expect(customer.fullName).toBe("Taylor Updated");
    expect(customer.skillLevel).toBe("intermediate");
  });
});
