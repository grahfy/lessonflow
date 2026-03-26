import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { DELETE as clearBookingLessonPlan, GET as getBookingLessonPlan, PUT as saveBookingLessonPlan } from "@/app/api/admin/bookings/[id]/lesson-plan/route";
import { DELETE as archiveLessonPlanTemplate, PATCH as updateLessonPlanTemplate } from "@/app/api/admin/lesson-plan-templates/[id]/route";
import { GET as listLessonPlanTemplates, POST as createLessonPlanTemplate } from "@/app/api/admin/lesson-plan-templates/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminJsonRequest(url: string, token: string, init?: { method?: string; body?: Record<string, unknown> }) {
  return new NextRequest(url, {
    method: init?.method || "GET",
    body: init?.body ? JSON.stringify(init.body) : undefined,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

async function createTeacher(email: string, displayName: string) {
  return prisma.adminUser.create({
    data: {
      email,
      role: "teacher",
      firstName: displayName,
      displayName,
      passwordHash: await bcrypt.hash("TeacherPass!234", 12),
      isActive: true
    }
  });
}

async function createAssignedBooking(assignedTeacherId: string) {
  return prisma.booking.create({
    data: {
      name: "Lesson Student",
      email: "lesson-student@example.com",
      phone: "0400111222",
      address: "10 Hope Street, Thornbury VIC 3071",
      houseNumber: "10",
      streetName: "Hope",
      streetType: "Street",
      suburb: "Thornbury",
      state: "VIC",
      postcode: "3071",
      lessonMode: "video",
      skillLevel: "intermediate",
      lessonDuration: "min60",
      startAt: new Date("2026-05-01T09:00:00.000Z"),
      endAt: new Date("2026-05-01T10:00:00.000Z"),
      timezone: "Australia/Melbourne",
      assignedTeacherId
    }
  });
}

const testSections = [
  { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Chord switching" }] }] } },
  { key: "goals", title: "Goals", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Improve transitions" }] }] } },
  { key: "activities", title: "Activities", visibility: "teacher_only", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Two-chord drill" }] }] } },
  { key: "homework", title: "Homework", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Daily two-chord drill" }] }] } },
  { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep tempo slow" }] }] } },
  { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Watch ring finger" }] }] } },
];

describe("admin-lesson-plans", () => {
  beforeEach(async () => {
    await prisma.lessonPlan.deleteMany();
    await prisma.lessonPlanTemplate.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("creates, updates, and archives lesson-plan templates", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const createResponse = await createLessonPlanTemplate(
      adminJsonRequest("http://localhost/api/admin/lesson-plan-templates", token, {
        method: "POST",
        body: {
          title: "Beginner Guitar Reset",
          description: "Warmups and fretboard orientation",
          category: "technique",
          sections: testSections
        }
      })
    );
    expect(createResponse.status).toBe(200);
    const createBody = (await createResponse.json()) as {
      template: {
        id: string;
        title: string;
        category: string;
        sections: unknown[];
      };
    };
    expect(createBody.template.title).toBe("Beginner Guitar Reset");
    expect(createBody.template.category).toBe("technique");
    expect(createBody.template.sections).toHaveLength(6);

    const updatedSections = testSections.map((s) =>
      s.key === "lessonFocus"
        ? { ...s, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Posture and fretting" }] }] } }
        : s
    );

    const updateResponse = await updateLessonPlanTemplate(
      adminJsonRequest(`http://localhost/api/admin/lesson-plan-templates/${createBody.template.id}`, token, {
        method: "PATCH",
        body: {
          title: "Beginner Guitar Reset",
          description: "Updated description",
          category: "technique",
          sections: updatedSections
        }
      }),
      { params: Promise.resolve({ id: createBody.template.id }) }
    );
    expect(updateResponse.status).toBe(200);

    const listResponse = await listLessonPlanTemplates(adminJsonRequest("http://localhost/api/admin/lesson-plan-templates", token));
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      templates: Array<{ id: string; description: string; title: string; category: string }>;
    };
    expect(listBody.templates).toHaveLength(1);
    expect(listBody.templates[0]).toMatchObject({
      id: createBody.template.id,
      description: "Updated description",
      title: "Beginner Guitar Reset",
      category: "technique"
    });

    const archiveResponse = await archiveLessonPlanTemplate(
      adminJsonRequest(`http://localhost/api/admin/lesson-plan-templates/${createBody.template.id}`, token, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: createBody.template.id }) }
    );
    expect(archiveResponse.status).toBe(200);

    const emptyListResponse = await listLessonPlanTemplates(adminJsonRequest("http://localhost/api/admin/lesson-plan-templates", token));
    const emptyListBody = (await emptyListResponse.json()) as { templates: unknown[] };
    expect(emptyListBody.templates).toEqual([]);
  });

  it("blocks a teacher from editing another teacher's template", async () => {
    await ensureOwnerAdmin();
    const templateOwner = await createTeacher("template-owner@example.com", "Template Owner");
    const otherTeacher = await createTeacher("other-teacher@example.com", "Other Teacher");
    const ownerToken = createSessionToken(templateOwner.email);
    const otherToken = createSessionToken(otherTeacher.email);

    const createResponse = await createLessonPlanTemplate(
      adminJsonRequest("http://localhost/api/admin/lesson-plan-templates", ownerToken, {
        method: "POST",
        body: {
          title: "Teacher Template",
          description: "",
          category: "general",
          sections: testSections
        }
      })
    );
    const createBody = (await createResponse.json()) as { template: { id: string } };

    const response = await updateLessonPlanTemplate(
      adminJsonRequest(`http://localhost/api/admin/lesson-plan-templates/${createBody.template.id}`, otherToken, {
        method: "PATCH",
        body: {
          title: "Teacher Template",
          description: "Illegal update",
          category: "general",
          sections: testSections
        }
      }),
      { params: Promise.resolve({ id: createBody.template.id }) }
    );

    expect(response.status).toBe(403);
  });

  it("allows the owner to edit any teacher template", async () => {
    const owner = await ensureOwnerAdmin();
    const teacher = await createTeacher("template-teacher@example.com", "Template Teacher");
    const ownerToken = createSessionToken(owner.email);
    const teacherToken = createSessionToken(teacher.email);

    const createResponse = await createLessonPlanTemplate(
      adminJsonRequest("http://localhost/api/admin/lesson-plan-templates", teacherToken, {
        method: "POST",
        body: {
          title: "Teacher Owned Template",
          description: "",
          category: "general",
          sections: testSections
        }
      })
    );
    const createBody = (await createResponse.json()) as { template: { id: string } };

    const updatedSections = testSections.map((s) =>
      s.key === "lessonFocus"
        ? { ...s, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Updated focus" }] }] } }
        : s
    );

    const response = await updateLessonPlanTemplate(
      adminJsonRequest(`http://localhost/api/admin/lesson-plan-templates/${createBody.template.id}`, ownerToken, {
        method: "PATCH",
        body: {
          title: "Teacher Owned Template",
          description: "Owner update",
          category: "general",
          sections: updatedSections
        }
      }),
      { params: Promise.resolve({ id: createBody.template.id }) }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      template: {
        description: string;
        sections: Array<{ key: string; content: { type: string; content: Array<{ content: Array<{ text: string }> }> } }>;
      };
    };
    expect(body.template.description).toBe("Owner update");
    const focusSection = body.template.sections.find((s) => s.key === "lessonFocus");
    expect(focusSection?.content.content[0]?.content[0]?.text).toBe("Updated focus");
  });

  it("saves a booking lesson plan for the assigned teacher and blocks other teachers", async () => {
    await ensureOwnerAdmin();
    const assignedTeacher = await createTeacher("assigned-teacher@example.com", "Assigned Teacher");
    const otherTeacher = await createTeacher("other-booking-teacher@example.com", "Other Booking Teacher");
    const assignedToken = createSessionToken(assignedTeacher.email);
    const otherToken = createSessionToken(otherTeacher.email);

    const booking = await createAssignedBooking(assignedTeacher.id);
    const template = await prisma.lessonPlanTemplate.create({
      data: {
        title: "Picked Template",
        description: null,
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        sections: JSON.parse(JSON.stringify(testSections)),
        category: "technique",
        createdById: assignedTeacher.id,
        updatedById: assignedTeacher.id
      }
    });

    const saveResponse = await saveBookingLessonPlan(
      adminJsonRequest(`http://localhost/api/admin/bookings/${booking.id}/lesson-plan`, assignedToken, {
        method: "PUT",
        body: {
          sourceTemplateId: template.id,
          status: "in_progress",
          sections: testSections
        }
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(saveResponse.status).toBe(200);
    const saveBody = (await saveResponse.json()) as {
      lessonPlan: {
        bookingId: string;
        sourceTemplateId: string | null;
        sourceTemplateTitle: string | null;
        status: string;
        sections: unknown[];
      };
    };
    expect(saveBody.lessonPlan).toMatchObject({
      bookingId: booking.id,
      sourceTemplateId: template.id,
      sourceTemplateTitle: "Picked Template",
      status: "in_progress"
    });
    expect(saveBody.lessonPlan.sections).toHaveLength(6);

    const loadResponse = await getBookingLessonPlan(
      adminJsonRequest(`http://localhost/api/admin/bookings/${booking.id}/lesson-plan`, assignedToken),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(loadResponse.status).toBe(200);
    const loadBody = (await loadResponse.json()) as {
      lessonPlan: {
        id: string;
        bookingId: string;
        status: string;
        sections: unknown[];
      } | null;
    };
    expect(loadBody.lessonPlan).toBeTruthy();
    expect(loadBody.lessonPlan?.bookingId).toBe(booking.id);
    expect(loadBody.lessonPlan?.status).toBe("in_progress");
    expect(loadBody.lessonPlan?.sections).toHaveLength(6);

    const forbiddenResponse = await saveBookingLessonPlan(
      adminJsonRequest(`http://localhost/api/admin/bookings/${booking.id}/lesson-plan`, otherToken, {
        method: "PUT",
        body: {
          status: "in_progress",
          sections: testSections
        }
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(forbiddenResponse.status).toBe(403);
  });

  it("clears a saved booking lesson plan for the assigned teacher", async () => {
    await ensureOwnerAdmin();
    const assignedTeacher = await createTeacher("clear-booking-teacher@example.com", "Clear Booking Teacher");
    const assignedToken = createSessionToken(assignedTeacher.email);

    const booking = await createAssignedBooking(assignedTeacher.id);
    await prisma.lessonPlan.create({
      data: {
        bookingId: booking.id,
        status: "in_progress",
        sections: JSON.parse(JSON.stringify(testSections)),
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: assignedTeacher.id,
        updatedById: assignedTeacher.id
      }
    });

    const clearResponse = await clearBookingLessonPlan(
      adminJsonRequest(`http://localhost/api/admin/bookings/${booking.id}/lesson-plan`, assignedToken, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(clearResponse.status).toBe(200);

    const loadResponse = await getBookingLessonPlan(
      adminJsonRequest(`http://localhost/api/admin/bookings/${booking.id}/lesson-plan`, assignedToken),
      { params: Promise.resolve({ id: booking.id }) }
    );
    const loadBody = (await loadResponse.json()) as { lessonPlan: null };
    expect(loadBody.lessonPlan).toBeNull();
  });
});
