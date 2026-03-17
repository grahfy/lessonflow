import { addDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { DELETE, PATCH } from "@/app/api/admin/customers/[id]/route";
import { GET, POST } from "@/app/api/admin/customers/route";
import * as portalCredentials from "@/lib/student-portal/credentials";

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
      firstName: "Alex",
      lastName: "Student",
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
    const credential = await prisma.customerPortalCredential.findUnique({
      where: {
        customerId: createBody.customer.id
      }
    });
    expect(credential).not.toBeNull();
  });

  it("rolls back customer creation when portal credential provisioning fails", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    vi.spyOn(portalCredentials, "ensurePortalCredentialForCustomer").mockRejectedValueOnce(
      new Error("credential provisioning failed")
    );

    const createReq = adminRequest("http://localhost/api/admin/customers", "POST", token, {
      firstName: "Rollback",
      lastName: "Student",
      fullName: "Rollback Student",
      email: "rollback@example.com",
      phone: "0400555444",
      skillLevel: "intermediate"
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(500);

    const persisted = await prisma.customer.findFirst({
      where: {
        email: "rollback@example.com"
      }
    });
    expect(persisted).toBeNull();
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

  it("sorts customer lists by customer name and skill/mode in both directions", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.customer.createMany({
      data: [
        {
          firstName: "Charlie",
          lastName: "Student",
          fullName: "Charlie Student",
          normalizedFullName: "charlie student",
          email: "charlie@example.com",
          phone: "0400000001",
          normalizedEmail: "charlie@example.com",
          normalizedPhone: "0400000001",
          skillLevel: "intermediate",
          lessonMode: "video"
        },
        {
          firstName: "Alice",
          lastName: "Student",
          fullName: "Alice Student",
          normalizedFullName: "alice student",
          email: "alice@example.com",
          phone: "0400000002",
          normalizedEmail: "alice@example.com",
          normalizedPhone: "0400000002",
          skillLevel: "beginner",
          lessonMode: "video"
        },
        {
          firstName: "Bob",
          lastName: "Student",
          fullName: "Bob Student",
          normalizedFullName: "bob student",
          email: "bob@example.com",
          phone: "0400000003",
          normalizedEmail: "bob@example.com",
          normalizedPhone: "0400000003",
          skillLevel: "beginner",
          lessonMode: "in_person"
        },
        {
          firstName: "Dylan",
          lastName: "Student",
          fullName: "Dylan Student",
          normalizedFullName: "dylan student",
          email: "dylan@example.com",
          phone: "0400000004",
          normalizedEmail: "dylan@example.com",
          normalizedPhone: "0400000004",
          skillLevel: "advanced",
          lessonMode: "in_person"
        }
      ]
    });

    const fetchNames = async (sortBy: "customer" | "skill_mode", sortDir: "asc" | "desc") => {
      const req = adminRequest(
        `http://localhost/api/admin/customers?page=1&pageSize=250&sortBy=${sortBy}&sortDir=${sortDir}`,
        "GET",
        token
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { customers: Array<{ fullName: string }> };
      return body.customers.map((row) => row.fullName);
    };

    expect(await fetchNames("customer", "asc")).toEqual([
      "Alice Student",
      "Bob Student",
      "Charlie Student",
      "Dylan Student"
    ]);
    expect(await fetchNames("customer", "desc")).toEqual([
      "Dylan Student",
      "Charlie Student",
      "Bob Student",
      "Alice Student"
    ]);

    expect(await fetchNames("skill_mode", "asc")).toEqual([
      "Bob Student",
      "Alice Student",
      "Charlie Student",
      "Dylan Student"
    ]);
    expect(await fetchNames("skill_mode", "desc")).toEqual([
      "Dylan Student",
      "Charlie Student",
      "Alice Student",
      "Bob Student"
    ]);
  });

  it("filters customer lists to a supplied set of customer ids", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const [alex, beth, chris] = await Promise.all([
      prisma.customer.create({
        data: {
          fullName: "Alex Student",
          normalizedFullName: "alex student",
          email: "alex@example.com",
          phone: "0400000101",
          normalizedEmail: "alex@example.com",
          normalizedPhone: "0400000101",
          skillLevel: "beginner",
          lessonMode: "in_person"
        }
      }),
      prisma.customer.create({
        data: {
          fullName: "Beth Student",
          normalizedFullName: "beth student",
          email: "beth@example.com",
          phone: "0400000102",
          normalizedEmail: "beth@example.com",
          normalizedPhone: "0400000102",
          skillLevel: "intermediate",
          lessonMode: "video"
        }
      }),
      prisma.customer.create({
        data: {
          fullName: "Chris Student",
          normalizedFullName: "chris student",
          email: "chris@example.com",
          phone: "0400000103",
          normalizedEmail: "chris@example.com",
          normalizedPhone: "0400000103",
          skillLevel: "advanced",
          lessonMode: "video"
        }
      })
    ]);

    const req = adminRequest(
      `http://localhost/api/admin/customers?customerIds=${alex.id},${chris.id}`,
      "GET",
      token
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { customers: Array<{ id: string }> };
    expect(body.customers.map((customer) => customer.id)).toEqual([alex.id, chris.id]);
    expect(body.customers.map((customer) => customer.id)).not.toContain(beth.id);
  });
});
