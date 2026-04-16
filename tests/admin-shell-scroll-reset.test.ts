import { describe, expect, it, vi } from "vitest";

import {
  findAdminScrollResetTarget,
  resetAdminWindowScroll,
  resetAdminScrollPosition,
} from "@/components/admin/layout/admin-shell";

describe("admin-shell scroll reset helpers", () => {
  it("prefers the nested scrollable admin layout container", () => {
    const nestedTarget = { scrollTop: 240 };
    const root = {
      scrollTop: 80,
      querySelector: vi.fn().mockReturnValue(nestedTarget),
    };

    expect(findAdminScrollResetTarget(root)).toBe(nestedTarget);
    expect(root.querySelector).toHaveBeenCalledWith(".admin-layout-content.is-scrollable");
  });

  it("falls back to the shell content element when no nested container exists", () => {
    const root = {
      scrollTop: 180,
      querySelector: vi.fn().mockReturnValue(null),
    };

    expect(findAdminScrollResetTarget(root)).toBe(root);
  });

  it("resets the target with scrollTo when available", () => {
    const scrollTo = vi.fn();
    const target = {
      scrollTop: 300,
      scrollTo,
    };

    resetAdminScrollPosition(target);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("falls back to assigning scrollTop when scrollTo is unavailable", () => {
    const target = {
      scrollTop: 300,
    };

    resetAdminScrollPosition(target);

    expect(target.scrollTop).toBe(0);
  });

  it("ignores null targets", () => {
    expect(() => resetAdminScrollPosition(null)).not.toThrow();
  });

  it("resets the outer window scroll when available", () => {
    const scrollTo = vi.fn();

    resetAdminWindowScroll({ scrollTo });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});
