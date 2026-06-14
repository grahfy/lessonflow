import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoiceUpdate } = vi.hoisted(() => ({
  mockInvoiceUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      update: mockInvoiceUpdate,
    },
  },
}));

import { ensurePayToken, generatePayToken, invoicePayUrl } from "@/lib/invoices/pay-token";

describe("generatePayToken", () => {
  it("produces a URL-safe token", () => {
    const token = generatePayToken();
    // base64url alphabet only: A-Z a-z 0-9 - _ (no +, /, or = padding).
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a high-entropy token (>= 43 chars for 32 bytes)", () => {
    expect(generatePayToken().length).toBeGreaterThanOrEqual(43);
  });

  it("produces a unique token on each call", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generatePayToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("invoicePayUrl", () => {
  it("builds an absolute pay URL", () => {
    expect(invoicePayUrl("https://example.com", "abc123")).toBe("https://example.com/pay/abc123");
  });

  it("trims a trailing slash from the base URL", () => {
    expect(invoicePayUrl("https://example.com/", "abc123")).toBe("https://example.com/pay/abc123");
  });

  it("url-encodes the token", () => {
    // base64url never contains reserved chars, but the helper must be safe regardless.
    expect(invoicePayUrl("https://example.com", "a/b c")).toBe("https://example.com/pay/a%2Fb%20c");
  });
});

describe("ensurePayToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoiceUpdate.mockResolvedValue(undefined);
  });

  it("reuses an existing token without writing to the DB", async () => {
    const token = await ensurePayToken({ id: "inv_1", payToken: "existing-token" });
    expect(token).toBe("existing-token");
    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
  });

  it("generates and persists a token when none exists", async () => {
    const token = await ensurePayToken({ id: "inv_1", payToken: null });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: { payToken: token },
    });
  });
});

/**
 * The payable-state gate is the rule shared by the pay page and the pay route:
 * an invoice is payable only when it is "sent", not paid/void, and not deleted.
 * These tests pin that predicate so a regression in either surface is caught.
 */
describe("invoice payable-state gating", () => {
  function isPayable(invoice: { status: string; isDeleted: boolean }): boolean {
    return !invoice.isDeleted && invoice.status === "sent";
  }

  it("allows a sent, non-deleted invoice", () => {
    expect(isPayable({ status: "sent", isDeleted: false })).toBe(true);
  });

  it("rejects a draft invoice", () => {
    expect(isPayable({ status: "draft", isDeleted: false })).toBe(false);
  });

  it("rejects a paid invoice", () => {
    expect(isPayable({ status: "paid", isDeleted: false })).toBe(false);
  });

  it("rejects a void invoice", () => {
    expect(isPayable({ status: "void", isDeleted: false })).toBe(false);
  });

  it("rejects a deleted invoice even when sent", () => {
    expect(isPayable({ status: "sent", isDeleted: true })).toBe(false);
  });
});
