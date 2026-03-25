import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/admin/customers/[id]/bookings/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";

function adminRequest(url: string, token: string) {
  return new NextRequest(url, {
    headers: {
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
      lastName: "Teacher",
      displayName,
      passwordHash: await bcrypt.hash("teacher-password", 12),
      isActive: true
    }
  });
}

async function createCustomer(primaryTeacherId?: string | null) {
  return prisma.customer.create({
    data: {
      ...customerSnapshotFromInput({
        name: "History Student",
        email: "history.student@example.com",
        phone: "0400111222",
        lessonMode: "in_person",
        skillLevel: "intermediate",
        unitNumber: undefined,
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      }),
      primaryTeacherId: primaryTeacherId ?? null
    }
  });
}

async function createBooking(input: {
  customerId: string;
  name?: string;
  email?: string;
  phone?: string;
  startAt: string;
  status?: "approved" | "cancelled";
  assignedTeacherId?: string | null;
  notes?: string | null;
}) {
  return prisma.booking.create({
    data: {
      name: input.name ?? "History Student",
      email: input.email ?? "history.student@example.com",
      phone: input.phone ?? "0400111222",
      address: "10 Main Street, Northcote VIC 3070",
      houseNumber: "10",
      streetName: "Main",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "intermediate",
      lessonDuration: "min60",
      startAt: new Date(input.startAt),
      endAt: new Date(new Date(input.startAt).getTime() + 60 * 60 * 1000),
      timezone: "Australia/Melbourne",
      status: input.status ?? "approved",
      customerId: input.customerId,
      assignedTeacherId: input.assignedTeacherId ?? null,
      notes: input.notes ?? null
    }
  });
}

describe("admin-customer-booking-history", () => {
  beforeEach(async () => {
    await prisma.learningMaterial.deleteMany();
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customerPortalCredentialAuditLog.deleteMany();
    await prisma.customerPortalCredential.deleteMany();
    await prisma.customerInboundEmail.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("lists customer bookings newest first and excludes booking requests", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const customer = await createCustomer();

    await prisma.bookingRequest.create({
      data: {
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: "10 Main Street, Northcote VIC 3070",
        houseNumber: "10",
        streetName: "Main",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070",
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min30",
        requestedStartAt: new Date("2026-07-11T08:00:00.000Z"),
        customerId: customer.id
      }
    });

    const older = await createBooking({
      customerId: customer.id,
      startAt: "2026-07-01T09:00:00.000Z",
      notes: "Older lesson"
    });
    const newer = await createBooking({
      customerId: customer.id,
      startAt: "2026-07-08T09:00:00.000Z",
      status: "cancelled",
      notes: "Most recent lesson"
    });

    const response = await GET(adminRequest(`http://localhost/api/admin/customers/${customer.id}/bookings`, token), {
      params: Promise.resolve({ id: customer.id })
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      bookings: Array<{ id: string; status: string; notes: string | null }>;
    };

    expect(payload.bookings.map((booking) => booking.id)).toEqual([newer.id, older.id]);
    expect(payload.bookings.map((booking) => booking.status)).toEqual(["cancelled", "approved"]);
    expect(payload.bookings[0]?.notes).toBe("Most recent lesson");
    expect(payload.bookings).toHaveLength(2);
  });

  it("limits a teacher to their own assigned bookings for a managed customer", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("history-teacher-a@example.com", "History Teacher A");
    const teacherB = await createTeacher("history-teacher-b@example.com", "History Teacher B");
    const token = createSessionToken(teacherA.email);
    const customer = await createCustomer(teacherA.id);

    const visibleBooking = await createBooking({
      customerId: customer.id,
      startAt: "2026-07-15T09:00:00.000Z",
      assignedTeacherId: teacherA.id
    });
    await createBooking({
      customerId: customer.id,
      startAt: "2026-07-16T09:00:00.000Z",
      assignedTeacherId: teacherB.id
    });

    const response = await GET(adminRequest(`http://localhost/api/admin/customers/${customer.id}/bookings`, token), {
      params: Promise.resolve({ id: customer.id })
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      bookings: Array<{ id: string; assignedTeacher: { id: string } | null }>;
    };

    expect(payload.bookings).toHaveLength(1);
    expect(payload.bookings[0]?.id).toBe(visibleBooking.id);
    expect(payload.bookings[0]?.assignedTeacher?.id).toBe(teacherA.id);
  });

  it("forbids teachers from loading customers they do not manage", async () => {
    await ensureOwnerAdmin();
    const teacherA = await createTeacher("history-denied-a@example.com", "History Denied A");
    const teacherB = await createTeacher("history-denied-b@example.com", "History Denied B");
    const token = createSessionToken(teacherA.email);
    const customer = await createCustomer(teacherB.id);

    await createBooking({
      customerId: customer.id,
      startAt: "2026-07-17T09:00:00.000Z",
      assignedTeacherId: teacherA.id
    });

    const response = await GET(adminRequest(`http://localhost/api/admin/customers/${customer.id}/bookings`, token), {
      params: Promise.resolve({ id: customer.id })
    });

    expect(response.status).toBe(403);
  });
});
