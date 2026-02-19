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

    const createReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices`, "POST", token, {
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

    const listReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}/invoices?outstanding=true`, "GET", token);
    const listRes = await GET(listReq, { params: Promise.resolve({ id: customer.id }) });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { invoices: Array<{ customerId: string; customerEmail: string }> };

    expect(listBody.invoices.length).toBe(1);
    expect(listBody.invoices[0].customerId).toBe(customer.id);
    expect(listBody.invoices[0].customerEmail).toBe("invoice.student@example.com");
  });
});
