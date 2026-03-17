import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as importCustomers } from "@/app/api/admin/customers/import/route";
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

function authRequest(body: Record<string, unknown>, token?: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/customers/import", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `${getSessionCookieName()}=${token}` } : {})
    }
  });
}

describe("admin-customers-import", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("rejects unauthenticated import requests", async () => {
    const response = await importCustomers(
      authRequest({
        customers: [{ first_name: "Alex", last_name: "Student", email: "alex@example.com" }]
      })
    );

    expect(response.status).toBe(401);
  });

  it("imports valid CSV rows without generating random placeholder contact/address data", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await importCustomers(
      authRequest(
        {
          customers: [{ first_name: "Alex", last_name: "Student", email: "alex@example.com" }]
        },
        token
      )
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; importedCount: number; errors?: string[] };
    expect(body.success).toBe(true);
    expect(body.importedCount).toBe(1);
    expect(body.errors).toBeUndefined();

    const customer = await prisma.customer.findFirstOrThrow({
      where: {
        normalizedEmail: "alex@example.com"
      }
    });
    expect(customer.fullName).toBe("Alex Student");
    expect(customer.phone).toBe("");
    expect(customer.houseNumber).toBe("");
    expect(customer.streetName).toBe("");
    expect(customer.streetType).toBe("");
    expect(customer.suburb).toBe("");
    expect(customer.state).toBe("VIC");
  });

  it("ensures portal access and assigns imported customers to the importing teacher", async () => {
    await ensureOwnerAdmin();
    const teacher = await prisma.adminUser.create({
      data: {
        email: "import-teacher@example.com",
        role: "teacher",
        firstName: "Import",
        displayName: "Import Teacher",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });
    const token = createSessionToken(teacher.email);

    const response = await importCustomers(
      authRequest(
        {
          customers: [{ first_name: "Taylor", last_name: "Import", email: "taylor.import@example.com" }]
        },
        token
      )
    );

    expect(response.status).toBe(200);

    const customer = await prisma.customer.findFirstOrThrow({
      where: {
        normalizedEmail: "taylor.import@example.com"
      }
    });
    expect(customer.primaryTeacherId).toBe(teacher.id);

    const credential = await prisma.customerPortalCredential.findUnique({
      where: {
        customerId: customer.id
      }
    });
    expect(credential).not.toBeNull();
  });
});
