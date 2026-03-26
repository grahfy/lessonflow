import { describe, expect, it } from "vitest";

import { buildLessonPlanOverlaySegments } from "@/lib/admin/lesson-plan-overlay-segments";

describe("admin-lesson-plan-overlay-segments", () => {
  it("splits linked and plain ranges into stable ordered segments", () => {
    const segments = buildLessonPlanOverlaySegments({
      text: "Play scales slowly",
      materialLinks: [
        {
          fieldKey: "homework",
          materialId: "material-2",
          startOffset: 12,
          endOffset: 18,
          linkedText: "slowly"
        },
        {
          fieldKey: "homework",
          materialId: "material-1",
          startOffset: 5,
          endOffset: 11,
          linkedText: "scales"
        }
      ]
    });

    expect(segments).toEqual([
      {
        text: "Play ",
        linkedText: null,
        materialId: null,
        startOffset: 0,
        endOffset: 5,
        isLinked: false
      },
      {
        text: "scales",
        linkedText: "scales",
        materialId: "material-1",
        startOffset: 5,
        endOffset: 11,
        isLinked: true
      },
      {
        text: " ",
        linkedText: null,
        materialId: null,
        startOffset: 11,
        endOffset: 12,
        isLinked: false
      },
      {
        text: "slowly",
        linkedText: "slowly",
        materialId: "material-2",
        startOffset: 12,
        endOffset: 18,
        isLinked: true
      }
    ]);
  });
});
