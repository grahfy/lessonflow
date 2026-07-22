import bcrypt from "bcryptjs";
import { addDays, addMinutes } from "date-fns";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as getBookingSlots } from "@/app/api/student/booking-slots/route";
import { POST as createStudentBooking } from "@/app/api/student/bookings/route";
import { saveBusinessHours } from "@/lib/booking/business-hours";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";
import { APP_TIMEZONE, dateTimeLocalToDate, toDateKey } from "@/lib/time";

/**
 * Every weekday open 09:00–17:00 on a 30-minute grid with 24 hours' notice, so
 * the fixtures never have to care which weekday the suite happens to run on.
 */
const OPEN_DAY = { isOpen: true, openMinute: 9 * 60, closeMinute: 17 * 60 };

/** Three days out clears the 24-hour notice window from any run time. */
const TARGET_DATE = toDateKey(addDays(new Date(), 3), APP_TIMEZONE);

/** Wall-clock time on the target day, as the UTC instant the API deals in. */
function slotAt(time: string): Date {
  const instant = dateTimeLocalToDate(`${TARGET_DATE}T${time}`, APP_TIMEZONE);
  if (!instant) {
    throw new Error(`${TARGET_DATE}T${time} does not exist in ${APP_TIMEZONE}.`);
  }
  return instant;
}

function slotsRequest(params: Record<string, string>, customerId?: string) {
  const url = new URL("http://localhost/api/student/booking-slots");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, {
    headers: customerId
      ? { cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customerId)}` }
      : undefined
  });
}

function bookingRequest(body: Record<string, unknown>, customerId: string) {
  return new NextRequest("http://localhost/api/student/bookings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customerId)}`
    }
  });
}

async function createTeacher(email: string, displayName: string) {
  return prisma.adminUser.create({
    data: {
      email,
      role: "teacher",
      displayName,
      passwordHash: await bcrypt.hash("teacher-password", 4),
      isActive: true
    }
  });
}

async function createStudent(email: string, primaryTeacherId: string | null) {
  return prisma.customer.create({
    data: {
      ...customerSnapshotFromInput({
        firstName: "Slot",
        lastName: "Student",
        name: "Slot Student",
        email,
        phone: "0400111222",
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "7",
        streetName: "Union",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }),
      primaryTeacherId
    }
  });
}

async function createBookingFor(teacherId: string, startAt: Date, durationMinutes: number, status: "approved" | "cancelled" = "approved") {
  return prisma.booking.create({
    data: {
      name: "Existing Student",
      email: "existing@example.com",
      phone: "0400999888",
      address: "1 Other Street, Northcote VIC 3070",
      houseNumber: "1",
      streetName: "Other",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: durationMinutes === 30 ? "min30" : "min60",
      startAt,
      endAt: addMinutes(startAt, durationMinutes),
      timezone: APP_TIMEZONE,
      status,
      assignedTeacherId: teacherId
    }
  });
}

