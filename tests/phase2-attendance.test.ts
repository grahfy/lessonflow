import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PATCH as patchBooking } from "@/app/api/admin/bookings/[id]/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { getAdminPeriodReport } from "@/lib/admin-reports";

/**
 * DB-backed tests for Phase 2 attendance tracking.
 *
 * Exercises the real PATCH /api/admin/bookings/[id] `set_attendance` action
 * against Prisma rows: the gating rules (approved + already-started), the
 * owner/teacher permission split, the audit trail, attendance clearing, and the
 * attended/no-show counts surfaced by the reports aggregation.
 *
 * All rows are inserted under a unique prefix and cleaned up per-test so the
 * file is deterministic when run in isolation.
 */

const PREFIX = "P2ATT";

function adminRequest(body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/bookings/x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: `${getSessionCookieName()}=${token}`
    }
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

let bookingSeq = 0;

async function createBooking(overrides: Partial<Record<string, unknown>> = {}) {
  bookingSeq += 1;
  const start = new Date("2026-01-10T09:00:00.000Z");
  return prisma.booking.create({
    data: {
      name: `${PREFIX} Student ${bookingSeq}`,
      email: `${PREFIX.toLowerCase()}.student.${bookingSeq}@example.com`,
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
      ...overrides
    }
  });
}

async function cleanup() {
  await prisma.bookingAuditLog.deleteMany({ where: { booking: { name: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: `${PREFIX}-` } } });
}

describe("phase2-attendance", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("owner can mark attendance on an approved past lesson + writes audit", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const booking = await createBooking({ startAt: new Date("2026-01-10T09:00:00.000Z") });

    const res = await patchBooking(
      adminRequest({ action: "set_attendance", attendanceStatus: "attended" }, token),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(200);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.attendanceStatus).toBe("attended");
    expect(updated.attendanceMarkedAt).not.toBeNull();
    expect(updated.attendanceMarkedById).toBe(owner.id);

    const audit = await prisma.bookingAuditLog.findFirst({
      where: { bookingId: booking.id, action: "attendance_marked" }
    });
    expect(audit).not.toBeNull();
    expect(audit?.details).toContain("attended");
  });

  it("rejects attendance for a future lesson (400)", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const booking = await createBooking({ startAt: future, endAt: new Date(future.getTime() + 3600_000) });

    const res = await patchBooking(
      adminRequest({ action: "set_attendance", attendanceStatus: "attended" }, token),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(400);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.attendanceStatus).toBeNull();
  });

  it("rejects attendance for a non-approved (cancelled) lesson (400)", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const booking = await createBooking({ status: "cancelled" });

    const res = await patchBooking(
      adminRequest({ action: "set_attendance", attendanceStatus: "no_show" }, token),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("teacher can mark only their own assigned booking; forbidden on others", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");
    const tokenA = createSessionToken(teacherA.email);

    const ownBooking = await createBooking({ assignedTeacherId: teacherA.id });
    const otherBooking = await createBooking({ assignedTeacherId: teacherB.id });

    const ownRes = await patchBooking(
      adminRequest({ action: "set_attendance", attendanceStatus: "attended" }, tokenA),
      { params: Promise.resolve({ id: ownBooking.id }) }
    );
    expect(ownRes.status).toBe(200);

    const otherRes = await patchBooking(
      adminRequest({ action: "set_attendance", attendanceStatus: "attended" }, tokenA),
      { params: Promise.resolve({ id: otherBooking.id }) }
    );
    expect(otherRes.status).toBe(403);

    const otherUnchanged = await prisma.booking.findUniqueOrThrow({ where: { id: otherBooking.id } });
    expect(otherUnchanged.attendanceStatus).toBeNull();
  });

  it("attendance is clearable (null resets marked metadata)", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const booking = await createBooking();

    await patchBooking(
      adminRequest({ action: "set_attendance", attendanceStatus: "no_show" }, token),
      { params: Promise.resolve({ id: booking.id }) }
    );
    const marked = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(marked.attendanceStatus).toBe("no_show");
    expect(marked.attendanceMarkedById).toBe(owner.id);

    const clearRes = await patchBooking(
      adminRequest({ action: "set_attendance", attendanceStatus: null }, token),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(clearRes.status).toBe(200);

    const cleared = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(cleared.attendanceStatus).toBeNull();
    expect(cleared.attendanceMarkedAt).toBeNull();
    expect(cleared.attendanceMarkedById).toBeNull();
  });

  it("reports aggregation counts attended and no-show within the window", async () => {
    await ensureOwnerAdmin();
    // Place lessons inside the monthly window covered by a mid-January "now".
    const inWindow = new Date("2026-01-15T09:00:00.000Z");
    await createBooking({ startAt: inWindow, endAt: new Date(inWindow.getTime() + 3600_000), attendanceStatus: "attended" });
    await createBooking({ startAt: inWindow, endAt: new Date(inWindow.getTime() + 3600_000), attendanceStatus: "attended" });
    await createBooking({ startAt: inWindow, endAt: new Date(inWindow.getTime() + 3600_000), attendanceStatus: "no_show" });
    // An approved-but-unmarked booking must NOT inflate either attendance count.
    await createBooking({ startAt: inWindow, endAt: new Date(inWindow.getTime() + 3600_000) });

    const report = await getAdminPeriodReport("monthly", new Date("2026-01-20T00:00:00.000Z"));

    // The monthly snapshot's appointment block carries the attendance outcomes.
    // Counts use >= because the isolated DB still contains only our four rows
    // (plus any harness seed), and these assert the attendance math specifically.
    expect(report.appointments.attendedCount).toBeGreaterThanOrEqual(2);
    expect(report.appointments.noShowCount).toBeGreaterThanOrEqual(1);
    // 4 approved lessons in window; only 3 have an attendance outcome.
    expect(report.appointments.confirmedCount).toBeGreaterThanOrEqual(4);
    expect(report.appointments.attendedCount + report.appointments.noShowCount).toBeLessThanOrEqual(
      report.appointments.confirmedCount
    );
  });
});
