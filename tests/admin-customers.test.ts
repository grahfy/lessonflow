import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { DELETE, PATCH } from "@/app/api/admin/customers/[id]/route";
import { GET, POST } from "@/app/api/admin/customers/route";

function adminRequest(url: string, method: "GET" | "POST" | "PATCH" | "DELETE", token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-customers", () => {
  beforeEach(async () => {
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("rejects unauthenticated customer list requests", async () => {
    const req = new NextRequest("http://localhost/api/admin/customers");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("creates, lists, and updates customers", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const createReq = adminRequest("http://localhost/api/admin/customers", "POST", token, {
      fullName: "Alex Student",
      email: "alex@example.com",
      phone: "0400123456",
      skillLevel: "intermediate"
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { customer: { id: string } };

    const listReq = adminRequest("http://localhost/api/admin/customers?q=alex", "GET", token);
    const listRes = await GET(listReq);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { customers: Array<{ fullName: string }> };
    expect(listBody.customers.map((row) => row.fullName)).toContain("Alex Student");

    const editReq = adminRequest(`http://localhost/api/admin/customers/${createBody.customer.id}`, "PATCH", token, {
      fullName: "Alex Student Updated",
      phone: "0400999888",
      skillLevel: "advanced"
    });
    const editRes = await PATCH(editReq, { params: Promise.resolve({ id: createBody.customer.id }) });
    expect(editRes.status).toBe(200);

    const updated = await prisma.customer.findUniqueOrThrow({
      where: { id: createBody.customer.id }
    });
    expect(updated.fullName).toBe("Alex Student Updated");
    expect(updated.phone).toBe("0400999888");
    expect(updated.skillLevel).toBe("advanced");
  });

  it("archives customer deletes when linked booking records exist", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customer = await prisma.customer.create({
      data: {
        fullName: "Linked Student",
        email: "linked@example.com",
        phone: "0400111222",
        normalizedEmail: "linked@example.com",
        normalizedPhone: "0400111222",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    await prisma.booking.create({
      data: {
        name: "Linked Booking",
        email: "linked@example.com",
        phone: "0400111222",
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: addDays(new Date(), 7),
        endAt: addDays(new Date(), 7),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
        modifiedById: admin.id
      }
    });

    const deleteReq = adminRequest(`http://localhost/api/admin/customers/${customer.id}`, "DELETE", token);
    const deleteRes = await DELETE(deleteReq, { params: Promise.resolve({ id: customer.id }) });
    expect(deleteRes.status).toBe(200);
    const body = (await deleteRes.json()) as { archived: boolean };
    expect(body.archived).toBe(true);

    const archived = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id }
    });
    expect(archived.isArchived).toBe(true);
  });
});
