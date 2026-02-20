import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as adminLogin } from "@/app/api/admin/login/route";
import { POST as initializeSetup } from "@/app/api/setup/initialize/route";
import { GET as getSetupStatus } from "@/app/api/setup/status/route";
import { getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

type MutableEnv = Record<string, string | undefined>;

const env = process.env as MutableEnv;
const originalAdminEmail = env.ADMIN_EMAIL;
const originalStorageDriver = env.LEARNING_MATERIALS_STORAGE_DRIVER;

/**
 * Clears mutable business data for isolated setup tests.
 */
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

describe("setup-wizard", () => {
  beforeEach(async () => {
    await clearData();
    env.ADMIN_EMAIL = "owner@melbourneguitar.school";
    env.LEARNING_MATERIALS_STORAGE_DRIVER = "local";
  });

  afterEach(() => {
    env.ADMIN_EMAIL = originalAdminEmail;
    env.LEARNING_MATERIALS_STORAGE_DRIVER = originalStorageDriver;
  });

  it("reports setup as incomplete before first admin is created", async () => {
    const response = await getSetupStatus();
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      readiness: {
        completed: boolean;
        checks: Array<{ id: string }>;
      };
    };

    expect(body.readiness.completed).toBe(false);
    expect(body.readiness.checks.some((entry) => entry.id === "database-connectivity")).toBe(true);
  });

  it("blocks admin login before setup is initialized", async () => {
    const request = new NextRequest("http://localhost/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@melbourneguitar.school",
        password: "StrongPass!234"
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    const response = await adminLogin(request);
    expect(response.status).toBe(409);

    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("SETUP_REQUIRED");
  });

  it("creates first admin during setup and sets an admin session cookie", async () => {
    const request = new NextRequest("http://localhost/api/setup/initialize", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Owner",
        email: "owner@melbourneguitar.school",
        password: "StrongPass!234",
        confirmPassword: "StrongPass!234"
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    const response = await initializeSetup(request);
    expect(response.status).toBe(201);

    const body = (await response.json()) as { ok: boolean; nextPath: string };
    expect(body.ok).toBe(true);
    expect(body.nextPath).toBe("/admin/bookings");

    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie.includes(getSessionCookieName())).toBe(true);

    const adminCount = await prisma.adminUser.count();
    expect(adminCount).toBe(1);

    const statusResponse = await getSetupStatus();
    const statusBody = (await statusResponse.json()) as { readiness: { completed: boolean } };
    expect(statusBody.readiness.completed).toBe(true);
  });

  it("blocks initialization when a failing check exists", async () => {
    env.LEARNING_MATERIALS_STORAGE_DRIVER = "s3";

    const request = new NextRequest("http://localhost/api/setup/initialize", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Owner",
        email: "owner@melbourneguitar.school",
        password: "StrongPass!234",
        confirmPassword: "StrongPass!234"
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    const response = await initializeSetup(request);
    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      error: string;
      readiness: {
        failCount: number;
      };
    };

    expect(body.error).toContain("Resolve all failing setup checks");
    expect(body.readiness.failCount).toBeGreaterThan(0);
  });
});
