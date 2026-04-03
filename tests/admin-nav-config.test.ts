import { describe, expect, it } from "vitest";

import { getActiveAdminNavGroup, getVisibleAdminNavGroups } from "@/lib/admin/config";

describe("admin-nav-config", () => {
  it("groups owner navigation into business, education, and system sections", () => {
    const groups = getVisibleAdminNavGroups("owner");

    expect(groups.map((group) => group.label)).toEqual(["Business", "Education", "System"]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["Bookings", "Customers", "Invoices", "Reports"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["Teachers", "Lesson Plans", "Chords"]);
    expect(groups[2]?.items.map((item) => item.label)).toEqual(["Settings", "Logs", "Manual", "About"]);
  });

  it("filters owner-only destinations for teachers", () => {
    const groups = getVisibleAdminNavGroups("teacher");

    expect(groups.map((group) => group.label)).toEqual(["Business", "Education"]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["Bookings", "Customers"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["Teachers", "Lesson Plans"]);
  });

  it("resolves the active group from the current route", () => {
    const groups = getVisibleAdminNavGroups("owner");

    expect(getActiveAdminNavGroup("/admin/customers", groups)).toBe("business");
    expect(getActiveAdminNavGroup("/admin/lesson-plans", groups)).toBe("education");
    expect(getActiveAdminNavGroup("/admin/settings", groups)).toBe("system");
    expect(getActiveAdminNavGroup("/admin", groups)).toBeNull();
  });
});
