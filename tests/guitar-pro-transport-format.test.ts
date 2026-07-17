// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatTime,
  percentToSpeed,
  progressFraction,
  speedToPercent
} from "@/lib/guitar-pro/transport-format";

describe("transport-format", () => {
  describe("formatTime", () => {
    it("formats a sub-minute duration with zero-padded seconds", () => {
      expect(formatTime(5000)).toBe("0:05");
    });

    it("formats exactly zero as 0:00", () => {
      expect(formatTime(0)).toBe("0:00");
    });

    it("formats a duration over a minute", () => {
      expect(formatTime(72000)).toBe("1:12");
    });

    it("formats a duration in the several-minutes range", () => {
      expect(formatTime(220000)).toBe("3:40");
    });

    it("formats an exact minute boundary", () => {
      expect(formatTime(60000)).toBe("1:00");
    });

    it("formats an exact 10 minutes", () => {
      expect(formatTime(600000)).toBe("10:00");
    });

    it("does not wrap minutes past 59 into hours", () => {
      expect(formatTime(3661000)).toBe("61:01");
    });

    it("clamps negative input to 0:00", () => {
      expect(formatTime(-5)).toBe("0:00");
    });

    it("treats NaN as 0:00", () => {
      expect(formatTime(Number.NaN)).toBe("0:00");
    });

    it("floors fractional milliseconds down to whole seconds", () => {
      expect(formatTime(1999)).toBe("0:01");
    });
  });

  describe("formatClock", () => {
    it("joins current and total as 'current / total'", () => {
      expect(formatClock(72000, 220000)).toBe("1:12 / 3:40");
    });

    it("falls back to 0:00 / 0:00 when both current and total are 0 (score not loaded)", () => {
      expect(formatClock(0, 0)).toBe("0:00 / 0:00");
    });

    it("falls back the total side to 0:00 when total is NaN, keeping the real current", () => {
      expect(formatClock(5000, Number.NaN)).toBe("0:05 / 0:00");
    });

    it("clamps a negative current to 0:00 while keeping a valid total", () => {
      expect(formatClock(-100, 60000)).toBe("0:00 / 1:00");
    });
  });

  describe("progressFraction", () => {
    it("computes a mid-track fraction", () => {
      expect(progressFraction(50000, 100000)).toBe(0.5);
    });

    it("returns 0 at the very start", () => {
      expect(progressFraction(0, 100000)).toBe(0);
    });

    it("returns 1 at the very end", () => {
      expect(progressFraction(100000, 100000)).toBe(1);
    });

    it("clamps an overshoot above total to 1", () => {
      expect(progressFraction(150000, 100000)).toBe(1);
    });

    it("returns 0 when total is 0 rather than dividing by zero", () => {
      expect(progressFraction(5000, 0)).toBe(0);
    });

    it("returns 0 when total is negative", () => {
      expect(progressFraction(5000, -100)).toBe(0);
    });

    it("clamps a negative current to 0", () => {
      expect(progressFraction(-5000, 100000)).toBe(0);
    });
  });

  describe("speedToPercent", () => {
    it("converts normal speed (1.0) to 100", () => {
      expect(speedToPercent(1)).toBe(100);
    });

    it("converts a slower speed (0.6) to 60", () => {
      expect(speedToPercent(0.6)).toBe(60);
    });

    it("converts a faster speed (1.25) to 125", () => {
      expect(speedToPercent(1.25)).toBe(125);
    });

    it("rounds to the nearest integer percent", () => {
      expect(speedToPercent(0.666)).toBe(67);
    });

    it("falls back to 100 for non-finite input", () => {
      expect(speedToPercent(Number.NaN)).toBe(100);
    });
  });

  describe("percentToSpeed", () => {
    it("converts 100 back to normal speed (1.0)", () => {
      expect(percentToSpeed(100)).toBe(1);
    });

    it("converts 60 to 0.6", () => {
      expect(percentToSpeed(60)).toBe(0.6);
    });

    it("converts 125 to 1.25", () => {
      expect(percentToSpeed(125)).toBe(1.25);
    });

    it("falls back to 1 for non-finite input", () => {
      expect(percentToSpeed(Number.POSITIVE_INFINITY)).toBe(1);
    });

    it("round-trips with speedToPercent for a whole-percent value", () => {
      expect(speedToPercent(percentToSpeed(80))).toBe(80);
    });
  });
});
