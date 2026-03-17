import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/admin/customers/[id]/portal-credential/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import * as emailService from "@/lib/email/service";
import {
  ensurePortalCredentialForCustomer,
  verifyPortalPassword
} from "@/lib/student-portal/credentials";
import * as portalCredentialLib from "@/lib/student-portal/credentials";

describe("admin-portal-credential", () => {
  beforeEach(async () => {
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.outboundEmail.deleteMany();
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
    const regeneratePayload = (await regenerateResponse.json()) as {
      password: string;
      emailStatus?: "sent" | "queued_no_smtp" | "failed" | "skipped";
      emailMessage?: string;
    };
    expect(regeneratePayload.password).not.toBe(initialPassword);
    expect(regeneratePayload.emailStatus).toBe("queued_no_smtp");
    expect(regeneratePayload.emailMessage).toContain("queued");

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

    const emailRow = await prisma.outboundEmail.findFirstOrThrow({
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(emailRow.toEmail).toBe(customer.email);
    expect(emailRow.subject).toContain("student portal login details");
    expect(emailRow.status).toBe("queued_no_smtp");
  });

  it("returns a JSON 500 when regenerate throws unexpectedly", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookie = `${getSessionCookieName()}=${token}`;

    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Broken Rotate",
        email: "broken.rotate@example.com",
        phone: "0400111222",
        lessonMode: "video",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "10",
        streetName: "Broken",
        streetType: "Street",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056"
      })
    });

    const rotateSpy = vi
      .spyOn(portalCredentialLib, "rotatePortalCredential")
      .mockRejectedValueOnce(new Error("Simulated rotate failure"));

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
    const payload = (await regenerateResponse.json()) as { error?: string };

    expect(regenerateResponse.status).toBe(500);
    expect(regenerateResponse.headers.get("content-type")).toContain("application/json");
    expect(payload.error).toBe("Simulated rotate failure");

    rotateSpy.mockRestore();
  });

  it("returns partial success when credential regeneration succeeds but email delivery throws", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookie = `${getSessionCookieName()}=${token}`;

    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Exploding Mail",
        email: "exploding.mail@example.com",
        phone: "0400222333",
        lessonMode: "video",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "12",
        streetName: "Explode",
        streetType: "Street",
        suburb: "Coburg",
        state: "VIC",
        postcode: "3058"
      })
    });
    const initial = await ensurePortalCredentialForCustomer({
      customerId: customer.id,
      actorId: admin.id
    });
    const initialPassword = initial.generatedPassword || "";

    const sendSpy = vi.spyOn(emailService, "sendEmail").mockRejectedValueOnce(new Error("SMTP transport exploded"));

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
    const regeneratePayload = (await regenerateResponse.json()) as {
      password: string;
      partial?: boolean;
      emailStatus?: "sent" | "queued_no_smtp" | "failed" | "skipped";
      emailMessage?: string;
    };

    expect(regenerateResponse.status).toBe(200);
    expect(regeneratePayload.partial).toBe(true);
    expect(regeneratePayload.emailStatus).toBe("failed");
    expect(regeneratePayload.emailMessage).toContain("SMTP transport exploded");
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

    sendSpy.mockRestore();
  });
});
