import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for Phase 3 `logCritical` (src/lib/observability.ts).
 *
 * `logCritical` persists like `logError` AND fires a rate-limited, gated owner
 * alert email. Under VITEST the SystemLog write is silenced (see `isSilenced`),
 * so we deliberately do NOT assert on SystemLog rows here — instead we assert on
 * the alert pipeline by mocking:
 *   - `sendEmail` (dynamically imported by the alert helper),
 *   - `prisma.notificationSettings.findUnique` (the `errorAlertsEnabled` gate),
 *   - `consumeRateLimit` (the real limiter no-ops under VITEST, so we drive it
 *     explicitly to prove the storm guard prevents a second send).
 *
 * The alert send is fire-and-forget, so each test flushes the microtask queue
 * (`await Promise.resolve()` twice) before asserting on the mocked send.
 */

const { mockSendEmail, mockConsumeRateLimit, mockFindUnique } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockConsumeRateLimit: vi.fn(),
  mockFindUnique: vi.fn()
}));

vi.mock("@/lib/email/service", () => ({
  sendEmail: mockSendEmail
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: mockConsumeRateLimit,
  getRequestIpFromHeaders: vi.fn(() => "test-ip")
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationSettings: {
      findUnique: mockFindUnique
    }
  }
}));

import { logCritical } from "@/lib/observability";

/**
 * Allow the fire-and-forget alert chain to settle. The alert helper awaits a
 * dynamic `import("./email/service")` plus the settings lookup and the send, so
 * a real (zero-delay) timer tick is needed, not just microtask flushes.
 */
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("phase3-observability logCritical", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue({ status: "sent" });
    // Default: limiter allows the send.
    mockConsumeRateLimit.mockReturnValue({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    // Default: no settings row -> defaults to enabled.
    mockFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends a rate-limited owner alert when error alerts are enabled (default)", async () => {
    logCritical("job.test.failed", new Error("boom"), { jobId: "abc" });
    await flushMicrotasks();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0];
    expect(call.to).toBe("owner@example.com");
    expect(call.subject).toContain("job.test.failed");
    // triggerMode "manual" intentionally bypasses automated suppression.
    expect(call.notification).toEqual({ triggerMode: "manual" });
  });

  it("does NOT send an owner email when errorAlertsEnabled is false", async () => {
    mockFindUnique.mockResolvedValue({ errorAlertsEnabled: false });

    logCritical("job.test.failed", new Error("boom"));
    await flushMicrotasks();

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends when a settings row exists with errorAlertsEnabled true", async () => {
    mockFindUnique.mockResolvedValue({ errorAlertsEnabled: true });

    logCritical("job.test.failed", new Error("boom"));
    await flushMicrotasks();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("queries the gate using the 'error-alert' rate-limit key", async () => {
    logCritical("job.test.failed", new Error("boom"));
    await flushMicrotasks();

    expect(mockConsumeRateLimit).toHaveBeenCalledTimes(1);
    const limitInput = mockConsumeRateLimit.mock.calls[0][0];
    expect(limitInput.key).toBe("error-alert");
    expect(limitInput.limit).toBe(1);
  });

  it("does NOT send a second email when the rate-limit window is exhausted", async () => {
    // First call: limiter allows -> email sent.
    mockConsumeRateLimit.mockReturnValueOnce({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    // Second call within window: limiter rejects -> no email.
    mockConsumeRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 120 });

    logCritical("storm.1", new Error("first"));
    await flushMicrotasks();
    logCritical("storm.2", new Error("second"));
    await flushMicrotasks();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("is non-blocking and never throws even if the alert pipeline rejects", async () => {
    mockFindUnique.mockRejectedValue(new Error("db down"));

    // Must return synchronously (void) without throwing.
    expect(() => logCritical("job.test.failed", new Error("boom"))).not.toThrow();
    await flushMicrotasks();

    // The settings lookup rejected, so no email was sent, but no crash occurred.
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not include a raw, unescaped error stack such that it breaks the html body", async () => {
    logCritical("xss.test", new Error("<script>alert(1)</script>"), {
      note: "<img src=x onerror=1>"
    });
    await flushMicrotasks();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const html = String(mockSendEmail.mock.calls[0][0].html ?? "");
    // Error-derived markup must be escaped, not injected verbatim.
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("accepts non-Error values without throwing and still alerts", async () => {
    expect(() => logCritical("job.test.failed", "string failure")).not.toThrow();
    await flushMicrotasks();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
