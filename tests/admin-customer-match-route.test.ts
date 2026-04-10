import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/admin/customers/match/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

function adminGet(url: string, token: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: {
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-customer-match-route", () => {
  beforeEach(async () => {
    await prisma.bookingRequestNoteImage.deleteMany();
    await prisma.bookingNoteImage.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("returns exact_match for normalized email and phone hits", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        firstName: "Ava",
        lastName: "Student",
        name: "Ava Student",
        email: "ava@example.com",
        phone: "0400000000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
      }),
    });

    const response = await GET(
      adminGet("http://localhost/api/admin/customers/match?email=AVA%40example.com&phone=0400-000-000", token)
    );
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      status: string;
      customers: Array<{ id: string }>;
    };
    expect(payload.status).toBe("exact_match");
    expect(payload.customers[0]?.id).toBe(customer.id);
  });

  it("returns linked when a request is already attached to a customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        firstName: "Liam",
        lastName: "Linked",
        name: "Liam Linked",
        email: "liam@example.com",
        phone: "0411000000",
        lessonMode: "video",
        skillLevel: "intermediate",
        unitNumber: undefined,
        houseNumber: "22",
        streetName: "Bridge",
        streetType: "Road",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
      }),
    });

    const response = await GET(
      adminGet(`http://localhost/api/admin/customers/match?customerId=${customer.id}`, token)
    );
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      status: string;
      customers: Array<{ id: string }>;
    };
    expect(payload.status).toBe("linked");
    expect(payload.customers[0]?.id).toBe(customer.id);
  });

  it("returns no_match when the customer database has no match", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await GET(
      adminGet("http://localhost/api/admin/customers/match?firstName=Nope&lastName=Missing&email=missing%40example.com&phone=0400999999", token)
    );
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      status: string;
      customers: Array<unknown>;
    };
    expect(payload.status).toBe("no_match");
    expect(payload.customers).toEqual([]);
  });

  it("returns possible_match for name and postcode matches without exact contact details", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        firstName: "Nina",
        lastName: "Example",
        name: "Nina Example",
        email: "nina@example.com",
        phone: "0400123000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "5",
        streetName: "Park",
        streetType: "Street",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
      }),
    });

    const response = await GET(
      adminGet("http://localhost/api/admin/customers/match?firstName=Nina&lastName=Example&postcode=3000", token)
    );
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      status: string;
      customers: Array<{ id: string }>;
    };
    expect(payload.status).toBe("possible_match");
    expect(payload.customers[0]?.id).toBe(customer.id);
  });

  it("excludes archived customers from exact and possible matches", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          firstName: "Archived",
          lastName: "Example",
          name: "Archived Example",
          email: "archived@example.com",
          phone: "0400999888",
          lessonMode: "video",
          skillLevel: "intermediate",
          unitNumber: undefined,
          houseNumber: "8",
          streetName: "Lake",
          streetType: "Road",
          suburb: "Melbourne",
          state: "VIC",
          postcode: "3000",
        }),
        isArchived: true,
      },
    });

    const response = await GET(
      adminGet("http://localhost/api/admin/customers/match?email=archived%40example.com&firstName=Archived&lastName=Example&postcode=3000", token)
    );
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      status: string;
      customers: Array<unknown>;
    };
    expect(payload.status).toBe("no_match");
    expect(payload.customers).toEqual([]);
  });

  it("scopes teacher lookups to their own primary-teacher customers", async () => {
    const owner = await ensureOwnerAdmin();
    const teacher = await prisma.adminUser.create({
      data: {
        email: `teacher-match-${Date.now()}@example.com`,
        role: "teacher",
        firstName: "Teach",
        displayName: "Teach Match",
        passwordHash: "not-used",
        isActive: true,
      },
    });

    const teacherToken = createSessionToken(teacher.email);

    const ownedCustomer = await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          firstName: "Teacher",
          lastName: "Owned",
          name: "Teacher Owned",
          email: "teacher-owned@example.com",
          phone: "0400222333",
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "12",
          streetName: "Teacher",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
        }),
        primaryTeacherId: teacher.id,
      },
    });

    await prisma.customer.create({
      data: {
        ...customerSnapshotFromInput({
          firstName: "Teacher",
          lastName: "Other",
          name: "Teacher Other",
          email: "teacher-other@example.com",
          phone: "0400222444",
          lessonMode: "in_person",
          skillLevel: "beginner",
          unitNumber: undefined,
          houseNumber: "14",
          streetName: "Teacher",
          streetType: "Street",
          suburb: "Northcote",
          state: "VIC",
          postcode: "3070",
        }),
        primaryTeacherId: owner.id,
      },
    });

    const response = await GET(
      adminGet("http://localhost/api/admin/customers/match?firstName=Teacher&postcode=3070", teacherToken)
    );
    expect(response.status).toBe(200);

    const payload = await response.json() as {
      status: string;
      customers: Array<{ id: string }>;
    };
    expect(payload.status).toBe("possible_match");
    expect(payload.customers).toHaveLength(1);
    expect(payload.customers[0]?.id).toBe(ownedCustomer.id);
  });
});
