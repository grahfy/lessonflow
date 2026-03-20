import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as getLessonPricing, POST as saveLessonPricing } from "@/app/api/admin/lesson-pricing/route";
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

describe("admin-lesson-pricing", () => {
  beforeEach(async () => {
    await prisma.lessonPricingOption.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("loads an empty lesson pricing state when no rows exist", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await getLessonPricing(adminJsonRequest("http://localhost/api/admin/lesson-pricing", token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      lessonPricingSettings: {
        lessonPricingOptions: unknown[];
        updatedAt: string | null;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.lessonPricingSettings.lessonPricingOptions).toEqual([]);
    expect(body.lessonPricingSettings.updatedAt).toBeNull();
  });

  it("saves lesson pricing rows and reloads them in sort order", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const saveResponse = await saveLessonPricing(
      adminJsonRequest("http://localhost/api/admin/lesson-pricing", token, {
        method: "POST",
        body: {
          lessonPricingOptions: [
            { durationMinutes: 60, priceCents: 9000, isActive: true },
            { durationMinutes: 30, priceCents: 5000, isActive: true },
            { durationMinutes: 120, priceCents: 17000, isActive: false }
          ]
        }
      })
    );
    expect(saveResponse.status).toBe(200);

    const loadResponse = await getLessonPricing(adminJsonRequest("http://localhost/api/admin/lesson-pricing", token));
    const loadBody = (await loadResponse.json()) as {
      lessonPricingSettings: {
        lessonPricingOptions: Array<{
          durationMinutes: number;
          priceCents: number;
          isActive: boolean;
          sortOrder: number;
        }>;
      };
    };

    expect(loadBody.lessonPricingSettings.lessonPricingOptions).toHaveLength(3);
    expect(loadBody.lessonPricingSettings.lessonPricingOptions[0]).toMatchObject({
      durationMinutes: 60,
      priceCents: 9000,
      isActive: true,
      sortOrder: 0
    });
    expect(loadBody.lessonPricingSettings.lessonPricingOptions[1]).toMatchObject({
      durationMinutes: 30,
      priceCents: 5000,
      isActive: true,
      sortOrder: 1
    });
  });

  it("rejects duplicate durations", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveLessonPricing(
      adminJsonRequest("http://localhost/api/admin/lesson-pricing", token, {
        method: "POST",
        body: {
          lessonPricingOptions: [
            { durationMinutes: 60, priceCents: 9000, isActive: true },
            { durationMinutes: 60, priceCents: 9500, isActive: true }
          ]
        }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      ok: boolean;
      fieldErrors?: Record<string, string>;
    };

    expect(body.ok).toBe(false);
    expect(Object.values(body.fieldErrors || {}).some((message) => message.includes("duration"))).toBe(true);
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

    const response = await saveLessonPricing(
      adminJsonRequest("http://localhost/api/admin/lesson-pricing", token, {
        method: "POST",
        body: {
          lessonPricingOptions: [{ durationMinutes: 30, priceCents: 4500, isActive: true }]
        }
      })
    );

    expect(response.status).toBe(403);
  });
});
