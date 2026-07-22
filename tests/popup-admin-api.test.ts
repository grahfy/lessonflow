import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { GET as listPopups, POST as createPopup } from "@/app/api/admin/popups/route";
import { DELETE as deletePopup, GET as getPopup, PUT as updatePopup } from "@/app/api/admin/popups/[id]/route";
import {
  DELETE as deletePopupImage,
  POST as uploadPopupImage
} from "@/app/api/admin/popups/[id]/image/route";
import { GET as getPublicPopupImage } from "@/app/api/popups/[id]/image/route";
import { GET as getPopupStats } from "@/app/api/admin/popups/[id]/stats/route";
import { POPUP_DAY_STATS_LOOKBACK_DAYS } from "@/lib/popups/popups";
import { dateTimeLocalToDate, toDateKey } from "@/lib/time";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00,
  0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00,
  0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02,
  0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60,
  0x82
]);

/** A payload the create/update routes accept, for negative one-field-at-a-time cases. */
const validPopupInput = {
  title: "Winter Special",
  enabled: true,
  heading: "20% off winter lessons",
  bodyHtml: "<p>Book before June 1.</p>",
  ctaLabel: "Book Now",
  ctaUrl: "/book",
  formFactor: "modal",
  animation: "fade",
  backgroundColor: "#ffffff",
  textColor: "#111111",
  buttonBackgroundColor: "#2247d8",
  buttonTextColor: "#ffffff",
  imagePlacement: "none",
  delaySeconds: 3,
  repeatPolicy: "session"
};

function jsonRequest(url: string, method: string, body: unknown, token?: string): NextRequest {
  return new NextRequest(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `${getSessionCookieName()}=${token}` } : {})
    }
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Upsert, not create: this row persists in the shared test DB across
// separate suite runs (nothing else in this file deletes adminUser rows), so
// a plain `.create()` throws a unique-constraint error on email once a prior
// run has already left one behind.
async function createNonOwnerAdmin() {
  const email = "teacher.popups@example.com";
  return prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      role: "teacher",
      firstName: "Non",
      lastName: "Owner",
      displayName: "Non Owner",
      passwordHash: "not-a-real-hash",
      isActive: true
    },
    update: { role: "teacher", isActive: true, sessionInvalidBefore: null }
  });
}

describe("popup admin API auth boundary", () => {
  beforeEach(async () => {
    await prisma.popupDayStat.deleteMany();
    await prisma.sitePopup.deleteMany();
  });

  it("rejects every handler with 401 when unauthenticated", async () => {
    const owner = await ensureOwnerAdmin();
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const listRes = await listPopups(jsonRequest("http://localhost/api/admin/popups", "GET", undefined));
    expect(listRes.status).toBe(401);

    const createRes = await createPopup(
      jsonRequest("http://localhost/api/admin/popups", "POST", validPopupInput)
    );
    expect(createRes.status).toBe(401);

    const getRes = await getPopup(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}`, "GET", undefined),
      idParams(popup.id)
    );
    expect(getRes.status).toBe(401);

    const putRes = await updatePopup(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}`, "PUT", validPopupInput),
      idParams(popup.id)
    );
    expect(putRes.status).toBe(401);

    const deleteRes = await deletePopup(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}`, "DELETE", undefined),
      idParams(popup.id)
    );
    expect(deleteRes.status).toBe(401);

    const imageForm = new FormData();
    imageForm.append("file", new File([PNG_BYTES], "photo.png", { type: "image/png" }));
    const imageReq = new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
      method: "POST",
      body: imageForm
    });
    const imageRes = await uploadPopupImage(imageReq, idParams(popup.id));
    expect(imageRes.status).toBe(401);

    const deleteImageRes = await deletePopupImage(
      new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, { method: "DELETE" }),
      idParams(popup.id)
    );
    expect(deleteImageRes.status).toBe(401);

    const statsRes = await getPopupStats(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}/stats`, "GET", undefined),
      idParams(popup.id)
    );
    expect(statsRes.status).toBe(401);
  });

  it("rejects every handler with 403 for a non-owner admin", async () => {
    const owner = await ensureOwnerAdmin();
    const teacher = await createNonOwnerAdmin();
    const token = createSessionToken(teacher.email);
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const listRes = await listPopups(
      jsonRequest("http://localhost/api/admin/popups", "GET", undefined, token)
    );
    expect(listRes.status).toBe(403);

    const createRes = await createPopup(
      jsonRequest("http://localhost/api/admin/popups", "POST", validPopupInput, token)
    );
    expect(createRes.status).toBe(403);

    const getRes = await getPopup(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}`, "GET", undefined, token),
      idParams(popup.id)
    );
    expect(getRes.status).toBe(403);

    const putRes = await updatePopup(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}`, "PUT", validPopupInput, token),
      idParams(popup.id)
    );
    expect(putRes.status).toBe(403);

    const deleteRes = await deletePopup(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}`, "DELETE", undefined, token),
      idParams(popup.id)
    );
    expect(deleteRes.status).toBe(403);

    const imageForm = new FormData();
    imageForm.append("file", new File([PNG_BYTES], "photo.png", { type: "image/png" }));
    const imageReq = new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
      method: "POST",
      body: imageForm,
      headers: { cookie: `${getSessionCookieName()}=${token}` }
    });
    const imageRes = await uploadPopupImage(imageReq, idParams(popup.id));
    expect(imageRes.status).toBe(403);

    const deleteImageRes = await deletePopupImage(
      new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
        method: "DELETE",
        headers: { cookie: `${getSessionCookieName()}=${token}` }
      }),
      idParams(popup.id)
    );
    expect(deleteImageRes.status).toBe(403);

    const statsRes = await getPopupStats(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}/stats`, "GET", undefined, token),
      idParams(popup.id)
    );
    expect(statsRes.status).toBe(403);
  });
});

