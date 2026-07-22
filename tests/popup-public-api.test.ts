import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as activeGET } from "@/app/api/popups/active/route";
import { POST as statsPOST } from "@/app/api/popups/[id]/stats/route";
import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

describe("popup-public-api", () => {
  beforeEach(async () => {
    await prisma.popupDayStat.deleteMany();
    await prisma.sitePopup.deleteMany();
  });

  async function createPopup(overrides: {
    title: string;
    enabled?: boolean;
    startAt?: Date | null;
    endAt?: Date | null;
    targetPaths?: string[] | null;
    createdAt?: Date;
  }) {
    const admin = await ensureOwnerAdmin();
    return prisma.sitePopup.create({
      data: {
        title: overrides.title,
        heading: overrides.title,
        bodyHtml: "<p>Hello</p>",
        enabled: overrides.enabled ?? true,
        startAt: overrides.startAt ?? null,
        endAt: overrides.endAt ?? null,
        targetPaths: overrides.targetPaths ?? undefined,
        createdById: admin.id,
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {})
      }
    });
  }

  function activeRequest(path?: string) {
    const url = path
      ? `http://localhost/api/popups/active?path=${encodeURIComponent(path)}`
      : "http://localhost/api/popups/active";
    return new NextRequest(url);
  }

  function statsRequest(body: unknown) {
    return new NextRequest("http://localhost/api/popups/x/stats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  it("does not return an out-of-window popup (AC-36)", async () => {
    await createPopup({ title: "Future", startAt: new Date(Date.now() + 60_000) });
    await createPopup({ title: "Past", endAt: new Date(Date.now() - 60_000) });

    const response = await activeGET(activeRequest());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { popup: unknown };
    expect(payload.popup).toBeNull();
  });

  it("returns a null-schedule enabled popup (AC-37)", async () => {
    const popup = await createPopup({ title: "AlwaysOn" });

    const response = await activeGET(activeRequest());
    const payload = (await response.json()) as { popup: { id: string } | null };
    expect(payload.popup?.id).toBe(popup.id);
  });

  it("never returns a disabled popup even inside its schedule window (AC-38)", async () => {
    await createPopup({
      title: "Disabled",
      enabled: false,
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 60_000)
    });

    const response = await activeGET(activeRequest());
    const payload = (await response.json()) as { popup: unknown };
    expect(payload.popup).toBeNull();
  });

  it("matches target paths, including a trailing wildcard (AC-39)", async () => {
    const blogPopup = await createPopup({ title: "Blog", targetPaths: ["/blog/*"] });
    await createPopup({ title: "Lessons Only", targetPaths: ["/lessons"] });

    const blogResponse = await activeGET(activeRequest("/blog/post-1"));
    const blogPayload = (await blogResponse.json()) as { popup: { id: string } | null };
    expect(blogPayload.popup?.id).toBe(blogPopup.id);

    const homeResponse = await activeGET(activeRequest("/"));
    const homePayload = (await homeResponse.json()) as { popup: unknown };
    expect(homePayload.popup).toBeNull();
  });

  it("returns exactly one popup — the most recently created — when several qualify (AC-41)", async () => {
    await createPopup({ title: "Older", createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = await createPopup({ title: "Newer", createdAt: new Date("2026-06-01T00:00:00Z") });

    const response = await activeGET(activeRequest());
    const payload = (await response.json()) as { popup: { id: string } };
    expect(payload.popup.id).toBe(newer.id);
  });

  it("never leaks createdById, the internal title, or timestamps", async () => {
    await createPopup({ title: "Secret Internal Name" });

    const response = await activeGET(activeRequest());
    const payload = (await response.json()) as { popup: Record<string, unknown> };
    expect(payload.popup).not.toHaveProperty("createdById");
    expect(payload.popup).not.toHaveProperty("title");
    expect(payload.popup).not.toHaveProperty("createdAt");
    expect(payload.popup).not.toHaveProperty("startAt");
    expect(payload.popup).not.toHaveProperty("endAt");
  });

  it("rejects an unknown popup id on the stats route", async () => {
    const response = await statsPOST(statsRequest({ type: "impression" }), {
      params: Promise.resolve({ id: "does-not-exist" })
    });
    expect(response.status).toBe(404);
    expect(await prisma.popupDayStat.count()).toBe(0);
  });

  it("rejects an invalid event type", async () => {
    const popup = await createPopup({ title: "Stats Target" });
    const response = await statsPOST(statsRequest({ type: "bogus" }), {
      params: Promise.resolve({ id: popup.id })
    });
    expect(response.status).toBe(400);
    expect(await prisma.popupDayStat.count({ where: { popupId: popup.id } })).toBe(0);
  });

  it("upserts the counter onto the same day row rather than duplicating", async () => {
    const popup = await createPopup({ title: "Stats Target" });

    const first = await statsPOST(statsRequest({ type: "impression" }), {
      params: Promise.resolve({ id: popup.id })
    });
    expect(first.status).toBe(200);
    const second = await statsPOST(statsRequest({ type: "click" }), {
      params: Promise.resolve({ id: popup.id })
    });
    expect(second.status).toBe(200);

    const rows = await prisma.popupDayStat.findMany({ where: { popupId: popup.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].impressions).toBe(1);
    expect(rows[0].clicks).toBe(1);
    expect(rows[0].dismissals).toBe(0);
  });
});
