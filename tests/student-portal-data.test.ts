import fs from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as downloadMaterial } from "@/app/api/student/learning-materials/[id]/download/route";
import { GET as studentPortal } from "@/app/api/student/portal/route";
import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { studentPortalPayloadSchema } from "@/lib/student-portal/contracts";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

describe("student-portal-data", () => {
  beforeEach(async () => {
    // RATIONALE: Portal responses depend on both relational DB rows and the
    // on-disk materials store, so each scenario resets both surfaces.
    await prisma.lessonPlan.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
    await fs.rm(process.env.LEARNING_MATERIALS_LOCAL_ROOT || ".data/learning-materials-test", {
      recursive: true,
      force: true
    });
  });

  it("returns upcoming/previous appointments and material links", async () => {
    const owner = await ensureOwnerAdmin();
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Dana Student",
        email: "dana@example.com",
        phone: "0400999000",
        lessonMode: "video",
        skillLevel: "intermediate",
        unitNumber: undefined,
        houseNumber: "9",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });

    const previousBooking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "9 Main Street, Northcote VIC 3070",
        houseNumber: "9",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        startAt: new Date("2026-02-01T09:00:00.000Z"),
        endAt: new Date("2026-02-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });
    const upcomingBooking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "9 Main Street, Northcote VIC 3070",
        houseNumber: "9",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        startAt: new Date("2026-12-01T09:00:00.000Z"),
        endAt: new Date("2026-12-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });
    const previousMaterial = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: previousBooking.id,
        title: "Chord worksheet",
        description: "Chord switching worksheet",
        materialType: "pdf",
        storageKey: `${customer.id}/${previousBooking.id}/worksheet.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 18
      }
    });
    await prisma.lessonPlan.create({
      data: {
        bookingId: previousBooking.id,
        status: "complete",
        sections: [
          { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Chord changes" }] }] } },
          { key: "goals", title: "Goals", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Smoother transitions" }] }] } },
          { key: "homework", title: "Homework", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Five clean changes per day" }] }] } },
          { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Relax the strumming arm" }] }] } },
          { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep an eye on left-hand collapse" }] }] } },
        ],
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: owner.id
      }
    });
    await prisma.lessonPlan.create({
      data: {
        bookingId: upcomingBooking.id,
        status: "draft",
        sections: [
          { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", content: { type: "doc", content: [] } },
        ],
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: owner.id
      }
    });

    const storage = createMaterialStorageDriver();
    const storageKey = `${customer.id}/${upcomingBooking.id}/material.pdf`;
    await storage.put({
      storageKey,
      buffer: Buffer.from("lesson material"),
      mimeType: "application/pdf"
    });
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: upcomingBooking.id,
        title: "Scale practice",
        materialType: "pdf",
        storageKey,
        mimeType: "application/pdf",
        sizeBytes: 15
      }
    });

    const cookie = `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`;
    const portalRequest = new NextRequest("http://localhost/api/student/portal", {
      headers: {
        cookie
      }
    });
    const portalResponse = await studentPortal(portalRequest);
    expect(portalResponse.status).toBe(200);
    const payload = studentPortalPayloadSchema.parse(await portalResponse.json());
    // NOTE: The contract intentionally separates upcoming vs previous lessons so
    // the portal UI can render next actions before history/archive content.
    expect(payload.upcoming.map((row) => row.id)).toContain(upcomingBooking.id);
    expect(payload.previous.map((row) => row.id)).toContain(previousBooking.id);
    expect(payload.upcoming[0]?.materials[0]?.id).toBe(material.id);
    expect(payload.upcoming[0]?.materials[0]?.downloadUrl).toContain(`/api/student/learning-materials/${material.id}/download`);
    // Upcoming lesson plan has only an empty section — maps to null after content filtering.
    expect(payload.upcoming[0]?.lessonPlanSummary).toBeNull();
    // Previous lesson plan should include student-visible sections only.
    expect(payload.previous[0]?.lessonPlanSummary).toBeTruthy();
    const sections = payload.previous[0]?.lessonPlanSummary?.sections ?? [];
    expect(sections).toHaveLength(4);
    expect(sections.map((s: { key: string }) => s.key)).toEqual(["lessonFocus", "goals", "homework", "sharedNotes"]);
    // Teacher-only content must not leak to the student portal.
    expect(JSON.stringify(payload.previous[0]?.lessonPlanSummary || {})).not.toContain("Keep an eye on left-hand collapse");
  });

  it("shows lesson plan summary on upcoming bookings when sections have content", async () => {
    const owner = await ensureOwnerAdmin();
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Preview Student",
        email: "preview@example.com",
        phone: "0400111222",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "5",
        streetName: "Hill",
        streetType: "Road",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053"
      })
    });
    const upcomingBooking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "5 Hill Road, Carlton VIC 3053",
        houseNumber: "5",
        streetName: "Hill",
        streetType: "Road",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-12-15T09:00:00.000Z"),
        endAt: new Date("2026-12-15T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });
    await prisma.lessonPlan.create({
      data: {
        bookingId: upcomingBooking.id,
        status: "in_progress",
        sections: [
          { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Open chords" }] }] } },
          { key: "homework", title: "Homework", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Practice G to C transitions" }] }] } },
          { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Student struggles with barre chords" }] }] } },
        ],
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: owner.id
      }
    });

    const cookie = `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`;
    const response = await studentPortal(
      new NextRequest("http://localhost/api/student/portal", { headers: { cookie } })
    );
    expect(response.status).toBe(200);
    const payload = studentPortalPayloadSchema.parse(await response.json());

    expect(payload.upcoming).toHaveLength(1);
    expect(payload.upcoming[0]?.lessonPlanSummary).toBeTruthy();
    const sections = payload.upcoming[0]?.lessonPlanSummary?.sections ?? [];
    expect(sections).toHaveLength(2);
    expect(sections.map((s: { key: string }) => s.key)).toEqual(["lessonFocus", "homework"]);
    // Teacher-only content must not leak.
    expect(JSON.stringify(payload.upcoming[0]?.lessonPlanSummary || {})).not.toContain("Student struggles with barre chords");
  });

  it("streams owned learning material downloads", async () => {
    const customer = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: "Download Student",
        email: "download@example.com",
        phone: "0400222333",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "4",
        streetName: "Short",
        streetType: "Street",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056"
      })
    });
    const booking = await prisma.booking.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "4 Short Street, Brunswick VIC 3056",
        houseNumber: "4",
        streetName: "Short",
        streetType: "Street",
        suburb: "Brunswick",
        state: "VIC",
        postcode: "3056",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        startAt: new Date("2026-12-10T09:00:00.000Z"),
        endAt: new Date("2026-12-10T09:30:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id
      }
    });

    const storage = createMaterialStorageDriver();
    const storageKey = `${customer.id}/${booking.id}/warmup.mp3`;
    await storage.put({
      storageKey,
      buffer: Buffer.from("audio-bytes"),
      mimeType: "audio/mpeg"
    });
    const material = await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: booking.id,
        title: "Warmup track",
        materialType: "audio",
        storageKey,
        mimeType: "audio/mpeg",
        sizeBytes: 11
      }
    });

    const request = new NextRequest(`http://localhost/api/student/learning-materials/${material.id}/download`, {
      headers: {
        cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customer.id)}`
      }
    });
    const response = await downloadMaterial(request, {
      params: Promise.resolve({ id: material.id })
    });
    expect(response.status).toBe(200);
    // RATIONALE: These assertions guard the actual download contract that media
    // players and browser save dialogs rely on, not just route reachability.
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-disposition") || "").toContain("Warmup track");
  });
});