/** Minimal valid SitePopup row for direct Prisma setup in tests (bypasses the HTTP contract). */
function basePopupRow() {
  return {
    title: "Setup Popup",
    heading: "Setup heading",
    bodyHtml: "<p>Setup body</p>",
    enabled: false
  };
}

describe("popup admin API validation", () => {
  beforeEach(async () => {
    await prisma.popupDayStat.deleteMany();
    await prisma.sitePopup.deleteMany();
  });

  it("creates a valid popup and sanitizes bodyHtml on the way in", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const res = await createPopup(
      jsonRequest("http://localhost/api/admin/popups", "POST", {
        ...validPopupInput,
        bodyHtml: '<p>Hello <script>alert(1)</script>world</p><a href="javascript:alert(1)">bad link</a>'
      }, token)
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.popup.bodyHtml).not.toContain("<script");
    expect(data.popup.bodyHtml).not.toContain("javascript:");
    expect(data.popup.bodyHtml).toContain("Hello world");
  });

  it("rejects a ctaUrl using a disallowed scheme", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const res = await createPopup(
      jsonRequest(
        "http://localhost/api/admin/popups",
        "POST",
        { ...validPopupInput, ctaUrl: "javascript:alert(1)" },
        token
      )
    );
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.details.fieldErrors.ctaUrl).toBeTruthy();
  });

  it("requires repeatDays when repeatPolicy is days", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const res = await createPopup(
      jsonRequest(
        "http://localhost/api/admin/popups",
        "POST",
        { ...validPopupInput, repeatPolicy: "days", repeatDays: undefined },
        token
      )
    );
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.details.fieldErrors.repeatDays).toBeTruthy();
  });

  it("accepts repeatDays when repeatPolicy is days and nulls it out otherwise", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const daysRes = await createPopup(
      jsonRequest(
        "http://localhost/api/admin/popups",
        "POST",
        { ...validPopupInput, repeatPolicy: "days", repeatDays: 7 },
        token
      )
    );
    expect(daysRes.status).toBe(200);
    const daysData = await daysRes.json();
    expect(daysData.popup.repeatDays).toBe(7);

    const sessionRes = await createPopup(
      jsonRequest(
        "http://localhost/api/admin/popups",
        "POST",
        { ...validPopupInput, repeatPolicy: "session", repeatDays: 7 },
        token
      )
    );
    expect(sessionRes.status).toBe(200);
    const sessionData = await sessionRes.json();
    expect(sessionData.popup.repeatDays).toBeNull();
  });

  it("rejects a malformed colour", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const res = await createPopup(
      jsonRequest(
        "http://localhost/api/admin/popups",
        "POST",
        { ...validPopupInput, backgroundColor: "blue" },
        token
      )
    );
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.details.fieldErrors.backgroundColor).toBeTruthy();
  });
});

describe("popup admin API image upload", () => {
  beforeEach(async () => {
    await prisma.popupDayStat.deleteMany();
    await prisma.sitePopup.deleteMany();
  });

  it("rejects an oversized image", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const oversized = new Uint8Array(6 * 1024 * 1024);
    const form = new FormData();
    form.append("file", new File([oversized], "big.png", { type: "image/png" }));

    const req = new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
      method: "POST",
      body: form,
      headers: { cookie: `${getSessionCookieName()}=${token}` }
    });

    const res = await uploadPopupImage(req, idParams(popup.id));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("5MB");
  });

  it("rejects a renamed non-image (spoofed MIME type, real content isn't an image)", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const form = new FormData();
    // Declares image/png (passes the allowlist check) but the bytes are plain text.
    form.append("file", new File(["not actually an image"], "fake.png", { type: "image/png" }));

    const req = new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
      method: "POST",
      body: form,
      headers: { cookie: `${getSessionCookieName()}=${token}` }
    });

    const res = await uploadPopupImage(req, idParams(popup.id));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("valid JPEG, PNG, GIF, or WebP");
  });

  it("accepts a real image, sets imageUrl, and clears it on delete", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const form = new FormData();
    form.append("file", new File([PNG_BYTES], "photo.png", { type: "image/png" }));

    const uploadReq = new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
      method: "POST",
      body: form,
      headers: { cookie: `${getSessionCookieName()}=${token}` }
    });
    const uploadRes = await uploadPopupImage(uploadReq, idParams(popup.id));
    expect(uploadRes.status).toBe(200);
    const uploadData = await uploadRes.json();
    expect(uploadData.imageUrl).toBe(`/api/popups/${popup.id}/image`);

    const updated = await prisma.sitePopup.findUniqueOrThrow({ where: { id: popup.id } });
    expect(updated.imageUrl).toBe(`/api/popups/${popup.id}/image`);

    const deleteReq = new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
      method: "DELETE",
      headers: { cookie: `${getSessionCookieName()}=${token}` }
    });
    const deleteRes = await deletePopupImage(deleteReq, idParams(popup.id));
    expect(deleteRes.status).toBe(200);

    const cleared = await prisma.sitePopup.findUniqueOrThrow({ where: { id: popup.id } });
    expect(cleared.imageUrl).toBeNull();
  });
});

