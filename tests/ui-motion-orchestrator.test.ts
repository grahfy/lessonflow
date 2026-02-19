import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_STAGGER_ITEMS_ADMIN,
  MAX_STAGGER_ITEMS_CALENDAR,
  MAX_STAGGER_ITEMS_PUBLIC,
  getMotionItemLimit,
  inferMotionScope,
  prefersReducedMotion
} from "@/components/motion/tween-orchestrator";

type WindowLike = {
  matchMedia?: (query: string) => { matches: boolean };
};

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
    writable: true
  });
});

describe("ui-motion-orchestrator", () => {
  it("uses explicit scope caps", () => {
    expect(getMotionItemLimit("public")).toBe(MAX_STAGGER_ITEMS_PUBLIC);
    expect(getMotionItemLimit("admin")).toBe(MAX_STAGGER_ITEMS_ADMIN);
    expect(getMotionItemLimit("calendar")).toBe(MAX_STAGGER_ITEMS_CALENDAR);
  });

  it("infers scope from root metadata", () => {
    const adminRoot = {
      dataset: { motionRoot: "admin" },
      classList: { contains: () => false }
    } as unknown as HTMLElement;
    const calendarRoot = {
      dataset: { motionScope: "calendar" },
      classList: { contains: () => false }
    } as unknown as HTMLElement;
    const classFallbackRoot = {
      dataset: {},
      classList: { contains: (value: string) => value === "admin-shell" }
    } as unknown as HTMLElement;

    expect(inferMotionScope(null)).toBe("public");
    expect(inferMotionScope(adminRoot)).toBe("admin");
    expect(inferMotionScope(calendarRoot)).toBe("calendar");
    expect(inferMotionScope(classFallbackRoot)).toBe("admin");
  });

  it("honors reduced-motion media query when available", () => {
    const reducedWindow: WindowLike = {
      matchMedia: () => ({ matches: true })
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: reducedWindow,
      writable: true
    });

    expect(prefersReducedMotion()).toBe(true);
  });

  it("falls back to non-reduced when matchMedia is unavailable", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {} as WindowLike,
      writable: true
    });

    expect(prefersReducedMotion()).toBe(false);
  });
});
