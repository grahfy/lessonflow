import { describe, expect, it } from "vitest";

import { resolveLessonPlanTemplateSelection } from "@/lib/admin/lesson-plan-template-selection";
import type { LessonPlanTemplateState } from "@/lib/lesson-plan-contract";

const templates: LessonPlanTemplateState[] = [
  {
    id: "template-2",
    title: "Latest Template",
    description: "",
    lessonFocus: "",
    goals: "",
    activities: "",
    homework: "",
    sharedNotes: "",
    privateNotes: "",
    createdById: "admin-1",
    createdByDisplayName: "Owner",
    updatedAt: "2026-03-25T10:00:00.000Z",
    isArchived: false
  },
  {
    id: "template-1",
    title: "Older Template",
    description: "",
    lessonFocus: "",
    goals: "",
    activities: "",
    homework: "",
    sharedNotes: "",
    privateNotes: "",
    createdById: "admin-1",
    createdByDisplayName: "Owner",
    updatedAt: "2026-03-24T10:00:00.000Z",
    isArchived: false
  }
];

describe("resolveLessonPlanTemplateSelection", () => {
  it("defaults to the first available template when nothing has been selected yet", () => {
    expect(resolveLessonPlanTemplateSelection("", templates)).toBe("template-2");
  });

  it("keeps explicit new-template mode when requested", () => {
    expect(resolveLessonPlanTemplateSelection("new", templates)).toBe("new");
  });

  it("falls back to the first available template when the selected template disappears", () => {
    expect(resolveLessonPlanTemplateSelection("missing-template", templates)).toBe("template-2");
  });

  it("returns new when the library is empty", () => {
    expect(resolveLessonPlanTemplateSelection("", [])).toBe("new");
  });
});
