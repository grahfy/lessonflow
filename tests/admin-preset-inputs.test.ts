import { describe, expect, it } from "vitest";

import {
  formatPresetDiscountInput,
  normalizePresetAmountInput,
  normalizePresetDiscountInput,
  serializePresetAmountInput,
  serializePresetDiscountInput
} from "@/lib/admin/preset-inputs";

describe("admin preset inputs", () => {
  it("normalizes valid AUD amounts without rewriting blank values", () => {
    expect(normalizePresetAmountInput("").input).toBe("");
    expect(normalizePresetAmountInput("12").input).toBe("12.00");
    expect(normalizePresetAmountInput("$1,250.5").input).toBe("1250.50");
  });

  it("serializes preset amounts and rejects malformed input", () => {
    expect(serializePresetAmountInput("").value).toBe(0);
    expect(serializePresetAmountInput("12.34").value).toBe(1234);
    expect(serializePresetAmountInput("12.345")).toEqual({
      value: null,
      error: "Use formats like $50, 50, or 50.00."
    });
  });

  it("formats and normalizes discount inputs by kind", () => {
    expect(formatPresetDiscountInput("amount", 700)).toBe("7.00");
    expect(formatPresetDiscountInput("percent", 1250)).toBe("12.5");
    expect(normalizePresetDiscountInput("amount", "7").input).toBe("7.00");
    expect(normalizePresetDiscountInput("percent", "12.5").input).toBe("12.5");
  });

  it("serializes discount inputs with amount and percent validation", () => {
    expect(serializePresetDiscountInput(null, "5.00").value).toBeNull();
    expect(serializePresetDiscountInput("amount", "").value).toBe(0);
    expect(serializePresetDiscountInput("amount", "7.25").value).toBe(725);
    expect(serializePresetDiscountInput("percent", "12.5").value).toBe(1250);
    expect(serializePresetDiscountInput("percent", "")).toEqual({
      value: null,
      error: "Enter a valid percentage."
    });
  });
});
