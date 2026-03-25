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
      learningMaterials: [
        {
          id: "mat_1",
          title: "Arpeggio Sheet",
          description: null,
          materialType: "pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          createdAt: new Date("2026-03-01T10:00:00.000Z")
        }
      ]
    });
    // NOTE: Booking mapping also recursively normalizes nested materials, which
    // is why this test asserts the derived materials array rather than only top-level fields.
    expect(booking.materials).toHaveLength(1);
    expect(booking.lessonPlanSummary).toBeNull();

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
      pendingRequests: []
    });
    // RATIONALE: Upcoming bookings must already be confirmed/cancelled/etc.;
    // "pending" belongs to the separate pendingRequests collection.
    expect(invalid.success).toBe(false);
  });
});
