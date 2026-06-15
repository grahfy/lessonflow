import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

/**
 * DB-backed tests for the teacher dashboard's data scoping.
 *
 * The dashboard page (src/app/admin/dashboard/page.tsx) is a server component
 * that inlines its reads, deriving the scope from the session role:
 *   teacher -> bookings filtered by { assignedTeacherId: me },
 *              customers filtered by { primaryTeacherId: me }
 *   owner   -> empty scope (sees everything).
 *
 * These tests pin that exact scoping contract against real rows so a teacher
 * session can never observe another teacher's schedule or students, and the
 * owner's empty scope sees the full set.
 */

const PREFIX = "P2DASH";

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

async function createBooking(assignedTeacherId: string | null, startAt: Date) {
  seq += 1;
  return prisma.booking.create({
    data: {
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
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
      timezone: "Australia/Melbourne",
      status: "approved",
      assignedTeacherId
    }
  });
}

async function createCustomer(primaryTeacherId: string | null) {
  seq += 1;
  return prisma.customer.create({
    data: {
      // fullName is derived from firstName+lastName by the snapshot helper, so the
      // unique prefix must live in firstName for our cleanup/query filters to match.
      ...customerSnapshotFromInput({
        firstName: `${PREFIX}Dash`,
        lastName: `Student${seq}`,
        name: `${PREFIX} Student ${seq}`,
        email: `${PREFIX.toLowerCase()}.cust.${seq}@example.com`,
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
      }),
      primaryTeacherId
    }
  });
}

/** Mirrors the dashboard's role-derived scope construction. */
function teacherScope(isOwner: boolean, teacherId: string) {
  return isOwner ? {} : { assignedTeacherId: teacherId };
}
function customerScope(isOwner: boolean, teacherId: string) {
  return isOwner ? {} : { primaryTeacherId: teacherId };
}

async function cleanup() {
  await prisma.booking.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.customer.deleteMany({ where: { fullName: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: `${PREFIX}-` } } });
}

describe("phase2-teacher-dashboard-scoping", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("a teacher's booking scope returns only their assigned bookings", async () => {
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");
    const start = new Date("2026-06-20T09:00:00.000Z");

    const mine1 = await createBooking(teacherA.id, start);
    const mine2 = await createBooking(teacherA.id, new Date(start.getTime() + 3600_000));
    await createBooking(teacherB.id, start);
    await createBooking(null, start);

    const rows = await prisma.booking.findMany({
      where: {
        status: "approved",
        name: { startsWith: PREFIX },
        ...teacherScope(false, teacherA.id)
      }
    });
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([mine1.id, mine2.id].sort());
  });

  it("owner booking scope (empty) sees all teachers' bookings", async () => {
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");
    const start = new Date("2026-06-20T09:00:00.000Z");

    await createBooking(teacherA.id, start);
    await createBooking(teacherB.id, start);
    await createBooking(null, start);

    const rows = await prisma.booking.findMany({
      where: {
        status: "approved",
        name: { startsWith: PREFIX },
        ...teacherScope(true, teacherA.id)
      }
    });
    expect(rows.length).toBe(3);
  });

  it("a teacher's customer scope returns only their primary-teacher students", async () => {
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");

    const mine = await createCustomer(teacherA.id);
    await createCustomer(teacherB.id);
    await createCustomer(null);

    const rows = await prisma.customer.findMany({
      where: {
        isArchived: false,
        fullName: { startsWith: PREFIX },
        ...customerScope(false, teacherA.id)
      }
    });
    expect(rows.map((r) => r.id)).toEqual([mine.id]);
  });

  it("owner customer scope (empty) sees all students", async () => {
    const teacherA = await createTeacher("A");
    const teacherB = await createTeacher("B");

    await createCustomer(teacherA.id);
    await createCustomer(teacherB.id);
    await createCustomer(null);

    const rows = await prisma.customer.findMany({
      where: {
        isArchived: false,
        fullName: { startsWith: PREFIX },
        ...customerScope(true, teacherA.id)
      }
    });
    expect(rows.length).toBe(3);
  });
});
