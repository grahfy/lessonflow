// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getContrastRatio, WCAG_AA_NORMAL_TEXT_RATIO } from "@/lib/popups/contrast";

describe("getContrastRatio", () => {
  it("gives the maximum 21:1 ratio for black on white and passes AA", () => {
    const result = getContrastRatio("#000000", "#ffffff");
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeCloseTo(21, 5);
    expect(result!.passesAA).toBe(true);
  });

  it("gives a 1:1 ratio for white on white and fails AA", () => {
    const result = getContrastRatio("#ffffff", "#ffffff");
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeCloseTo(1, 5);
    expect(result!.passesAA).toBe(false);
  });

  it("is order-independent (foreground/background can be passed either way)", () => {
    const a = getContrastRatio("#000000", "#ffffff");
    const b = getContrastRatio("#ffffff", "#000000");
    expect(a!.ratio).toBeCloseTo(b!.ratio, 10);
  });

  it("treats a 3-digit hex as shorthand for its 6-digit expansion", () => {
    const short = getContrastRatio("#000", "#fff");
    const long = getContrastRatio("#000000", "#ffffff");
    expect(short!.ratio).toBeCloseTo(long!.ratio, 10);
  });

  it("accepts hex with or without a leading #", () => {
    const withHash = getContrastRatio("#000000", "#ffffff");
    const withoutHash = getContrastRatio("000000", "ffffff");
    expect(withoutHash!.ratio).toBeCloseTo(withHash!.ratio, 10);
  });

  it("passes AA just above the 4.5:1 threshold (#767676 on white)", () => {
    const result = getContrastRatio("#767676", "#ffffff");
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_RATIO);
    expect(result!.passesAA).toBe(true);
  });

  it("fails AA just below the 4.5:1 threshold (#777777 on white)", () => {
    const result = getContrastRatio("#777777", "#ffffff");
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeLessThan(WCAG_AA_NORMAL_TEXT_RATIO);
    expect(result!.passesAA).toBe(false);
  });

  it("returns null for an unparseable colour (wrong length)", () => {
    expect(getContrastRatio("#12345", "#ffffff")).toBeNull();
  });

  it("returns null for non-hex characters", () => {
    expect(getContrastRatio("#gggggg", "#ffffff")).toBeNull();
  });

  it("returns null for a named colour instead of hex", () => {
    expect(getContrastRatio("red", "#ffffff")).toBeNull();
  });
});
