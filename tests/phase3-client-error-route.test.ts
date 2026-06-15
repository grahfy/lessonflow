import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the public client-error reporting route
 * (src/app/api/internal/client-error/route.ts).
 *
 * The endpoint is intentionally unauthenticated and hardened. We mock:
 *   - `logError` (under VITEST it no-ops + writes no SystemLog row, so assert on
 *     the mock to prove the persist path is taken),
 *   - `consumeRateLimit` / `getRequestIpFromHeaders` (the real limiter no-ops
 *     under VITEST, so we drive the per-IP gate explicitly).
 *
 * Key invariants: valid payload -> 2xx + logged; oversized body -> rejected;
 * invalid/missing fields -> 4xx; over rate-limit -> 429; never sends an owner
 * alert email (we assert `logCritical` is never called); no input reflected.
 */

const { mockConsumeRateLimit, mockGetIp, mockLogError, mockLogCritical } = vi.hoisted(() => ({
  mockConsumeRateLimit: vi.fn(),
  mockGetIp: vi.fn(),
  mockLogError: vi.fn(),
  mockLogCritical: vi.fn()
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: mockConsumeRateLimit,
  getRequestIpFromHeaders: mockGetIp
}));

vi.mock("@/lib/observability", () => ({
  logError: mockLogError,
  logCritical: mockLogCritical,
  logEvent: vi.fn()
}));

import { POST as clientError } from "@/app/api/internal/client-error/route";

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/internal/client-error", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw
  });
}

const validPayload = {
  message: "Something broke",
  stack: "Error: Something broke\n  at Foo (foo.tsx:1:1)",
  digest: "abc123",
  boundary: "admin" as const,
  path: "/admin/invoices"
};

describe("phase3-client-error-route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIp.mockReturnValue("1.2.3.4");
    mockConsumeRateLimit.mockReturnValue({ allowed: true, remaining: 19, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid payload (200) and persists via logError", async () => {
    const res = await clientError(jsonRequest(validPayload));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const [event, , meta] = mockLogError.mock.calls[0];
    expect(event).toBe("client_error");
    expect(meta).toMatchObject({ boundary: "admin", message: "Something broke" });
  });

  it("NEVER sends an owner alert email (logCritical not used)", async () => {
    await clientError(jsonRequest(validPayload));
    expect(mockLogCritical).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared Content-Length (413)", async () => {
    const res = await clientError(
      jsonRequest(validPayload, { "content-length": String(9 * 1024) })
    );
    expect(res.status).toBe(413);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("rejects an oversized actual body even with a lying Content-Length (413)", async () => {
    const big = { ...validPayload, message: "x".repeat(20 * 1024) };
    const res = await clientError(jsonRequest(big, { "content-length": "10" }));
    expect(res.status).toBe(413);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON (400)", async () => {
    const res = await clientError(jsonRequest("{not valid json"));
    expect(res.status).toBe(400);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("rejects missing required fields (400)", async () => {
    const res = await clientError(jsonRequest({ stack: "x" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown boundary value (400)", async () => {
    const res = await clientError(jsonRequest({ message: "hi", boundary: "evil" }));
    expect(res.status).toBe(400);
  });

  it("rejects an over-length message (400)", async () => {
    const res = await clientError(
      jsonRequest({ message: "x".repeat(1001), boundary: "root" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when the per-IP rate limit is exceeded", async () => {
    mockConsumeRateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterSeconds: 300 });
    const res = await clientError(jsonRequest(validPayload));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("rate-limits per IP using a client-error:<ip> key", async () => {
    await clientError(jsonRequest(validPayload));
    const limitInput = mockConsumeRateLimit.mock.calls[0][0];
    expect(limitInput.key).toBe("client-error:1.2.3.4");
    expect(limitInput.limit).toBe(20);
  });

  it("does not reflect any user input in the response body", async () => {
    const marker = "REFLECT_ME_12345";
    const res = await clientError(
      jsonRequest({ message: marker, boundary: "root", stack: marker, path: marker })
    );
    const text = await res.text();
    expect(text).not.toContain(marker);
  });
});
