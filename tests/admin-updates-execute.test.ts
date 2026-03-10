import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as executeUpdateRoute } from "@/app/api/admin/updates/execute/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import fs from "node:fs";
import { spawn } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn()
  }))
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs") as any;
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      unlinkSync: vi.fn()
    }
  };
});

async function clearData() {
  await prisma.adminUser.deleteMany();
}

describe("admin-updates-execute-api", () => {
  beforeEach(async () => {
    await clearData();
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized requests", async () => {
    const request = new NextRequest("http://localhost/api/admin/updates/execute", { method: "POST" });
    const response = await executeUpdateRoute(request);
    expect(response.status).toBe(401);
  });

  it("triggers update when authorized", async ({}) => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    (fs.existsSync as any).mockReturnValue(false);

    const request = new NextRequest("http://localhost/api/admin/updates/execute", {
      method: "POST",
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await executeUpdateRoute(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(spawn).toHaveBeenCalled();
  });

  it("returns 409 if update is already in progress", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue("12345");
    
    // Mock process.kill(12345, 0) to succeed (process exists)
    const originalKill = process.kill;
    process.kill = vi.fn().mockReturnValue(true) as any;

    const request = new NextRequest("http://localhost/api/admin/updates/execute", {
      method: "POST",
      headers: {
        cookie: `${getSessionCookieName()}=${token}`
      }
    });

    const response = await executeUpdateRoute(request);
    expect(response.status).toBe(409);
    
    process.kill = originalKill;
  });
});