describe("student-booking-slots", () => {
  beforeEach(async () => {
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
    await prisma.outboundEmail.deleteMany();
    // POST runs the public geoblocking policy. Another suite leaving a
    // restrictive singleton behind turns every request here into a 403, so
    // reset it to the permissive default like the rest of this suite's state.
    await prisma.geoblockingSettings.deleteMany();
    // Pricing rows leak between suites and drive `durationOptions`, so this
    // suite owns its own set rather than inheriting whatever is left over.
    await prisma.lessonPricingOption.deleteMany();
    await prisma.lessonPricingOption.createMany({
      data: [
        { durationMinutes: 30, priceCents: 5000, isActive: true, sortOrder: 0 },
        { durationMinutes: 60, priceCents: 9000, isActive: true, sortOrder: 1 },
        { durationMinutes: 90, priceCents: 13000, isActive: false, sortOrder: 2 }
      ]
    });
    await saveBusinessHours({
      weekdays: Array.from({ length: 7 }, () => ({ ...OPEN_DAY })),
      slotGranularityMinutes: 30,
      minimumNoticeHours: 24
    });
  });

  // Both singletons are read by other suites; don't leave this suite's
  // all-days-open config or pricing set behind for them to inherit.
  afterAll(async () => {
    await prisma.businessHours.deleteMany();
    await prisma.lessonPricingOption.deleteMany();
  });

  it("rejects an unauthenticated slot request", async () => {
    const response = await getBookingSlots(slotsRequest({ date: TARGET_DATE }));
    expect(response.status).toBe(401);
  });

  it("returns the assigned teacher's slots inside business hours (AC-46, AC-48)", async () => {
    const teacher = await createTeacher("slots.teacher@example.com", "Slot Teacher");
    const student = await createStudent("slots.student@example.com", teacher.id);

    const response = await getBookingSlots(
      slotsRequest({ date: TARGET_DATE, durationMinutes: "60" }, student.id)
    );
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.teacher).toEqual({ id: teacher.id, name: "Slot Teacher" });
    // 09:00–17:00 on a 30-minute grid, last 60-minute lesson starting at 16:00.
    expect(payload.slots).toHaveLength(15);
    expect(payload.slots[0].startAt).toBe(slotAt("09:00").toISOString());
    expect(payload.slots[0].endAt).toBe(slotAt("10:00").toISOString());
    expect(payload.slots.at(-1).startAt).toBe(slotAt("16:00").toISOString());
  });

  it("omits slots overlapping an existing booking but keeps cancelled ones bookable (AC-48)", async () => {
    const teacher = await createTeacher("busy.teacher@example.com", "Busy Teacher");
    const student = await createStudent("busy.student@example.com", teacher.id);
    await createBookingFor(teacher.id, slotAt("10:00"), 60);
    await createBookingFor(teacher.id, slotAt("14:00"), 60, "cancelled");

    const response = await getBookingSlots(
      slotsRequest({ date: TARGET_DATE, durationMinutes: "60" }, student.id)
    );
    const starts: string[] = (await response.json()).slots.map(
      (slot: { startAt: string }) => slot.startAt
    );

    // A 60-minute lesson spans two grid cells, so 09:30 and 10:30 collide too.
    expect(starts).not.toContain(slotAt("09:30").toISOString());
    expect(starts).not.toContain(slotAt("10:00").toISOString());
    expect(starts).not.toContain(slotAt("10:30").toISOString());
    // Back-to-back is legal: the slot starting exactly when the lesson ends.
    expect(starts).toContain(slotAt("11:00").toISOString());
    // Cancelled lessons free their time back up.
    expect(starts).toContain(slotAt("14:00").toISOString());
  });

  it("ignores another teacher's bookings (AC-46)", async () => {
    const teacher = await createTeacher("mine.teacher@example.com", "My Teacher");
    const otherTeacher = await createTeacher("other.teacher@example.com", "Other Teacher");
    const student = await createStudent("mine.student@example.com", teacher.id);
    await createBookingFor(otherTeacher.id, slotAt("10:00"), 60);

    const response = await getBookingSlots(
      slotsRequest({ date: TARGET_DATE, durationMinutes: "60" }, student.id)
    );
    const starts: string[] = (await response.json()).slots.map(
      (slot: { startAt: string }) => slot.startAt
    );
    expect(starts).toContain(slotAt("10:00").toISOString());
  });

  it("returns a null teacher and no slots when the student has no assigned teacher (AC-47)", async () => {
    await createTeacher("unused.teacher@example.com", "Unused Teacher");
    const student = await createStudent("unassigned.student@example.com", null);

    const response = await getBookingSlots(
      slotsRequest({ date: TARGET_DATE, durationMinutes: "60" }, student.id)
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.teacher).toBeNull();
    expect(payload.slots).toEqual([]);
    // The duration options still come back so the UI renders a complete form.
    expect(payload.durationOptions).toEqual([30, 60]);
  });

  it("offers only active lesson pricing durations (AC-52)", async () => {
    const teacher = await createTeacher("pricing.teacher@example.com", "Pricing Teacher");
    const student = await createStudent("pricing.student@example.com", teacher.id);

    const response = await getBookingSlots(
      slotsRequest({ date: TARGET_DATE }, student.id)
    );
    const payload = await response.json();
    expect(payload.durationOptions).toEqual([30, 60]);

    const rejected = await getBookingSlots(
      slotsRequest({ date: TARGET_DATE, durationMinutes: "90" }, student.id)
    );
    expect(rejected.status).toBe(400);
  });

  it("honours the configured minimum notice rather than a constant (AC-51)", async () => {
    const teacher = await createTeacher("notice.teacher@example.com", "Notice Teacher");
    const student = await createStudent("notice.student@example.com", teacher.id);
    await saveBusinessHours({
      weekdays: Array.from({ length: 7 }, () => ({ ...OPEN_DAY })),
      slotGranularityMinutes: 30,
      // Four days' notice pushes the whole target day out of reach.
      minimumNoticeHours: 24 * 4
    });

    const response = await getBookingSlots(
      slotsRequest({ date: TARGET_DATE, durationMinutes: "60" }, student.id)
    );
    expect((await response.json()).slots).toEqual([]);
  });

  it("rejects a malformed date", async () => {
    const student = await createStudent("baddate.student@example.com", null);
    const response = await getBookingSlots(slotsRequest({ date: "next tuesday" }, student.id));
    expect(response.status).toBe(400);
  });

  it("creates a pending request for an offered slot (AC-53)", async () => {
    const teacher = await createTeacher("book.teacher@example.com", "Book Teacher");
    const student = await createStudent("book.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:00").toISOString(), lessonDuration: "min60" },
        student.id
      )
    );
    expect(response.status).toBe(201);

    const created = await prisma.bookingRequest.findFirstOrThrow({
      where: { customerId: student.id }
    });
    // AC-53: still a request awaiting owner approval, never a confirmed Booking.
    expect(created.status).toBe("pending");
    expect(created.assignedTeacherId).toBe(teacher.id);
    expect(await prisma.booking.count()).toBe(0);
  });

  it("honours durationMinutes instead of silently defaulting to 60", async () => {
    const teacher = await createTeacher("duration.teacher@example.com", "Duration Teacher");
    const student = await createStudent("duration.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:00").toISOString(), durationMinutes: 30 },
        student.id
      )
    );
    expect(response.status).toBe(201);

    const created = await prisma.bookingRequest.findFirstOrThrow({
      where: { customerId: student.id }
    });
    // The bug this guards: zod stripped the unknown key and `lessonDuration`
    // fell through to its "min60" default, so a 30-minute pick was stored (and
    // later billed) as an hour.
    expect(created.lessonDuration).toBe("min30");
    expect(created.customDurationMinutes).toBeNull();
  });

  it("encodes a non-enum durationMinutes through customDurationMinutes", async () => {
    const teacher = await createTeacher("custom.teacher@example.com", "Custom Teacher");
    const student = await createStudent("custom.student@example.com", teacher.id);
    await prisma.lessonPricingOption.create({
      data: { durationMinutes: 45, priceCents: 7000, isActive: true, sortOrder: 3 }
    });

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:00").toISOString(), durationMinutes: 45 },
        student.id
      )
    );
    expect(response.status).toBe(201);

    const created = await prisma.bookingRequest.findFirstOrThrow({
      where: { customerId: student.id }
    });
    expect(created.customDurationMinutes).toBe(45);
  });

  it("rejects a durationMinutes the school does not sell", async () => {
    const teacher = await createTeacher("unsold.teacher@example.com", "Unsold Teacher");
    const student = await createStudent("unsold.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        // 90 minutes exists as a pricing row but is inactive.
        { requestedStartAt: slotAt("11:00").toISOString(), durationMinutes: 90 },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);
  });

  it("rejects a durationMinutes that contradicts a legacy lessonDuration", async () => {
    const teacher = await createTeacher("conflict.teacher@example.com", "Conflict Teacher");
    const student = await createStudent("conflict.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        {
          requestedStartAt: slotAt("11:00").toISOString(),
          durationMinutes: 30,
          lessonDuration: "min60"
        },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);
  });

  it("accepts durationMinutes agreeing with an explicit legacy lessonDuration", async () => {
    const teacher = await createTeacher("agree.teacher@example.com", "Agree Teacher");
    const student = await createStudent("agree.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        {
          requestedStartAt: slotAt("11:00").toISOString(),
          durationMinutes: 30,
          lessonDuration: "min30"
        },
        student.id
      )
    );
    expect(response.status).toBe(201);
  });

  it("still honours a legacy payload with no durationMinutes", async () => {
    const teacher = await createTeacher("legacy.teacher@example.com", "Legacy Teacher");
    const student = await createStudent("legacy.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:00").toISOString(), lessonDuration: "min30" },
        student.id
      )
    );
    expect(response.status).toBe(201);

    const created = await prisma.bookingRequest.findFirstOrThrow({
      where: { customerId: student.id }
    });
    expect(created.lessonDuration).toBe("min30");
  });

  it("rejects a time outside business hours (AC-61)", async () => {
    const teacher = await createTeacher("night.teacher@example.com", "Night Teacher");
    const student = await createStudent("night.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("03:00").toISOString(), lessonDuration: "min60" },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);
  });

  it("rejects a time off the slot grid (AC-61)", async () => {
    const teacher = await createTeacher("offgrid.teacher@example.com", "Offgrid Teacher");
    const student = await createStudent("offgrid.student@example.com", teacher.id);

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:07").toISOString(), lessonDuration: "min60" },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);
  });

  it("rejects a time inside the minimum-notice window (AC-61)", async () => {
    const teacher = await createTeacher("soon.teacher@example.com", "Soon Teacher");
    const student = await createStudent("soon.student@example.com", teacher.id);
    await saveBusinessHours({
      weekdays: Array.from({ length: 7 }, () => ({ ...OPEN_DAY })),
      slotGranularityMinutes: 30,
      minimumNoticeHours: 24 * 4
    });

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:00").toISOString(), lessonDuration: "min60" },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);
  });

  it("rejects a slot already taken on the assigned teacher's calendar (AC-61)", async () => {
    const teacher = await createTeacher("taken.teacher@example.com", "Taken Teacher");
    const student = await createStudent("taken.student@example.com", teacher.id);
    await createBookingFor(teacher.id, slotAt("11:00"), 60);

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:00").toISOString(), lessonDuration: "min60" },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);
  });

  it("validates the calendar of the teacher it actually assigns after a deactivation", async () => {
    // The owner deactivates a departing teacher without reassigning their
    // students, so `primaryTeacherId` still points at the inactive one while
    // `resolveAutoAssignedTeacherId` falls back to the remaining teacher.
    const departed = await createTeacher("departed.teacher@example.com", "Departed Teacher");
    const remaining = await createTeacher("remaining.teacher@example.com", "Remaining Teacher");
    const student = await createStudent("stale.student@example.com", departed.id);
    await prisma.adminUser.update({ where: { id: departed.id }, data: { isActive: false } });

    // Free on the departed teacher's calendar, busy on the one that gets assigned.
    await createBookingFor(remaining.id, slotAt("11:00"), 60);

    const response = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("11:00").toISOString(), durationMinutes: 60 },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);

    // A slot free on the assigned teacher's calendar still goes through, and
    // lands on that same teacher.
    const accepted = await createStudentBooking(
      bookingRequest(
        { requestedStartAt: slotAt("13:00").toISOString(), durationMinutes: 60 },
        student.id
      )
    );
    expect(accepted.status).toBe(201);
    const created = await prisma.bookingRequest.findFirstOrThrow({
      where: { customerId: student.id }
    });
    expect(created.assignedTeacherId).toBe(remaining.id);
  });

  it("cannot be pointed at another teacher's calendar from the payload (AC-61)", async () => {
    const teacher = await createTeacher("assigned.teacher@example.com", "Assigned Teacher");
    const otherTeacher = await createTeacher("victim.teacher@example.com", "Victim Teacher");
    const student = await createStudent("crafted.student@example.com", teacher.id);
    // The assigned teacher is busy at 11:00; the other teacher is free.
    await createBookingFor(teacher.id, slotAt("11:00"), 60);

    const response = await createStudentBooking(
      bookingRequest(
        {
          requestedStartAt: slotAt("11:00").toISOString(),
          lessonDuration: "min60",
          // Ignored: the teacher is resolved from Customer.primaryTeacherId.
          assignedTeacherId: otherTeacher.id,
          teacherId: otherTeacher.id
        },
        student.id
      )
    );
    expect(response.status).toBe(400);
    expect(await prisma.bookingRequest.count()).toBe(0);
  });
});
