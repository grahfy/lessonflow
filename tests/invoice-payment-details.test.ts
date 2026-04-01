import { afterEach, describe, expect, it, vi } from "vitest";

import { getSystemInvoicePaymentDetails, resolveInvoicePaymentDetails, withResolvedInvoicePaymentDetails } from "@/lib/invoices/payment-details";

describe("invoice payment details", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads system-managed payment details from current settings", () => {
    vi.stubEnv("INVOICE_BANK_NAME", "Westpac");
    vi.stubEnv("INVOICE_BANK_BSB", "033-123");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NAME", "System Account");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NUMBER", "99990000");

    expect(getSystemInvoicePaymentDetails()).toEqual({
      bankName: "Westpac",
      bankBsb: "033-123",
      bankAccountName: "System Account",
      bankAccountNumber: "99990000"
    });
  });

  it("resolves custom payment details from the invoice record", () => {
    const resolved = resolveInvoicePaymentDetails({
      paymentDetailsSource: "custom",
      bankName: "Commonwealth Bank",
      bankBsb: "063-162",
      bankAccountName: "Custom Account",
      bankAccountNumber: "87654321"
    });

    expect(resolved).toEqual({
      bankName: "Commonwealth Bank",
      bankBsb: "063-162",
      bankAccountName: "Custom Account",
      bankAccountNumber: "87654321"
    });
  });

  it("overlays effective system payment details onto system-managed invoices", () => {
    vi.stubEnv("INVOICE_BANK_NAME", "ANZ");
    vi.stubEnv("INVOICE_BANK_BSB", "013-001");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NAME", "Latest System Account");
    vi.stubEnv("INVOICE_BANK_ACCOUNT_NUMBER", "12345678");

    const resolved = withResolvedInvoicePaymentDetails({
      paymentDetailsSource: "system" as const,
      bankName: "Old Snapshot Bank",
      bankBsb: "000-000",
      bankAccountName: "Old Snapshot Account",
      bankAccountNumber: "00000000",
      marker: "keep-other-fields"
    });

    expect(resolved).toMatchObject({
      paymentDetailsSource: "system",
      bankName: "ANZ",
      bankBsb: "013-001",
      bankAccountName: "Latest System Account",
      bankAccountNumber: "12345678",
      marker: "keep-other-fields"
    });
  });
});
