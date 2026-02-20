import { describe, expect, it } from "vitest";

import { parseAudInputToCents } from "@/lib/invoices/currency";

describe("invoice-currency", () => {
  it("accepts flexible AUD formats", () => {
    expect(parseAudInputToCents("$50.00").cents).toBe(5000);
    expect(parseAudInputToCents("$50").cents).toBe(5000);
    expect(parseAudInputToCents("50").cents).toBe(5000);
    expect(parseAudInputToCents("50.00").cents).toBe(5000);
    expect(parseAudInputToCents("  $1,250.50 ").cents).toBe(125050);
  });

  it("returns null for empty input and errors for malformed values", () => {
    expect(parseAudInputToCents("").cents).toBeNull();
    expect(parseAudInputToCents(" ").cents).toBeNull();
    expect(parseAudInputToCents("$").error).toBeTruthy();
    expect(parseAudInputToCents("abc").error).toBeTruthy();
    expect(parseAudInputToCents("12.345").error).toBeTruthy();
  });
});
