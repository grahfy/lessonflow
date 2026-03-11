import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as executeUpdateRoute } from "@/app/api/admin/updates/execute/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: "",
    stderr: ""
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
    vi.stubEnv("UPDATES_DEPLOY_USER", "deploy");
    vi.stubEnv("UPDATES_GIT_REPO_PATH", "/srv/lessonflow-repo");
  });

  it("returns 401 for unauthorized requests", async () => {
    const request = new NextRequest("http://localhost/api/admin/updates/execute", { method: "POST" });
    const response = await executeUpdateRoute(request);
    expect(response.status).toBe(401);
  });

  it("triggers update when authorized", async ({}) => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    (fs.existsSync as any).mockImplementation((target: string) => {
      if (target === "/srv/lessonflow-repo/.git") return true;
      if (target === "/etc/systemd/system/lessonflow-web-update.service") return true;
      return false;
    });

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
    expect(spawnSync).toHaveBeenCalledWith(
      "sudo",
      ["-n", "systemctl", "start", "lessonflow-web-update.service"],
      expect.objectContaining({
        cwd: expect.any(String),
        encoding: "utf8"
      })
    );
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

  it("returns 503 when the web update runner is not configured", async () => {
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

    expect(response.status).toBe(503);
    expect(data.error).toMatch(/Web-triggered updates are not configured/i);
  });
});
