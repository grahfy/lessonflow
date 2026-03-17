import { describe, expect, it } from "vitest";

import { basisPointsToPercentageInput, parseAudInputToCents, parsePercentageInputToBasisPoints } from "@/lib/invoices/currency";

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

  it("accepts flexible percentage formats", () => {
    expect(parsePercentageInputToBasisPoints("10").basisPoints).toBe(1000);
    expect(parsePercentageInputToBasisPoints("10.5").basisPoints).toBe(1050);
    expect(parsePercentageInputToBasisPoints("10.25%").basisPoints).toBe(1025);
    expect(basisPointsToPercentageInput(1250)).toBe("12.5");
  });
});
