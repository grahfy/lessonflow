import { addDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/admin/bookings/route";
import * as portalCredentials from "@/lib/student-portal/credentials";

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

/**
 * Produces the minimal manual-booking payload and lets each scenario override
 * only the match-specific fields under test.
 */
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

function historicalIso(yearOffset = -1, month = 6, day = 10, hour = 10): string {
  return new Date(Date.UTC(new Date().getUTCFullYear() + yearOffset, month - 1, day, hour, 0, 0)).toISOString();
}

describe("admin-manual-booking-customer-match", () => {
  beforeEach(async () => {
    // NOTE: Manual booking can create both direct bookings and recurring series,
    // so cleanup must remove both paths before each deterministic scenario.
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
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

  it("creates and links a customer automatically for historical manual bookings", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = historicalIso();

    const res = await POST(adminPost(basePayload(startAt), token));
    expect(res.status).toBe(200);

    const booking = await prisma.booking.findFirstOrThrow({
      where: {
        startAt: new Date(startAt)
      }
    });
    expect(booking.customerId).toBeTruthy();

    const customer = await prisma.customer.findUniqueOrThrow({
      where: {
        id: booking.customerId!
      }
    });
    expect(customer.normalizedEmail).toBe("taylor@example.com");
  });

  it("creates and links a customer automatically for next-year manual bookings", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const nextYear = new Date().getUTCFullYear() + 1;
    const startAt = new Date(Date.UTC(nextYear, 0, 10, 10, 0, 0)).toISOString();

    const res = await POST(adminPost(basePayload(startAt), token));
    expect(res.status).toBe(200);

    const booking = await prisma.booking.findFirstOrThrow({
      where: {
        startAt: new Date(startAt)
      }
    });
    expect(booking.customerId).toBeTruthy();
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
    // RATIONALE: The route returns enough detail for the admin dialog to offer
    // "use existing" or "update existing" instead of silently creating a clone.
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
    // NOTE: updateCustomerFromBooking is opt-in because a new booking's intake
    // details are not always authoritative for the existing customer profile.
    expect(customer.fullName).toBe("Taylor Updated");
    expect(customer.skillLevel).toBe("intermediate");
  });

  it("persists first/last names for recurring manual bookings", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = addDays(new Date(), 10).toISOString();
    const recurrenceEndAt = addDays(new Date(), 24).toISOString();

    const response = await POST(
      adminPost(
        {
          ...basePayload(startAt),
          isRecurring: true,
          recurrenceEndAt
        },
        token
      )
    );
    expect(response.status).toBe(200);

    const bookings = await prisma.booking.findMany({
      where: { email: "taylor@example.com" },
      orderBy: { startAt: "asc" }
    });
    expect(bookings.length).toBeGreaterThan(1);
    const series = await prisma.bookingSeries.findFirstOrThrow({
      where: { email: "taylor@example.com" }
    });
    expect(series.isActive).toBe(true);
    // RATIONALE: Recurring manual bookings expand into multiple rows, so each
    // generated booking must keep the structured name fields for later edits.
    for (const booking of bookings) {
      expect(booking.firstName).toBe("Taylor");
      expect(booking.lastName).toBe("Student");
      expect(booking.seriesId).toBe(series.id);
    }
  });

  it("creates recurring manual bookings that start in the past", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = historicalIso();
    const recurrenceEndAt = historicalIso(-1, 6, 24, 10);

    const response = await POST(
      adminPost(
        {
          ...basePayload(startAt),
          isRecurring: true,
          recurrenceEndAt
        },
        token
      )
    );

    expect(response.status).toBe(200);
    const bookings = await prisma.booking.findMany({
      where: { email: "taylor@example.com" },
      orderBy: { startAt: "asc" }
    });
    expect(bookings).toHaveLength(3);
    expect(bookings[0]?.startAt.toISOString()).toBe(startAt);
    expect(bookings[2]?.startAt.toISOString()).toBe(recurrenceEndAt);
  });

  it("creates recurring manual bookings that span year boundaries", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const year = new Date().getUTCFullYear();
    const startAt = new Date(Date.UTC(year, 11, 20, 10, 0, 0)).toISOString();
    const recurrenceEndAt = new Date(Date.UTC(year + 1, 0, 17, 10, 0, 0)).toISOString();

    const response = await POST(
      adminPost(
        {
          ...basePayload(startAt),
          isRecurring: true,
          recurrenceEndAt
        },
        token
      )
    );

    expect(response.status).toBe(200);
    const bookings = await prisma.booking.findMany({
      where: { email: "taylor@example.com" },
      orderBy: { startAt: "asc" }
    });
    expect(bookings).toHaveLength(5);
    expect(bookings[0]?.startAt.toISOString()).toBe(startAt);
    expect(bookings[4]?.startAt.toISOString()).toBe(recurrenceEndAt);
  });

  it("rejects recurring manual bookings when the end is before the first booking", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = historicalIso(-1, 6, 24, 10);
    const recurrenceEndAt = historicalIso(-1, 6, 10, 10);

    const response = await POST(
      adminPost(
        {
          ...basePayload(startAt),
          isRecurring: true,
          recurrenceEndAt
        },
        token
      )
    );

    expect(response.status).toBe(400);
    const bookings = await prisma.booking.findMany({
      where: { email: "taylor@example.com" }
    });
    expect(bookings).toHaveLength(0);
  });

  it("rolls back manual booking customer creation when portal provisioning fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const startAt = addDays(new Date(), 10).toISOString();

    vi.spyOn(portalCredentials, "ensurePortalCredentialForCustomer").mockRejectedValueOnce(
      new Error("portal provisioning failed")
    );

    const response = await POST(adminPost(basePayload(startAt), token));
    expect(response.status).toBe(500);

    const customer = await prisma.customer.findFirst({
      where: {
        email: "taylor@example.com"
      }
    });
    expect(customer).toBeNull();

    const booking = await prisma.booking.findFirst({
      where: {
        email: "taylor@example.com"
      }
    });
    expect(booking).toBeNull();
  });
});
