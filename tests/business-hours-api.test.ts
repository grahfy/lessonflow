import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GET as getBusinessHours, POST as saveBusinessHours } from "@/app/api/admin/business-hours/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { BUSINESS_HOURS_ID } from "@/lib/booking/business-hours";
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

type WeekdayInput = { isOpen: boolean; openMinute: number; closeMinute: number };

const CLOSED: WeekdayInput = { isOpen: false, openMinute: 540, closeMinute: 1020 };
const OPEN_9_TO_5: WeekdayInput = { isOpen: true, openMinute: 540, closeMinute: 1020 };

/** Sun..Sat, matching the array's positional weekday convention. */
function buildWeekdays(overrides: Partial<Record<number, WeekdayInput>> = {}): WeekdayInput[] {
  const base = [CLOSED, OPEN_9_TO_5, OPEN_9_TO_5, OPEN_9_TO_5, OPEN_9_TO_5, OPEN_9_TO_5, CLOSED];
  return base.map((day, index) => overrides[index] ?? day);
}

describe("admin-business-hours", () => {
  beforeEach(async () => {
    await prisma.businessHours.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  // Other suites (e.g. the student booking-slots derivation) read this
  // singleton too; clear it once this file finishes so nothing downstream
  // inherits a custom config this suite saved.
  afterAll(async () => {
    await prisma.businessHours.deleteMany();
  });

  it("loads sensible defaults when no row exists yet", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await getBusinessHours(adminJsonRequest("http://localhost/api/admin/business-hours", token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      businessHours: {
        weekdays: WeekdayInput[];
        slotGranularityMinutes: number;
        minimumNoticeHours: number;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.businessHours.weekdays).toHaveLength(7);
    expect(body.businessHours.weekdays[0].isOpen).toBe(false); // Sunday
    expect(body.businessHours.weekdays[1]).toMatchObject({ isOpen: true, openMinute: 540, closeMinute: 1020 }); // Monday
    expect(body.businessHours.slotGranularityMinutes).toBe(30);
    expect(body.businessHours.minimumNoticeHours).toBe(24);
  });

  it("saves business hours and reloads the same values", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const weekdays = buildWeekdays({ 6: { isOpen: true, openMinute: 600, closeMinute: 900 } }); // Saturday half-day

    const saveResponse = await saveBusinessHours(
      adminJsonRequest("http://localhost/api/admin/business-hours", token, {
        method: "POST",
        body: { weekdays, slotGranularityMinutes: 15, minimumNoticeHours: 12 }
      })
    );
    expect(saveResponse.status).toBe(200);

    const loadResponse = await getBusinessHours(adminJsonRequest("http://localhost/api/admin/business-hours", token));
    const loadBody = (await loadResponse.json()) as {
      businessHours: {
        weekdays: WeekdayInput[];
        slotGranularityMinutes: number;
        minimumNoticeHours: number;
      };
    };

    expect(loadBody.businessHours.weekdays[6]).toMatchObject({ isOpen: true, openMinute: 600, closeMinute: 900 });
    expect(loadBody.businessHours.slotGranularityMinutes).toBe(15);
    expect(loadBody.businessHours.minimumNoticeHours).toBe(12);

    // Upserts on an existing row rather than erroring or duplicating.
    expect(await prisma.businessHours.count({ where: { id: BUSINESS_HOURS_ID } })).toBe(1);
  });

  it("rejects a day whose close time is not after its open time", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    // Monday (index 1) open, but closing before it opens.
    const weekdays = buildWeekdays({ 1: { isOpen: true, openMinute: 1000, closeMinute: 500 } });

    const response = await saveBusinessHours(
      adminJsonRequest("http://localhost/api/admin/business-hours", token, {
        method: "POST",
        body: { weekdays, slotGranularityMinutes: 30, minimumNoticeHours: 24 }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; fieldErrors?: Record<string, string> };
    expect(body.ok).toBe(false);
    expect(body.fieldErrors?.["weekdays.1"]).toBeTruthy();
  });

  it("rejects a weekdays array that isn't exactly 7 entries", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveBusinessHours(
      adminJsonRequest("http://localhost/api/admin/business-hours", token, {
        method: "POST",
        body: { weekdays: buildWeekdays().slice(0, 6), slotGranularityMinutes: 30, minimumNoticeHours: 24 }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; fieldErrors?: Record<string, string> };
    expect(body.ok).toBe(false);
    expect(body.fieldErrors?.weekdays).toBeTruthy();
  });

  it("rejects an out-of-range slotGranularityMinutes", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveBusinessHours(
      adminJsonRequest("http://localhost/api/admin/business-hours", token, {
        method: "POST",
        body: { weekdays: buildWeekdays(), slotGranularityMinutes: 1000, minimumNoticeHours: 24 }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; fieldErrors?: Record<string, string> };
    expect(body.fieldErrors?.slotGranularityMinutes).toBeTruthy();
  });

  it("rejects a negative minimumNoticeHours", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await saveBusinessHours(
      adminJsonRequest("http://localhost/api/admin/business-hours", token, {
        method: "POST",
        body: { weekdays: buildWeekdays(), slotGranularityMinutes: 30, minimumNoticeHours: -1 }
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; fieldErrors?: Record<string, string> };
    expect(body.fieldErrors?.minimumNoticeHours).toBeTruthy();
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

    const response = await saveBusinessHours(
      adminJsonRequest("http://localhost/api/admin/business-hours", token, {
        method: "POST",
        body: { weekdays: buildWeekdays(), slotGranularityMinutes: 30, minimumNoticeHours: 24 }
      })
    );

    expect(response.status).toBe(403);
  });

  it("rejects a request with no session at all", async () => {
    const response = await getBusinessHours(new NextRequest("http://localhost/api/admin/business-hours"));
    expect(response.status).toBe(403);
  });
});
