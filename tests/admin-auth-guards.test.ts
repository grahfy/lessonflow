import crypto from "node:crypto";

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

function createLegacySessionToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    }),
    "utf8"
  ).toString("base64url");

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET must be configured for admin auth tests.");
  }

  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
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

  it("returns 401 when token was issued before the admin session was invalidated", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { sessionInvalidBefore: new Date(Date.now() + 5) }
    });

    const request = new NextRequest("http://localhost/api/admin/customers", {
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await getCustomers(request);
    expect(response.status).toBe(401);
  });

  it("returns 401 for legacy tokens after session invalidation is set", async () => {
    const admin = await ensureOwnerAdmin();
    const legacyToken = createLegacySessionToken(admin.email);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { sessionInvalidBefore: new Date() }
    });

    const request = new NextRequest("http://localhost/api/admin/customers", {
      headers: {
        cookie: `${getSessionCookieName()}=${legacyToken}`
      }
    });

    const response = await getCustomers(request);
    expect(response.status).toBe(401);
  });
});
