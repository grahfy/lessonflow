import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { DELETE, GET } from "@/app/api/admin/system-logs/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function ownerRequest(url: string, token: string, method: "GET" | "DELETE" = "GET", body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-system-logs", () => {
  beforeEach(async () => {
    await prisma.systemLog.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("downloads every filtered log row as plain text", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.systemLog.createMany({
      data: [
        {
          level: "error",
          event: "invoice.save_failed",
          message: "Invoice save failed",
          createdAt: new Date("2026-03-17T10:00:00.000Z")
        },
        {
          level: "info",
          event: "invoice.saved",
          message: "Invoice saved",
          createdAt: new Date("2026-03-17T11:00:00.000Z")
        }
      ]
    });

    const response = await GET(ownerRequest("http://localhost/api/admin/system-logs?level=error&download=true", token));
    expect(response).toBeDefined();
    const body = await response!.text();

    expect(response!.status).toBe(200);
    expect(response!.headers.get("content-type")).toContain("text/plain");
    expect(response!.headers.get("content-disposition")).toContain("attachment;");
    expect(body).toContain("invoice.save_failed");
    expect(body).not.toContain("invoice.saved");
  });

  it("clears logs up to a selected datetime-local cutoff", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const oldLog = await prisma.systemLog.create({
      data: {
        level: "info",
        event: "job.old",
        message: "old",
        createdAt: new Date("2026-03-17T01:00:00.000Z")
      }
    });
    const recentLog = await prisma.systemLog.create({
      data: {
        level: "info",
        event: "job.new",
        message: "new",
        createdAt: new Date("2026-03-18T05:00:00.000Z")
      }
    });

    const response = await DELETE(
      ownerRequest("http://localhost/api/admin/system-logs", token, "DELETE", {
        mode: "before",
        cutoffLocal: "2026-03-17T23:59"
      })
    );
    expect(response).toBeDefined();
    const body = (await response!.json()) as { ok?: boolean; deletedCount?: number };

    expect(response!.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.deletedCount).toBe(1);

    const remainingLogs = await prisma.systemLog.findMany({
      orderBy: { createdAt: "asc" }
    });
    expect(remainingLogs.map((log) => log.id)).toEqual([recentLog.id]);
    expect(remainingLogs[0]?.id).not.toBe(oldLog.id);
  });

  it("clears all logs in one owner-only action", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    await prisma.systemLog.createMany({
      data: [
        { level: "warn", event: "warn.one", message: "one" },
        { level: "error", event: "error.two", message: "two" }
      ]
    });

    const response = await DELETE(
      ownerRequest("http://localhost/api/admin/system-logs", token, "DELETE", {
        mode: "all"
      })
    );
    expect(response).toBeDefined();
    const body = (await response!.json()) as { ok?: boolean; deletedCount?: number };

    expect(response!.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.deletedCount).toBe(2);
    expect(await prisma.systemLog.count()).toBe(0);
  });
});
