import { describe, expect, it } from "vitest";

import { getActiveAdminNavGroup, getVisibleAdminNavGroups } from "@/lib/admin/config";

describe("admin-nav-config", () => {
  it("groups owner navigation into business, education, and system sections", () => {
    const groups = getVisibleAdminNavGroups("owner");

    expect(groups.map((group) => group.label)).toEqual(["Business", "Education", "System"]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["Dashboard", "Bookings", "Customers", "Invoices", "Reports", "Analytics"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["Teachers", "Lesson Plans", "Chords"]);
    expect(groups[2]?.items.map((item) => item.label)).toEqual(["Settings", "Logs", "Manual", "About"]);
  });

  it("filters owner-only destinations for teachers", () => {
    const groups = getVisibleAdminNavGroups("teacher");

    expect(groups.map((group) => group.label)).toEqual(["Business", "Education"]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["Dashboard", "Bookings", "Customers"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["Teachers", "Lesson Plans"]);
  });

  it("never leaks owner-only destinations into the teacher navigation (authz)", () => {
    // SECURITY: The mobile drawer reuses getVisibleAdminNavGroups, so this is the
    // single source of truth for which nav items a teacher session can ever see.
    const ownerOnlyLabels = new Set(["Invoices", "Reports", "Analytics", "Chords", "Settings", "Logs", "Manual", "About"]);
    const teacherLabels = getVisibleAdminNavGroups("teacher").flatMap((group) => group.items.map((item) => item.label));

    for (const label of teacherLabels) {
      expect(ownerOnlyLabels.has(label), `Teacher nav must not include owner-only item "${label}".`).toBe(false);
    }
  });

  it("resolves the active group from the current route", () => {
    const groups = getVisibleAdminNavGroups("owner");

    expect(getActiveAdminNavGroup("/admin/customers", groups)).toBe("business");
    expect(getActiveAdminNavGroup("/admin/lesson-plans", groups)).toBe("education");
    expect(getActiveAdminNavGroup("/admin/settings", groups)).toBe("system");
    expect(getActiveAdminNavGroup("/admin", groups)).toBeNull();
  });
});
