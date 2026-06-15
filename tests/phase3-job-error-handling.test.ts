import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tests for Phase 3 error handling on the previously-silent job routes
 * (gmail-sync, purge-logs, analytics-purge). Each route now wraps its work in
 * try/catch, calls `logCritical(...)` on failure, and returns a normalized
 * `jsonUnexpectedError` response (500) instead of swallowing the error.
 *
 * We mock `logCritical` (under VITEST it would no-op anyway) and force the
 * underlying dependency to throw, then assert: (1) the route returns 500 and
 * (2) the error path called `logCritical` with the route-specific event key.
 */

const { mockLogCritical, mockLogEvent, mockSyncGmail, mockIsGmailConfigured } = vi.hoisted(() => ({
  mockLogCritical: vi.fn(),
  mockLogEvent: vi.fn(),
  mockSyncGmail: vi.fn(),
  mockIsGmailConfigured: vi.fn()
}));

vi.mock("@/lib/observability", () => ({
  logCritical: mockLogCritical,
  logEvent: mockLogEvent,
  logError: vi.fn()
}));

vi.mock("@/lib/gmail/sync", () => ({
  syncGmailSentMessages: mockSyncGmail
}));

vi.mock("@/lib/email/gmail-service", () => ({
  isGmailConfigured: mockIsGmailConfigured
}));

import { POST as gmailSync } from "@/app/api/jobs/gmail-sync/route";
import { POST as purgeLogs } from "@/app/api/jobs/purge-logs/route";
import { POST as analyticsPurge } from "@/app/api/jobs/analytics-purge/route";
import { prisma } from "@/lib/db";

const CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";

function jobRequest(url: string, secret: string | undefined = CRON_SECRET) {
  const headers = new Headers();
  if (secret) {
    headers.set("x-cron-secret", secret);
  }
  return new NextRequest(url, { method: "POST", headers });
}

describe("phase3-job-error-handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGmailConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe("gmail-sync", () => {
    it("rejects an unauthorized request before doing any work (401)", async () => {
      const res = await gmailSync(jobRequest("http://localhost/api/jobs/gmail-sync", "wrong"));
      expect(res.status).toBe(401);
      expect(mockLogCritical).not.toHaveBeenCalled();
    });

    it("logs critical + returns 500 when the sync dependency throws", async () => {
      mockSyncGmail.mockRejectedValueOnce(new Error("gmail api exploded"));

      const res = await gmailSync(jobRequest("http://localhost/api/jobs/gmail-sync"));
      expect(res.status).toBe(500);

      expect(mockLogCritical).toHaveBeenCalledTimes(1);
      expect(mockLogCritical.mock.calls[0][0]).toBe("job.gmail-sync.failed");
    });
  });

  describe("purge-logs", () => {
    it("logs critical + returns 500 when the delete query throws", async () => {
      vi.spyOn(prisma.systemLog, "deleteMany").mockRejectedValueOnce(new Error("db gone"));

      const res = await purgeLogs(jobRequest("http://localhost/api/jobs/purge-logs"));
      expect(res.status).toBe(500);

      expect(mockLogCritical).toHaveBeenCalledTimes(1);
      expect(mockLogCritical.mock.calls[0][0]).toBe("job.purge-logs.failed");
    });
  });

  describe("analytics-purge", () => {
    it("logs critical + returns 500 when the delete query throws", async () => {
      vi.spyOn(prisma.pageView, "deleteMany").mockRejectedValueOnce(new Error("db gone"));

      const res = await analyticsPurge(jobRequest("http://localhost/api/jobs/analytics-purge"));
      expect(res.status).toBe(500);

      expect(mockLogCritical).toHaveBeenCalledTimes(1);
      expect(mockLogCritical.mock.calls[0][0]).toBe("job.analytics-purge.failed");
    });
  });
});
