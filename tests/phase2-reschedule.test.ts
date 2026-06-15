import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as studentReschedule } from "@/app/api/student/bookings/[id]/reschedule/route";
import { PATCH as resolveReschedule } from "@/app/api/admin/reschedule-requests/[id]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

/**
 * DB-backed tests for Phase 2 student self-reschedule (request -> approve/decline).
 *
 * Covers the student POST guard rails (ownership, upcoming + approved, future
 * date, single-pending 409), and the admin PATCH resolution: approve moves the
 * booking + marks the request approved + audits; decline marks declined and
 * leaves the booking untouched; teachers may only resolve their own bookings.
 */

const PREFIX = "P2RES";

let seq = 0;

async function createCustomer() {
  seq += 1;
  return prisma.customer.create({
    // fullName derives from firstName+lastName, so embed the unique prefix in
    // firstName to keep the cleanup filter (fullName startsWith PREFIX) accurate.
    data: customerSnapshotFromInput({
      firstName: `${PREFIX}Resched`,
      lastName: `Student${seq}`,
      name: `${PREFIX} Student ${seq}`,
      email: `${PREFIX.toLowerCase()}.student.${seq}@example.com`,
      phone: "0400555000",
      lessonMode: "in_person",
      skillLevel: "beginner",
      unitNumber: undefined,
      houseNumber: "12",
      streetName: "Main",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070"
    })
  });
}

async function createTeacher(suffix: string) {
  return prisma.adminUser.create({
    data: {
      email: `${PREFIX}-teacher-${suffix}@example.com`,
      role: "teacher",
      firstName: `Teacher ${suffix}`,
      displayName: `Teacher ${suffix}`,
      passwordHash: await bcrypt.hash("teacher-password", 12),
      isActive: true
    }
  });
}

async function createBooking(customerId: string, overrides: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  // Upcoming approved booking by default (10 days out, within 2026).
  const start = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  return prisma.booking.create({
    data: {
      name: `${PREFIX} Student ${seq}`,
      email: `${PREFIX.toLowerCase()}.booking.${seq}@example.com`,
      phone: "0400000000",
      address: "66 High Street, Northcote VIC 3070",
      houseNumber: "66",
      streetName: "High",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      startAt: start,
      endAt: new Date(start.getTime() + 60 * 60 * 1000),
      timezone: "Australia/Melbourne",
      status: "approved",
      customerId,
      ...overrides
    }
  });
}

function studentRequest(bookingId: string, customerId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/student/bookings/${bookingId}/reschedule`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getStudentSessionCookieName()}=${createStudentSessionToken(customerId)}`
    }
  });
}

function adminRequest(body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/reschedule-requests/x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

/** A future timestamp safely inside the current calendar year. */
function futureWithinYear(daysOut: number): Date {
  const candidate = new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000);
  // If we'd cross into next year, pin to a date earlier this year instead so the
  // calendar-year guard in the route stays satisfied regardless of run date.
  if (candidate.getUTCFullYear() !== new Date().getUTCFullYear()) {
    return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 2, 9, 0, 0));
  }
  return candidate;
}

