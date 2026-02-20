import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/admin/customers/[id]/portal-credential/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import {
  ensurePortalCredentialForCustomer,
  verifyPortalPassword
} from "@/lib/student-portal/credentials";

describe("admin-portal-credential", () => {
  beforeEach(async () => {
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("reveals and regenerates customer portal passwords with audit logs", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookie = `${getSessionCookieName()}=${token}`;

    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Portal Student",
        email: "portal.student@example.com",
        phone: "0400888777",
        lessonMode: "video",
        skillLevel: "intermediate",
        unitNumber: undefined,
        houseNumber: "88",
        streetName: "Portal",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });
    const initial = await ensurePortalCredentialForCustomer({
      customerId: customer.id,
      actorId: admin.id
    });
    const initialPassword = initial.generatedPassword || "";
    expect(initialPassword).not.toBe("");

    const metadataRequest = new NextRequest(`http://localhost/api/admin/customers/${customer.id}/portal-credential`, {
      headers: {
        cookie
      }
    });
    const metadataResponse = await GET(metadataRequest, {
      params: Promise.resolve({ id: customer.id })
    });
    expect(metadataResponse.status).toBe(200);
    const metadataPayload = (await metadataResponse.json()) as { credential: { generatedAt: string } | null };
    expect(metadataPayload.credential?.generatedAt).toBeTruthy();

    const revealRequest = new NextRequest(`http://localhost/api/admin/customers/${customer.id}/portal-credential`, {
      method: "POST",
      body: JSON.stringify({
        action: "reveal"
      }),
      headers: {
        "content-type": "application/json",
        cookie
      }
    });
    const revealResponse = await POST(revealRequest, {
      params: Promise.resolve({ id: customer.id })
    });
    expect(revealResponse.status).toBe(200);
    const revealPayload = (await revealResponse.json()) as { password: string };
    expect(revealPayload.password).toBe(initialPassword);

    const regenerateRequest = new NextRequest(`http://localhost/api/admin/customers/${customer.id}/portal-credential`, {
      method: "POST",
      body: JSON.stringify({
        action: "regenerate"
      }),
      headers: {
        "content-type": "application/json",
        cookie
      }
    });
    const regenerateResponse = await POST(regenerateRequest, {
      params: Promise.resolve({ id: customer.id })
    });
    expect(regenerateResponse.status).toBe(200);
    const regeneratePayload = (await regenerateResponse.json()) as { password: string };
    expect(regeneratePayload.password).not.toBe(initialPassword);

    const credential = await prisma.customerPortalCredential.findUniqueOrThrow({
      where: {
        customerId: customer.id
      }
    });
    const oldValid = await verifyPortalPassword({
      plaintext: initialPassword,
      passwordHash: credential.passwordHash
    });
    const newValid = await verifyPortalPassword({
      plaintext: regeneratePayload.password,
      passwordHash: credential.passwordHash
    });
    expect(oldValid).toBe(false);
    expect(newValid).toBe(true);

    const auditLogs = await prisma.customerPortalCredentialAuditLog.findMany({
      where: {
        customerId: customer.id
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(auditLogs.map((log) => log.action)).toContain("generated");
    expect(auditLogs.map((log) => log.action)).toContain("revealed");
    expect(auditLogs.map((log) => log.action)).toContain("rotated");
  });
});
