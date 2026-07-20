import { addDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { getCustomerNamePresentation } from "@/lib/customers/name";
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

  it("names the missing address fields when creating a customer", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const res = await POST(
      adminRequest("http://localhost/api/admin/customers", "POST", token, {
        firstName: "Nomad",
        lastName: "Student",
        fullName: "Nomad Student",
        email: "nomad@example.com",
        phone: "0400123999",
        skillLevel: "beginner"
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { details: { fieldErrors: Record<string, string[]> } };
    expect(body.details.fieldErrors.houseNumber).toEqual(["House number is required."]);
    expect(body.details.fieldErrors.suburb).toEqual(["Suburb is required."]);
    expect(body.details.fieldErrors.firstName).toBeUndefined();
  });

  it("does not return the matched record on a duplicate conflict", async () => {
    // SECURITY: the duplicate lookup spans every customer, including ones the
    // caller cannot manage. Returning the row let a teacher read another
    // teacher's student by guessing an email or phone.
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const other = await prisma.customer.create({
      data: {
        firstName: "Private",
        lastName: "Student",
        fullName: "Private Student",
        email: "private@example.com",
        normalizedEmail: "private@example.com",
        phone: "0400888111",
        normalizedPhone: "0400888111",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "99",
        streetName: "Secret",
        streetType: "Lane",
        suburb: "Fitzroy",
        state: "VIC",
        postcode: "3065"
      }
    });

    const createRes = await POST(
      adminRequest("http://localhost/api/admin/customers", "POST", token, {
        firstName: "Probe",
        lastName: "Attacker",
        fullName: "Probe Attacker",
        email: "private@example.com",
        phone: "0400999222",
        houseNumber: "1",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    );
    expect(createRes.status).toBe(409);
    const createBody = (await createRes.json()) as Record<string, unknown>;
    expect(createBody.customer).toBeUndefined();
    expect(JSON.stringify(createBody)).not.toContain("Secret");
    expect(JSON.stringify(createBody)).not.toContain("private@example.com");

    const mine = await prisma.customer.create({
      data: {
        firstName: "Mine",
        lastName: "Student",
        fullName: "Mine Student",
        email: "mine@example.com",
        normalizedEmail: "mine@example.com",
        phone: "0400888222",
        normalizedPhone: "0400888222",
        skillLevel: "beginner",
        lessonMode: "in_person"
      }
    });

    const patchRes = await PATCH(
      adminRequest(`http://localhost/api/admin/customers/${mine.id}`, "PATCH", token, {
        email: "private@example.com"
      }),
      { params: Promise.resolve({ id: mine.id }) }
    );
    expect(patchRes.status).toBe(409);
    const patchBody = (await patchRes.json()) as Record<string, unknown>;
    expect(patchBody.customer).toBeUndefined();
    expect(JSON.stringify(patchBody)).not.toContain(other.id);
    expect(JSON.stringify(patchBody)).not.toContain("Secret");
  });

  it("refuses to clear a stored address but still saves legacy blank-address customers", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const filled = await prisma.customer.create({
      data: {
        firstName: "Filled",
        lastName: "Address",
        fullName: "Filled Address",
        email: "filled@example.com",
        normalizedEmail: "filled@example.com",
        phone: "0400777111",
        normalizedPhone: "0400777111",
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

    // Legacy shape: CSV imports and early bookings stored blank address parts.
    const legacy = await prisma.customer.create({
      data: {
        firstName: "Legacy",
        lastName: "Blank",
        fullName: "Legacy Blank",
        email: "legacy@example.com",
        normalizedEmail: "legacy@example.com",
        phone: "0400777222",
        normalizedPhone: "0400777222",
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "",
        streetName: "",
        streetType: "",
        suburb: "",
        state: "VIC",
        postcode: "3070"
      }
    });

    const clearRes = await PATCH(
      adminRequest(`http://localhost/api/admin/customers/${filled.id}`, "PATCH", token, {
        houseNumber: "",
        suburb: ""
      }),
      { params: Promise.resolve({ id: filled.id }) }
    );
    expect(clearRes.status).toBe(400);
    const clearBody = (await clearRes.json()) as { details: { fieldErrors: Record<string, string[]> } };
    expect(clearBody.details.fieldErrors.houseNumber).toEqual(["House number is required and cannot be cleared."]);
    expect(clearBody.details.fieldErrors.suburb).toEqual(["Suburb is required and cannot be cleared."]);

    // The dialog PATCHes the whole form, so a legacy record must stay saveable
    // when the admin only edits an unrelated field.
    const legacyRes = await PATCH(
      adminRequest(`http://localhost/api/admin/customers/${legacy.id}`, "PATCH", token, {
        phone: "0400777333",
        houseNumber: "",
        streetName: "",
        streetType: "",
        suburb: ""
      }),
      { params: Promise.resolve({ id: legacy.id }) }
    );
    expect(legacyRes.status).toBe(200);
    const saved = await prisma.customer.findUnique({ where: { id: legacy.id } });
    expect(saved?.phone).toBe("0400777333");
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
      skillLevel: "intermediate",
      houseNumber: "10",
      streetName: "Main",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070"
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
      skillLevel: "intermediate",
      houseNumber: "11",
      streetName: "Main",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070"
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
          fullName: "Alex McGilvray",
          normalizedFullName: "alex mcgilvray",
          email: "alex@example.com",
          phone: "0400000001",
          normalizedEmail: "alex@example.com",
          normalizedPhone: "0400000001",
          skillLevel: "intermediate",
          lessonMode: "video"
        },
        {
          fullName: "Ashlee Hutchinson",
          normalizedFullName: "ashlee hutchinson",
          email: "ashlee@example.com",
          phone: "0400000002",
          normalizedEmail: "ashlee@example.com",
          normalizedPhone: "0400000002",
          skillLevel: "beginner",
          lessonMode: "video"
        },
        {
          firstName: "Andrew",
          lastName: "Stephenson",
          fullName: "Andrew Stephenson",
          normalizedFullName: "andrew stephenson",
          email: "andrew@example.com",
          phone: "0400000003",
          normalizedEmail: "andrew@example.com",
          normalizedPhone: "0400000003",
          skillLevel: "beginner",
          lessonMode: "in_person"
        },
        {
          firstName: "Dean",
          lastName: "Thomson",
          fullName: "Dean Thomson",
          normalizedFullName: "dean thomson",
          email: "dean@example.com",
          phone: "0400000004",
          normalizedEmail: "dean@example.com",
          normalizedPhone: "0400000004",
          skillLevel: "advanced",
          lessonMode: "in_person"
        },
        {
          fullName: "Madonna",
          normalizedFullName: "madonna",
          email: "madonna@example.com",
          phone: "0400000005",
          normalizedEmail: "madonna@example.com",
          normalizedPhone: "0400000005",
          skillLevel: "advanced",
          lessonMode: "video"
        },
        {
          firstName: "Charlie",
          lastName: "Student",
          fullName: "Charlie Student",
          normalizedFullName: "charlie student",
          email: "charlie@example.com",
          phone: "0400000006",
          normalizedEmail: "charlie@example.com",
          normalizedPhone: "0400000006",
          skillLevel: "intermediate",
          lessonMode: "video"
        },
        {
          firstName: "Alice",
          lastName: "Student",
          fullName: "Alice Student",
          normalizedFullName: "alice student",
          email: "alice2@example.com",
          phone: "0400000007",
          normalizedEmail: "alice2@example.com",
          normalizedPhone: "0400000007",
          skillLevel: "beginner",
          lessonMode: "video"
        },
        {
          firstName: "Bob",
          lastName: "Student",
          fullName: "Bob Student",
          normalizedFullName: "bob student",
          email: "bob@example.com",
          phone: "0400000008",
          normalizedEmail: "bob@example.com",
          normalizedPhone: "0400000008",
          skillLevel: "beginner",
          lessonMode: "in_person"
        },
        {
          firstName: "Dylan",
          lastName: "Student",
          fullName: "Dylan Student",
          normalizedFullName: "dylan student",
          email: "dylan2@example.com",
          phone: "0400000009",
          normalizedEmail: "dylan2@example.com",
          normalizedPhone: "0400000009",
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
      "Ashlee Hutchinson",
      "Madonna",
      "Alex McGilvray",
      "Andrew Stephenson",
      "Alice Student",
      "Bob Student",
      "Charlie Student",
      "Dylan Student",
      "Dean Thomson"
    ]);
    expect(await fetchNames("customer", "desc")).toEqual([
      "Dean Thomson",
      "Dylan Student",
      "Charlie Student",
      "Bob Student",
      "Alice Student",
      "Andrew Stephenson",
      "Alex McGilvray",
      "Madonna",
      "Ashlee Hutchinson"
    ]);

    expect(await fetchNames("skill_mode", "asc")).toEqual([
      "Andrew Stephenson",
      "Bob Student",
      "Alice Student",
      "Ashlee Hutchinson",
      "Alex McGilvray",
      "Charlie Student",
      "Dean Thomson",
      "Dylan Student",
      "Madonna"
    ]);
    expect(await fetchNames("skill_mode", "desc")).toEqual([
      "Madonna",
      "Dean Thomson",
      "Dylan Student",
      "Alex McGilvray",
      "Charlie Student",
      "Alice Student",
      "Ashlee Hutchinson",
      "Andrew Stephenson",
      "Bob Student"
    ]);
  });

  it("formats legacy fullName rows as last name, first name for the customer column", () => {
    expect(getCustomerNamePresentation({
      firstName: "",
      lastName: "",
      fullName: "Alex McGilvray"
    }).displayName).toBe("McGilvray, Alex");

    expect(getCustomerNamePresentation({
      firstName: "",
      lastName: "",
      fullName: "Madonna"
    }).displayName).toBe("Madonna");
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