async function cleanup() {
  await prisma.bookingRescheduleRequest.deleteMany({ where: { booking: { name: { startsWith: PREFIX } } } });
  await prisma.bookingAuditLog.deleteMany({ where: { booking: { name: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.customer.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
  await prisma.outboundEmail.deleteMany({ where: { toEmail: { startsWith: PREFIX.toLowerCase() } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: `${PREFIX}-` } } });
}

describe("phase2-reschedule", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("student creates a pending reschedule request + audit for own upcoming approved booking", async () => {
    const customer = await createCustomer();
    const booking = await createBooking(customer.id);
    const requestedStartAt = futureWithinYear(12).toISOString();

    const res = await studentReschedule(
      studentRequest(booking.id, customer.id, { requestedStartAt, reason: "Clash" }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(201);

    const created = await prisma.bookingRescheduleRequest.findFirstOrThrow({
      where: { bookingId: booking.id }
    });
    expect(created.status).toBe("pending");
    expect(created.reason).toBe("Clash");

    const audit = await prisma.bookingAuditLog.findFirst({
      where: { bookingId: booking.id, action: "reschedule_requested" }
    });
    expect(audit).not.toBeNull();
  });

  it("rejects a second pending request for the same booking (409)", async () => {
    const customer = await createCustomer();
    const booking = await createBooking(customer.id);

    const first = await studentReschedule(
      studentRequest(booking.id, customer.id, { requestedStartAt: futureWithinYear(12).toISOString() }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(first.status).toBe(201);

    const second = await studentReschedule(
      studentRequest(booking.id, customer.id, { requestedStartAt: futureWithinYear(13).toISOString() }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(second.status).toBe(409);

    const count = await prisma.bookingRescheduleRequest.count({ where: { bookingId: booking.id } });
    expect(count).toBe(1);
  });

  it("rejects rescheduling another student's booking (404)", async () => {
    const owner = await createCustomer();
    const intruder = await createCustomer();
    const booking = await createBooking(owner.id);

    const res = await studentReschedule(
      studentRequest(booking.id, intruder.id, { requestedStartAt: futureWithinYear(12).toISOString() }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(404);
    const count = await prisma.bookingRescheduleRequest.count({ where: { bookingId: booking.id } });
    expect(count).toBe(0);
  });

  it("rejects a past-dated requested time (400)", async () => {
    const customer = await createCustomer();
    const booking = await createBooking(customer.id);
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const res = await studentReschedule(
      studentRequest(booking.id, customer.id, { requestedStartAt: past }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("rejects rescheduling a non-approved booking (400)", async () => {
    const customer = await createCustomer();
    const booking = await createBooking(customer.id, { status: "cancelled" });

    const res = await studentReschedule(
      studentRequest(booking.id, customer.id, { requestedStartAt: futureWithinYear(12).toISOString() }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("admin approve moves the booking + marks request approved + audits", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const customer = await createCustomer();
    const booking = await createBooking(customer.id);

    const newStart = futureWithinYear(20);
    const request = await prisma.bookingRescheduleRequest.create({
      data: {
        bookingId: booking.id,
        requestedStartAt: newStart,
        status: "pending"
      }
    });

    const res = await resolveReschedule(adminRequest({ action: "approve" }, token), {
      params: Promise.resolve({ id: request.id })
    });
    expect(res.status).toBe(200);

    const movedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(movedBooking.startAt.toISOString()).toBe(newStart.toISOString());
    // endAt recomputed off the 60-minute duration.
    expect(movedBooking.endAt.getTime() - movedBooking.startAt.getTime()).toBe(60 * 60 * 1000);

    const resolved = await prisma.bookingRescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(resolved.status).toBe("approved");
    expect(resolved.resolvedById).toBe(owner.id);
    expect(resolved.resolvedAt).not.toBeNull();

    const audit = await prisma.bookingAuditLog.findFirst({
      where: { bookingId: booking.id, action: "reschedule_approved" }
    });
    expect(audit).not.toBeNull();
  });

  it("admin decline marks request declined and leaves the booking unchanged", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const customer = await createCustomer();
    const booking = await createBooking(customer.id);
    const originalStart = booking.startAt.toISOString();

    const request = await prisma.bookingRescheduleRequest.create({
      data: {
        bookingId: booking.id,
        requestedStartAt: futureWithinYear(20),
        status: "pending"
      }
    });

    const res = await resolveReschedule(adminRequest({ action: "decline" }, token), {
      params: Promise.resolve({ id: request.id })
    });
    expect(res.status).toBe(200);

    const resolved = await prisma.bookingRescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(resolved.status).toBe("declined");

    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.startAt.toISOString()).toBe(originalStart);

    const audit = await prisma.bookingAuditLog.findFirst({
      where: { bookingId: booking.id, action: "reschedule_declined" }
    });
    expect(audit).not.toBeNull();
  });

  it("teacher can only resolve reschedule requests for their own assigned bookings", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");
    const tokenA = createSessionToken(teacherA.email);

    const customer = await createCustomer();
    const otherBooking = await createBooking(customer.id, { assignedTeacherId: teacherB.id });
    const request = await prisma.bookingRescheduleRequest.create({
      data: {
        bookingId: otherBooking.id,
        requestedStartAt: futureWithinYear(20),
        status: "pending"
      }
    });

    const res = await resolveReschedule(adminRequest({ action: "approve" }, tokenA), {
      params: Promise.resolve({ id: request.id })
    });
    expect(res.status).toBe(403);

    const stillPending = await prisma.bookingRescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stillPending.status).toBe("pending");
  });
});
