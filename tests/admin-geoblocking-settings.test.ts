import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as getGeoblockingSettings, POST as saveGeoblockingSettings } from "@/app/api/admin/geoblocking-settings/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminJsonRequest(url: string, token: string, init?: { method?: string; body?: Record<string, unknown> }) {
  return new NextRequest(url, {
    method: init?.method || "GET",
    body: init?.body ? JSON.stringify(init.body) : undefined,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-geoblocking-settings", () => {
  beforeEach(async () => {
    await prisma.geoblockingSettings.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("loads unrestricted defaults when no custom record exists", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await getGeoblockingSettings(adminJsonRequest("http://localhost/api/admin/geoblocking-settings", token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      geoblockingSettings: {
        allowedCountries: string[];
        unknownCountryMode: string;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.geoblockingSettings.allowedCountries).toContain("AU");
    expect(body.geoblockingSettings.allowedCountries).toContain("US");
    expect(body.geoblockingSettings.allowedCountries.length).toBeGreaterThan(200);
    expect(body.geoblockingSettings.unknownCountryMode).toBe("allow");
  });

  it("saves geoblocking settings and reloads the persisted values", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const saveResponse = await saveGeoblockingSettings(
      adminJsonRequest("http://localhost/api/admin/geoblocking-settings", token, {
        method: "POST",
        body: {
          allowedCountries: ["AU", "NZ"],
          unknownCountryMode: "block"
        }
      })
    );
    expect(saveResponse.status).toBe(200);

    const loadResponse = await getGeoblockingSettings(adminJsonRequest("http://localhost/api/admin/geoblocking-settings", token));
    const loadBody = (await loadResponse.json()) as {
      geoblockingSettings: {
        allowedCountries: string[];
        unknownCountryMode: string;
      };
    };

    expect(loadBody.geoblockingSettings.allowedCountries).toEqual(["AU", "NZ"]);
    expect(loadBody.geoblockingSettings.unknownCountryMode).toBe("block");
  });

  it("rejects non-owner admins", async () => {
    const teacher = await prisma.adminUser.create({
      data: {
        email: "teacher@example.com",
        role: "teacher",
        firstName: "Teacher",
        displayName: "Teacher",
        passwordHash: await bcrypt.hash("StrongPass!234", 12),
        isActive: true
      }
    });
    const token = createSessionToken(teacher.email);

    const response = await saveGeoblockingSettings(
      adminJsonRequest("http://localhost/api/admin/geoblocking-settings", token, {
        method: "POST",
        body: {
          allowedCountries: ["AU"],
          unknownCountryMode: "allow"
        }
      })
    );

    expect(response.status).toBe(403);
  });

  it("returns field validation errors for an empty country allowlist", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveGeoblockingSettings(
      adminJsonRequest("http://localhost/api/admin/geoblocking-settings", token, {
        method: "POST",
        body: {
          allowedCountries: [],
          unknownCountryMode: "allow"
        }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      ok: boolean;
      fieldErrors?: Record<string, string>;
    };

    expect(body.ok).toBe(false);
    expect(body.fieldErrors?.allowedCountries).toContain("Select at least one allowed country");
  });

  it("returns field validation errors for invalid country codes", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveGeoblockingSettings(
      adminJsonRequest("http://localhost/api/admin/geoblocking-settings", token, {
        method: "POST",
        body: {
          allowedCountries: ["AU", "ZZZ"],
          unknownCountryMode: "allow"
        }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      ok: boolean;
      fieldErrors?: Record<string, string>;
    };

    expect(body.ok).toBe(false);
    expect(body.fieldErrors?.allowedCountries).toContain("Use valid ISO alpha-2 country codes");
  });
});
