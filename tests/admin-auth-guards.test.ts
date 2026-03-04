import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as getCustomers } from "@/app/api/admin/customers/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

async function clearData() {
  await prisma.invoiceAuditLog.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customerPortalCredentialAuditLog.deleteMany();
  await prisma.customerPortalCredential.deleteMany();
  await prisma.learningMaterial.deleteMany();
  await prisma.bookingAuditLog.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.bookingSeries.deleteMany();
  await prisma.bookingRequest.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.adminUser.deleteMany();
}

describe("admin-auth-guards", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("returns 401 when admin session cookie payload is malformed", async () => {
    const request = new NextRequest("http://localhost/api/admin/customers", {
      headers: {
        cookie: `${getSessionCookieName()}=not-a-valid-token`
      }
    });

    const response = await getCustomers(request);
    expect(response.status).toBe(401);
  });

  it("returns 401 when token belongs to an inactive admin", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { isActive: false }
    });

    const request = new NextRequest("http://localhost/api/admin/customers", {
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await getCustomers(request);
    expect(response.status).toBe(401);
  });
});
