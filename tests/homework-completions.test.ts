import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as toggleCompletion } from "@/app/api/student/homework/[lessonPlanId]/[checklistItemId]/route";
import { GET as getCompletions } from "@/app/api/student/homework/[lessonPlanId]/route";
import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import {
  createStudentSessionToken,
  getStudentSessionCookieName,
} from "@/lib/student-portal/session";

const BASE_URL = "http://localhost:3000";

function studentRequest(path: string, token: string, method = "GET") {
  return new NextRequest(`${BASE_URL}${path}`, {
    method,
    headers: { cookie: `${getStudentSessionCookieName()}=${token}` },
  });
}

describe("homework-completions", () => {
  beforeEach(async () => {
    await prisma.homeworkCompletion.deleteMany();
    await prisma.lessonPlanMaterialLink.deleteMany();
    await prisma.lessonPlan.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("toggles homework completion on and off", async () => {
    const owner = await ensureOwnerAdmin();
    const customer = await prisma.customer.create({
      data: {
        fullName: "Test Student",
        firstName: "Test",
        lastName: "Student",
        email: "student@test.com",
        phone: "0400000000",
        normalizedEmail: "student@test.com",
        normalizedPhone: "0400000000",
      },
    });

    const booking = await prisma.booking.create({
      data: {
        name: "Test Student",
        email: "student@test.com",
        phone: "0400000000",
        address: "1 Test St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-02-01T09:00:00.000Z"),
        endAt: new Date("2026-02-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
      },
    });

    // Create a lesson plan with V2 sections containing a checklist.
    const plan = await prisma.lessonPlan.create({
      data: {
        bookingId: booking.id,
        status: "complete",
        sections: [
          {
            key: "homework",
            title: "Homework",
            visibility: "student_visible",
            content: {
              type: "doc",
              content: [
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: false, itemId: "hw_test_item_001" },
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            { type: "text", text: "Practice C major scale" },
                          ],
                        },
                      ],
                    },
                    {
                      type: "taskItem",
                      attrs: { checked: false, itemId: "hw_test_item_002" },
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            { type: "text", text: "Learn Horse With No Name" },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: owner.id,
      },
    });

    const token = createStudentSessionToken(customer.id);
    const itemId = "hw_test_item_001";

    // ── Toggle ON ──
    const toggleOnRes = await toggleCompletion(
      studentRequest(`/api/student/homework/${plan.id}/${itemId}`, token, "POST"),
      { params: Promise.resolve({ lessonPlanId: plan.id, checklistItemId: itemId }) }
    );
    expect(toggleOnRes.status).toBe(200);
    const toggleOnBody = await toggleOnRes.json();
    expect(toggleOnBody.ok).toBe(true);
    expect(toggleOnBody.completed).toBe(true);
    expect(toggleOnBody.completedAt).toBeTruthy();

    // ── GET completions ──
    const getRes = await getCompletions(
      studentRequest(`/api/student/homework/${plan.id}`, token),
      { params: Promise.resolve({ lessonPlanId: plan.id }) }
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.completions).toHaveLength(1);
    expect(getBody.completions[0].checklistItemId).toBe(itemId);

    // ── Toggle OFF ──
    const toggleOffRes = await toggleCompletion(
      studentRequest(`/api/student/homework/${plan.id}/${itemId}`, token, "POST"),
      { params: Promise.resolve({ lessonPlanId: plan.id, checklistItemId: itemId }) }
    );
    expect(toggleOffRes.status).toBe(200);
    const toggleOffBody = await toggleOffRes.json();
    expect(toggleOffBody.ok).toBe(true);
    expect(toggleOffBody.completed).toBe(false);

    // ── Verify empty ──
    const getRes2 = await getCompletions(
      studentRequest(`/api/student/homework/${plan.id}`, token),
      { params: Promise.resolve({ lessonPlanId: plan.id }) }
    );
    const getBody2 = await getRes2.json();
    expect(getBody2.completions).toHaveLength(0);
  });

  it("rejects homework toggle for a different student's plan", async () => {
    const owner = await ensureOwnerAdmin();
    const student1 = await prisma.customer.create({
      data: {
        fullName: "Student One",
        firstName: "Student",
        lastName: "One",
        email: "one@test.com",
        phone: "0400000001",
        normalizedEmail: "one@test.com",
        normalizedPhone: "0400000001",
      },
    });
    const student2 = await prisma.customer.create({
      data: {
        fullName: "Student Two",
        firstName: "Student",
        lastName: "Two",
        email: "two@test.com",
        phone: "0400000002",
        normalizedEmail: "two@test.com",
        normalizedPhone: "0400000002",
      },
    });

    const booking = await prisma.booking.create({
      data: {
        name: "Student One",
        email: "one@test.com",
        phone: "0400000001",
        address: "1 Test St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2026-02-01T09:00:00.000Z"),
        endAt: new Date("2026-02-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: student1.id,
      },
    });

    const plan = await prisma.lessonPlan.create({
      data: {
        bookingId: booking.id,
        status: "complete",
        sections: [],
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: owner.id,
      },
    });

    // Student 2 tries to toggle student 1's homework.
    const token2 = createStudentSessionToken(student2.id);
    const res = await toggleCompletion(
      studentRequest(`/api/student/homework/${plan.id}/hw_item`, token2, "POST"),
      { params: Promise.resolve({ lessonPlanId: plan.id, checklistItemId: "hw_item" }) }
    );
    expect(res.status).toBe(403);
  });

  it("rejects homework toggle for a future lesson", async () => {
    const owner = await ensureOwnerAdmin();
    const customer = await prisma.customer.create({
      data: {
        fullName: "Future Student",
        firstName: "Future",
        lastName: "Student",
        email: "future@test.com",
        phone: "0400000003",
        normalizedEmail: "future@test.com",
        normalizedPhone: "0400000003",
      },
    });

    const futureBooking = await prisma.booking.create({
      data: {
        name: "Future Student",
        email: "future@test.com",
        phone: "0400000003",
        address: "1 Test St",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: new Date("2099-12-01T09:00:00.000Z"),
        endAt: new Date("2099-12-01T10:00:00.000Z"),
        timezone: "Australia/Melbourne",
        customerId: customer.id,
      },
    });

    const plan = await prisma.lessonPlan.create({
      data: {
        bookingId: futureBooking.id,
        status: "complete",
        sections: [],
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
        createdById: owner.id,
      },
    });

    const token = createStudentSessionToken(customer.id);
    const res = await toggleCompletion(
      studentRequest(`/api/student/homework/${plan.id}/hw_item`, token, "POST"),
      { params: Promise.resolve({ lessonPlanId: plan.id, checklistItemId: "hw_item" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("after the lesson");
  });
});
