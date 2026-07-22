import { describe, expect, it } from "vitest";

import { getActiveStudentTabHref, getStudentTabItems } from "@/components/student-portal/student-tabs";

describe("student-tabs", () => {
  it("derives the active tab for each of the four student routes", () => {
    expect(getActiveStudentTabHref("/student/portal")).toBe("/student/portal");
    expect(getActiveStudentTabHref("/student/materials")).toBe("/student/materials");
    expect(getActiveStudentTabHref("/student/chords")).toBe("/student/chords");
    expect(getActiveStudentTabHref("/student/book")).toBe("/student/book");
  });

  it("matches nested paths under a tab route", () => {
    expect(getActiveStudentTabHref("/student/materials/some-folder")).toBe("/student/materials");
  });

  it("returns null for a pathname outside the tab set", () => {
    expect(getActiveStudentTabHref("/student/login")).toBeNull();
  });

  it("marks exactly one tab active and gives it aria-current semantics", () => {
    const tabs = getStudentTabItems("/student/chords");

    expect(tabs.map((tab) => tab.href)).toEqual([
      "/student/portal",
      "/student/materials",
      "/student/chords",
      "/student/book"
    ]);
    expect(tabs.filter((tab) => tab.isActive).map((tab) => tab.href)).toEqual(["/student/chords"]);

    for (const tab of tabs) {
      const ariaCurrent = tab.isActive ? "page" : undefined;
      expect(ariaCurrent).toBe(tab.href === "/student/chords" ? "page" : undefined);
    }
  });
});