describe("public popup image route", () => {
  beforeEach(async () => {
    await prisma.popupDayStat.deleteMany();
    await prisma.sitePopup.deleteMany();
  });

  it("404s for a popup with no uploaded image, unauthenticated", async () => {
    const owner = await ensureOwnerAdmin();
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const res = await getPublicPopupImage(
      new NextRequest(`http://localhost/api/popups/${popup.id}/image`),
      idParams(popup.id)
    );
    expect(res.status).toBe(404);
  });

  it("404s for a popup id that does not exist", async () => {
    const res = await getPublicPopupImage(
      new NextRequest("http://localhost/api/popups/does-not-exist/image"),
      idParams("does-not-exist")
    );
    expect(res.status).toBe(404);
  });

  it("serves the uploaded image unauthenticated with a re-derived content-type and short cache", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const form = new FormData();
    form.append("file", new File([PNG_BYTES], "photo.png", { type: "image/png" }));
    const uploadReq = new NextRequest(`http://localhost/api/admin/popups/${popup.id}/image`, {
      method: "POST",
      body: form,
      headers: { cookie: `${getSessionCookieName()}=${token}` }
    });
    expect((await uploadPopupImage(uploadReq, idParams(popup.id))).status).toBe(200);

    // No cookie: this is the public, unauthenticated route.
    const res = await getPublicPopupImage(
      new NextRequest(`http://localhost/api/popups/${popup.id}/image`),
      idParams(popup.id)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toEqual(PNG_BYTES);
  });
});

describe("popup admin API day stats (AC-44)", () => {
  beforeEach(async () => {
    await prisma.popupDayStat.deleteMany();
    await prisma.sitePopup.deleteMany();
  });

  it("404s for a popup id that does not exist", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const res = await getPopupStats(
      jsonRequest("http://localhost/api/admin/popups/does-not-exist/stats", "GET", undefined, token),
      idParams("does-not-exist")
    );
    expect(res.status).toBe(404);
  });

  it("zero-fills a popup with no recorded stats over the full lookback window", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const res = await getPopupStats(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}/stats`, "GET", undefined, token),
      idParams(popup.id)
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.days).toHaveLength(POPUP_DAY_STATS_LOOKBACK_DAYS);
    expect(data.days.every((d: { impressions: number; clicks: number; dismissals: number }) =>
      d.impressions === 0 && d.clicks === 0 && d.dismissals === 0
    )).toBe(true);
    expect(data.days[data.days.length - 1].date).toBe(toDateKey(new Date()));
  });

  it("reports a recorded day's counts against today's date key, oldest first", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const popup = await prisma.sitePopup.create({ data: { ...basePopupRow(), createdById: owner.id } });

    const todayKey = toDateKey(new Date());
    // Same day-stamping pair the public stats-recording route uses.
    const day = dateTimeLocalToDate(`${todayKey}T00:00`)!;
    await prisma.popupDayStat.create({
      data: { popupId: popup.id, day, impressions: 12, clicks: 3, dismissals: 1 }
    });

    const res = await getPopupStats(
      jsonRequest(`http://localhost/api/admin/popups/${popup.id}/stats`, "GET", undefined, token),
      idParams(popup.id)
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.days).toHaveLength(POPUP_DAY_STATS_LOOKBACK_DAYS);
    const today = data.days[data.days.length - 1];
    expect(today.date).toBe(todayKey);
    expect(today).toMatchObject({ impressions: 12, clicks: 3, dismissals: 1 });
  });
});

// This file's own beforeEach hooks only reset what each test depends on
// (popupDayStat/sitePopup) at the START of the next test; whatever the last
// test created is otherwise still sitting in the DB when the file finishes.
// Sweep it here so a later test file in the same run doesn't inherit it —
// the shared owner@example.com admin is left alone (every suite depends on
// it and it's self-healing via ensureOwnerAdmin), but the throwaway teacher
// row is this file's alone.
afterAll(async () => {
  await prisma.popupDayStat.deleteMany();
  await prisma.sitePopup.deleteMany();
  await prisma.adminUser.deleteMany({ where: { email: "teacher.popups@example.com" } });
});
