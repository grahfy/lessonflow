import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/admin/customers/[id]/invoices/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminRequest(url: string, method: "GET" | "POST", token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-customer-invoice-history", () => {
  beforeEach(async () => {
    // RATIONALE: Customer invoice history joins billing rows back through
    // bookings and customers, so each scenario starts from a clean billing graph.
    await prisma.invoiceAuditLog.deleteMany();
    await prisma.invoiceLineItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("creates and lists invoices scoped to a customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customer = await prisma.customer.create({
      data: {
        firstName: "Invoice",
        lastName: "Student",
        fullName: "Invoice Student",
        email: "invoice.student@example.com",
        phone: "0400111000",
        normalizedEmail: "invoice.student@example.com",
        normalizedPhone: "0400111000",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }
    });

    const booking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customer.skillLevel,
        lessonDuration: "min60",
        startAt: new Date("2026-09-15T08:00:00.000Z"),
        endAt: new Date("2026-09-15T09:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices`, "POST", token, {
      bookingId: booking.id,
      taxMode: "taxable",
      lineItems: [
        {
          kind: "lesson_fee",
          description: "Lesson fee",
          quantity: 1,
          unitPriceCents: 11000,
          taxMode: "taxable",
          sortOrder: 0
        }
      ]
    });
    const createRes = await POST(createReq, { params: Promise.resolve({ id: customer.id }) });
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { invoice: { bookingId: string | null } };
    expect(createBody.invoice.bookingId).toBe(booking.id);

    const listReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices?outstanding=true`, "GET", token);
    const listRes = await GET(listReq, { params: Promise.resolve({ id: customer.id }) });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { invoices: Array<{ customerId: string; customerEmail: string }> };

    // NOTE: The customer-specific endpoint should never leak invoices from the
    // broader admin list, even when other invoice search filters exist elsewhere.
    expect(listBody.invoices.length).toBe(1);
    expect(listBody.invoices[0].customerId).toBe(customer.id);
    expect(listBody.invoices[0].customerEmail).toBe("invoice.student@example.com");
  });

  it("rejects linking a booking that belongs to another customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customerA = await prisma.customer.create({
      data: {
        firstName: "Customer",
        lastName: "A",
        fullName: "Customer A",
        email: "customer-a@example.com",
        phone: "0400000001",
        normalizedEmail: "customer-a@example.com",
        normalizedPhone: "0400000001",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "1",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }
    });

    const customerB = await prisma.customer.create({
      data: {
        firstName: "Customer",
        lastName: "B",
        fullName: "Customer B",
        email: "customer-b@example.com",
        phone: "0400000002",
        normalizedEmail: "customer-b@example.com",
        normalizedPhone: "0400000002",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "2",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }
    });

    const bookingB = await prisma.booking.create({
      data: {
        name: customerB.fullName,
        email: customerB.email,
        phone: customerB.phone,
        address: "2 Main Street, Northcote VIC 3070",
        houseNumber: "2",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: customerB.skillLevel,
        lessonDuration: "min60",
        startAt: new Date("2026-10-01T08:00:00.000Z"),
        endAt: new Date("2026-10-01T09:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customerB.id,
        modifiedById: admin.id
      }
    });

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customerA.id}/invoices`, "POST", token, {
      bookingId: bookingB.id,
      taxMode: "taxable",
      lineItems: [
        {
          kind: "custom",
          description: "Standalone admin charge",
          quantity: 1,
          unitPriceCents: 3000,
          taxMode: "taxable",
          sortOrder: 0
        }
      ]
    });
    const createRes = await POST(createReq, { params: Promise.resolve({ id: customerA.id }) });
    // RATIONALE: Cross-customer booking linking would corrupt invoice history
    // and payment follow-up, so the route must reject it explicitly.
    expect(createRes.status).toBe(400);
  });
});
