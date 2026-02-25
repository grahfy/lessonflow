import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as studentLogin } from "@/app/api/student/login/route";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { ensurePortalCredentialForCustomer } from "@/lib/student-portal/credentials";

describe("student-portal-auth", () => {
  beforeEach(async () => {
    // Clear credential + booking/customer graph in dependency order because the
    // portal auth flow can create audit rows and linked credentials per customer.
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  // Helper centralizes customer fixture creation so auth tests stay focused on
  // credential matching inputs (full name + postcode + password).
  async function createCustomer(name: string, email: string, phone: string, postcode = "3070") {
    return prisma.customer.create({
      data: customerSnapshotFromInput({
        name,
        email,
        phone,
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "66",
        streetName: "High",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode
      })
    });
  }

  it("authenticates with full name + postcode + generated password", async () => {
    const customer = await createCustomer("Casey Smith", "casey@example.com", "0400111222");
    const credential = await ensurePortalCredentialForCustomer({
      customerId: customer.id,
      details: "Test credential generation"
    });
    expect(credential.generatedPassword).toBeTruthy();

    // Route handler is called directly to verify cookie issuance logic without
    // running a full Next.js server.
    const request = new NextRequest("http://localhost/api/student/login", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Casey Smith",
        postcode: "3070",
        password: credential.generatedPassword
      }),
      headers: {
        "content-type": "application/json"
      }
    });
    const response = await studentLogin(request);
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain("student_session=");
  });

  it("rejects invalid credentials and supports duplicate name/postcode candidates", async () => {
    // Duplicate identity inputs are resolved by checking candidate credentials,
    // so this test verifies both the failure path and a later successful match.
    const customerA = await createCustomer("Jordan Lee", "jordan.a@example.com", "0400111000");
    const customerB = await createCustomer("Jordan Lee", "jordan.b@example.com", "0400111001");
    const credentialA = await ensurePortalCredentialForCustomer({
      customerId: customerA.id
    });
    const credentialB = await ensurePortalCredentialForCustomer({
      customerId: customerB.id
    });
    expect(credentialA.generatedPassword).toBeTruthy();
    expect(credentialB.generatedPassword).toBeTruthy();

    const badRequest = new NextRequest("http://localhost/api/student/login", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Jordan Lee",
        postcode: "3070",
        password: "wrong-password"
      }),
      headers: {
        "content-type": "application/json"
      }
    });
    const badResponse = await studentLogin(badRequest);
    expect(badResponse.status).toBe(401);

    const goodRequest = new NextRequest("http://localhost/api/student/login", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Jordan Lee",
        postcode: "3070",
        password: credentialB.generatedPassword
      }),
      headers: {
        "content-type": "application/json"
      }
    });
    const goodResponse = await studentLogin(goodRequest);
    expect(goodResponse.status).toBe(200);
  });
});
