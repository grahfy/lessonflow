import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as reportSystemLogs } from "@/app/api/admin/system-logs/report/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import * as emailService from "@/lib/email/service";

function ownerRequest(body: Record<string, unknown>, token: string) {
  return new NextRequest("http://localhost/api/admin/system-logs/report", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-system-logs-report", () => {
  beforeEach(async () => {
    await prisma.systemLog.deleteMany();
    await prisma.adminUser.deleteMany();
    vi.restoreAllMocks();
  });

  it("rejects bug reports when email delivery is not configured", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({ status: "queued_no_smtp" });

    const response = await reportSystemLogs(
      ownerRequest(
        {
          subject: "Missing SMTP",
          description: "The logs page should not report success when no provider is configured.",
          includeRecentLogs: false
        },
        token
      )
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
  });

  it("returns 502 when the bug report email provider rejects the message", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({
      status: "failed",
      error: "SMTP rejected recipient"
    });

    const response = await reportSystemLogs(
      ownerRequest(
        {
          subject: "Provider failed",
          description: "The logs page should surface provider delivery failure clearly.",
          includeRecentLogs: false
        },
        token
      )
    );
    const body = (await response.json()) as { error?: string; details?: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe("Failed to send email report.");
    expect(body.details).toBe("SMTP rejected recipient");
  });

  it("accepts successful shared-mail delivery for bug reports, including Gmail-backed sends", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    vi.spyOn(emailService, "sendEmail").mockResolvedValueOnce({ status: "sent" });

    const response = await reportSystemLogs(
      ownerRequest(
        {
          subject: "Gmail-backed success",
          description: "A successful send from the shared mail layer should be accepted.",
          includeRecentLogs: false
        },
        token
      )
    );
    const body = (await response.json()) as { ok?: boolean; status?: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("sent");
  });
});
