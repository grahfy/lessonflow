import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PATCH as patchBookingRequest } from "@/app/api/admin/booking-requests/[id]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * DB-backed tests for Phase 2 waitlist transitions on the admin
 * booking-requests PATCH route.
 *
 * - `waitlist`: pending -> waitlisted, writes a `waitlisted` audit row, sends no
 *   customer email; only pending requests are eligible; teachers may waitlist
 *   their own requests but not others'.
 * - `promote`: waitlisted -> a real Booking via the shared approval pipeline,
 *   marks the request approved, writes a `waitlist_promoted` audit row; teacher
 *   scoping applies.
 */

const PREFIX = "P2WAIT";

let seq = 0;

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

async function createRequest(overrides: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return prisma.bookingRequest.create({
    data: {
      firstName: "Wait",
      lastName: `Lister${seq}`,
      name: `${PREFIX} Student ${seq}`,
      email: `${PREFIX.toLowerCase()}.student.${seq}@example.com`,
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
      requestedStartAt: start,
      status: "pending",
      ...overrides
    }
  });
}

function adminRequest(body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/booking-requests/x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

async function cleanup() {
  await prisma.bookingAuditLog.deleteMany({ where: { details: { contains: PREFIX } } });
  await prisma.bookingAuditLog.deleteMany({ where: { booking: { name: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.bookingRequest.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.customer.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
  await prisma.customerPortalCredentialAuditLog.deleteMany({ where: { details: { contains: PREFIX } } });
  await prisma.outboundEmail.deleteMany({ where: { toEmail: { startsWith: PREFIX.toLowerCase() } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: `${PREFIX}-` } } });
}

describe("phase2-waitlist", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("owner waitlists a pending request (no email) and writes a waitlisted audit", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const request = await createRequest();

    const res = await patchBookingRequest(adminRequest({ action: "waitlist" }, token), {
      params: Promise.resolve({ id: request.id })
    });
    expect(res.status).toBe(200);

    const updated = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("waitlisted");

    const audit = await prisma.bookingAuditLog.findFirst({
      where: { action: "waitlisted", details: { contains: request.id } }
    });
    expect(audit).not.toBeNull();

    // Waitlisting is internal parking — no customer email should be enqueued.
    const emails = await prisma.outboundEmail.findMany({ where: { toEmail: request.email } });
    expect(emails.length).toBe(0);
  });

  it("rejects waitlisting a non-pending request (400)", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const request = await createRequest({ status: "approved" });

    const res = await patchBookingRequest(adminRequest({ action: "waitlist" }, token), {
      params: Promise.resolve({ id: request.id })
    });
    expect(res.status).toBe(400);
  });

  it("promote turns a waitlisted request into a booking + marks approved + audits", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const request = await createRequest({ status: "waitlisted" });

    const res = await patchBookingRequest(adminRequest({ action: "promote" }, token), {
      params: Promise.resolve({ id: request.id })
    });
    expect([200, 202]).toContain(res.status);

    const updated = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("approved");

    // A real booking row is created from the request, linked back via requestId.
    const booking = await prisma.booking.findFirstOrThrow({ where: { requestId: request.id } });
    expect(booking.status).toBe("approved");
    expect(booking.name).toBe(request.name);

    // The `waitlist_promoted` audit row is written durably INSIDE the approval
    // transaction (not gated on email delivery), so it must exist even though the
    // test environment has no SMTP and the promotion email resolves to a partial 202.
    const audit = await prisma.bookingAuditLog.findFirst({
      where: { action: "waitlist_promoted", details: { contains: request.id } }
    });
    expect(audit).not.toBeNull();
    expect(audit?.bookingId).toBe(booking.id);
  });

  it("rejects promoting a request that is not waitlisted (400)", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const request = await createRequest({ status: "pending" });

    const res = await patchBookingRequest(adminRequest({ action: "promote" }, token), {
      params: Promise.resolve({ id: request.id })
    });
    expect(res.status).toBe(400);
  });

  it("teacher can waitlist their own request but not another teacher's", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");
    const tokenA = createSessionToken(teacherA.email);

    const ownRequest = await createRequest({ assignedTeacherId: teacherA.id });
    const otherRequest = await createRequest({ assignedTeacherId: teacherB.id });

    const ownRes = await patchBookingRequest(adminRequest({ action: "waitlist" }, tokenA), {
      params: Promise.resolve({ id: ownRequest.id })
    });
    expect(ownRes.status).toBe(200);

    const otherRes = await patchBookingRequest(adminRequest({ action: "waitlist" }, tokenA), {
      params: Promise.resolve({ id: otherRequest.id })
    });
    expect(otherRes.status).toBe(403);

    const otherUnchanged = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: otherRequest.id } });
    expect(otherUnchanged.status).toBe("pending");
  });

  it("teacher cannot promote another teacher's waitlisted request (403)", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");
    const tokenA = createSessionToken(teacherA.email);

    const otherRequest = await createRequest({ status: "waitlisted", assignedTeacherId: teacherB.id });

    const res = await patchBookingRequest(adminRequest({ action: "promote" }, tokenA), {
      params: Promise.resolve({ id: otherRequest.id })
    });
    expect(res.status).toBe(403);

    const unchanged = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: otherRequest.id } });
    expect(unchanged.status).toBe("waitlisted");
  });
});
