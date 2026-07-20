import { describe, expect, it } from "vitest";

import {
  mapStudentPortalBooking,
  mapStudentPortalMaterial,
  mapStudentPortalPendingRequest,
  parseStudentPortalPayload,
  studentPortalPayloadSchema
} from "@/lib/student-portal/contracts";

describe("student-portal-contracts", () => {
  it("maps DB-like rows into API-safe material/booking/request payload shapes", () => {
    const material = mapStudentPortalMaterial({
      id: "mat_1",
      title: "Arpeggio Sheet",
      description: null,
      materialType: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      folderId: null,
      sortOrder: 0,
      createdAt: new Date("2026-03-01T10:00:00.000Z")
    });
    expect(material.downloadUrl).toBe("/api/student/learning-materials/mat_1/download");

    const imageMaterial = mapStudentPortalMaterial({
      id: "mat_2",
      title: "Scale Diagram",
      description: "Major scale positions",
      materialType: "image",
      mimeType: "image/png",
      sizeBytes: 1024,
      folderId: null,
      sortOrder: 0,
      createdAt: new Date("2026-03-05T10:00:00.000Z")
    });
    expect(imageMaterial.materialType).toBe("image");
    expect(imageMaterial.previewUrl).toBe("/api/student/learning-materials/mat_2/download?disposition=inline");

    const booking = mapStudentPortalBooking({
      id: "book_1",
      status: "approved",
      lessonMode: "video",
      skillLevel: "intermediate",
      lessonDuration: "min60",
      customDurationMinutes: null,
      startAt: new Date("2026-04-01T08:00:00.000Z"),
      endAt: new Date("2026-04-01T09:00:00.000Z"),
      notes: "Focus on rhythm consistency.",
      notesContent: null,
      attendanceStatus: "no_show",
      learningMaterials: [
        {
          id: "mat_1",
          title: "Arpeggio Sheet",
          description: null,
          materialType: "pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          folderId: null,
          sortOrder: 0,
          createdAt: new Date("2026-03-01T10:00:00.000Z")
        }
      ]
    });
    // NOTE: Booking mapping also recursively normalizes nested materials, which
    // is why this test asserts the derived materials array rather than only top-level fields.
    expect(booking.materials).toHaveLength(1);
    expect(booking.lessonPlanSummary).toBeNull();
    expect(booking.attendanceStatus).toBe("no_show");

    const pendingRequest = mapStudentPortalPendingRequest({
      id: "req_1",
      requestedStartAt: new Date("2026-04-10T07:30:00.000Z"),
      lessonMode: "in_person",
      lessonDuration: "min30",
      customDurationMinutes: null,
      status: "pending"
    });
    expect(pendingRequest.status).toBe("pending");
  });

  it("parses valid payloads and rejects invalid booking status values", () => {
    const payload = parseStudentPortalPayload({
      student: {
        id: "cus_1",
        fullName: "Jamie Student",
        postcode: "3000"
      },
      now: "2026-03-04T01:00:00.000Z",
      upcoming: [],
      previous: [],
      standaloneMaterials: [],
      folders: [],
      pendingRequests: []
    });
    expect(payload.student.fullName).toBe("Jamie Student");

    const invalid = studentPortalPayloadSchema.safeParse({
      student: {
        id: "cus_1",
        fullName: "Jamie Student",
        postcode: "3000"
      },
      now: "2026-03-04T01:00:00.000Z",
      upcoming: [
        {
          id: "book_1",
          status: "pending",
          lessonMode: "video",
          skillLevel: "beginner",
          lessonDuration: "min60",
          customDurationMinutes: null,
          startAt: "2026-03-10T08:00:00.000Z",
          endAt: "2026-03-10T09:00:00.000Z",
          notes: null,
          lessonPlanSummary: null,
          materials: []
        }
      ],
      previous: [],
      standaloneMaterials: [],
      folders: [],
      pendingRequests: []
    });
    // RATIONALE: Upcoming bookings must already be confirmed/cancelled/etc.;
    // "pending" belongs to the separate pendingRequests collection.
    expect(invalid.success).toBe(false);
  });

  it("parses a payload with a guitar_pro item assigned by teacher (AC-I2)", () => {
    // P1 guard: parseStudentPortalPayload runs over the WHOLE portal payload, so
    // a materialType the enum doesn't know would dead-page the portal the moment
    // a Guitar Pro library item is assigned to any student.
    const payload = parseStudentPortalPayload({
      student: {
        id: "cus_1",
        fullName: "Jamie Student",
        postcode: "3000"
      },
      now: "2026-07-16T01:00:00.000Z",
      upcoming: [],
      previous: [],
      standaloneMaterials: [],
      folders: [],
      assignedByTeacher: [
        {
          id: "lib_1",
          title: "Sweet Child O Mine",
          description: null,
          materialType: "guitar_pro",
          mimeType: "application/octet-stream",
          sizeBytes: 40960,
          folderId: "folder-9",
          sortOrder: 7,
          createdAt: "2026-07-15T10:00:00.000Z",
          downloadUrl: "/api/student/library/lib_1/download",
          previewUrl: "/api/student/library/lib_1/download?disposition=inline",
          tags: [{ category: "Style", value: "Rock" }]
        }
      ],
      pendingRequests: []
    });
    expect(payload.assignedByTeacher).toHaveLength(1);
    expect(payload.assignedByTeacher?.[0]?.materialType).toBe("guitar_pro");
    // Non-zero on purpose: `null`/`0` would pass equally if the schema carried
    // the `.default()` these fields deliberately do NOT have.
    expect(payload.assignedByTeacher?.[0]?.folderId).toBe("folder-9");
    expect(payload.assignedByTeacher?.[0]?.sortOrder).toBe(7);
  });
});
