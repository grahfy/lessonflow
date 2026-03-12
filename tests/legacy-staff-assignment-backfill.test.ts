import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  backfillLegacyStaffAssignments,
  isLocalDevelopmentSiteUrl
} from "@/lib/admin/legacy-staff-assignment-backfill";
import { customerSnapshotFromInput } from "@/lib/customer-match";

async function createOwner(email: string, displayName: string) {
  return prisma.adminUser.create({
    data: {
      email,
      role: "owner",
      firstName: displayName,
      lastName: "Owner",
      displayName,
      passwordHash: await bcrypt.hash("owner-password", 12),
      isActive: true
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

async function seedUnassignedGraph() {
  const customer = await prisma.customer.create({
    data: customerSnapshotFromInput({
      firstName: "Legacy",
      lastName: "Student",
      name: "Legacy Student",
      email: "legacy.student@example.com",
      phone: "0400111222",
      lessonMode: "in_person",
      skillLevel: "beginner",
      unitNumber: undefined,
      houseNumber: "12",
      streetName: "High",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070"
    })
  });

  const bookingRequest = await prisma.bookingRequest.create({
    data: {
      firstName: "Legacy",
      lastName: "Student",
      name: "Legacy Student",
      email: "legacy.student@example.com",
      phone: "0400111222",
      address: "12 High Street, Northcote VIC 3070",
      houseNumber: "12",
      streetName: "High",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      requestedStartAt: addDays(new Date(), 3),
      customerId: customer.id
    }
  });

  const bookingSeries = await prisma.bookingSeries.create({
    data: {
      firstName: "Legacy",
      lastName: "Student",
      name: "Legacy Student",
      email: "legacy.student@example.com",
      phone: "0400111222",
      address: "12 High Street, Northcote VIC 3070",
      houseNumber: "12",
      streetName: "High",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      dayOfWeek: 2,
      startTimeLocal: "14:00",
      startDate: addDays(new Date(), 3),
      recurrenceEndAt: addDays(new Date(), 31),
      timezone: "Australia/Melbourne",
      customerId: customer.id
    }
  });

  const booking = await prisma.booking.create({
    data: {
      firstName: "Legacy",
      lastName: "Student",
      name: "Legacy Student",
      email: "legacy.student@example.com",
      phone: "0400111222",
      address: "12 High Street, Northcote VIC 3070",
      houseNumber: "12",
      streetName: "High",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      startAt: addDays(new Date(), 3),
      endAt: addDays(new Date(), 3),
      timezone: "Australia/Melbourne",
      customerId: customer.id,
      requestId: bookingRequest.id,
      seriesId: bookingSeries.id
    }
  });

  return {
    customer,
    bookingRequest,
    bookingSeries,
    booking
  };
}

describe("legacy staff assignment backfill", () => {
  beforeEach(async () => {
    await prisma.bookingAuditLog.deleteMany();
    await prisma.learningMaterial.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("detects local development site URLs", () => {
    expect(isLocalDevelopmentSiteUrl("http://localhost:3000")).toBe(true);
    expect(isLocalDevelopmentSiteUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalDevelopmentSiteUrl("https://melbourneguitarschool.com.au")).toBe(false);
    expect(isLocalDevelopmentSiteUrl("")).toBe(false);
  });

  it("assigns all legacy unassigned records to the owner in local dev-style environments", async () => {
    const owner = await createOwner("owner.backfill@example.com", "Backfill Owner");
    await createTeacher("teacher.backfill@example.com", "Backfill Teacher");
    const seeded = await seedUnassignedGraph();

    const result = await backfillLegacyStaffAssignments({
      db: prisma,
      siteUrl: "http://localhost:3000"
    });

    expect(result.status).toBe("updated");
    if (result.status !== "updated") return;
    expect(result.ownerId).toBe(owner.id);
    expect(result.counts).toEqual({
      customers: 1,
      bookingRequests: 1,
      bookingSeries: 1,
      bookings: 1
    });

    const [customer, bookingRequest, bookingSeries, booking] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: seeded.customer.id } }),
      prisma.bookingRequest.findUniqueOrThrow({ where: { id: seeded.bookingRequest.id } }),
      prisma.bookingSeries.findUniqueOrThrow({ where: { id: seeded.bookingSeries.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: seeded.booking.id } })
    ]);

    expect(customer.primaryTeacherId).toBe(owner.id);
    expect(bookingRequest.assignedTeacherId).toBe(owner.id);
    expect(bookingSeries.assignedTeacherId).toBe(owner.id);
    expect(booking.assignedTeacherId).toBe(owner.id);
  });

  it("skips the backfill for production-style site URLs", async () => {
    await createOwner("owner.prodskip@example.com", "Prod Skip Owner");
    await createTeacher("teacher.prodskip@example.com", "Prod Skip Teacher");
    const seeded = await seedUnassignedGraph();

    const result = await backfillLegacyStaffAssignments({
      db: prisma,
      siteUrl: "https://melbourneguitarschool.com.au"
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "non_local_site_url",
      siteUrl: "https://melbourneguitarschool.com.au"
    });

    const [customer, bookingRequest, bookingSeries, booking] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: seeded.customer.id } }),
      prisma.bookingRequest.findUniqueOrThrow({ where: { id: seeded.bookingRequest.id } }),
      prisma.bookingSeries.findUniqueOrThrow({ where: { id: seeded.bookingSeries.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: seeded.booking.id } })
    ]);

    expect(customer.primaryTeacherId).toBeNull();
    expect(bookingRequest.assignedTeacherId).toBeNull();
    expect(bookingSeries.assignedTeacherId).toBeNull();
    expect(booking.assignedTeacherId).toBeNull();
  });

  it("backfills owner-only production installs when there are no active teachers", async () => {
    const owner = await createOwner("owner.prodonly@example.com", "Prod Only Owner");
    const seeded = await seedUnassignedGraph();

    const result = await backfillLegacyStaffAssignments({
      db: prisma,
      siteUrl: "https://melbourneguitarschool.com.au"
    });

    expect(result.status).toBe("updated");
    if (result.status !== "updated") return;
    expect(result.ownerId).toBe(owner.id);

    const [customer, bookingRequest, bookingSeries, booking] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: seeded.customer.id } }),
      prisma.bookingRequest.findUniqueOrThrow({ where: { id: seeded.bookingRequest.id } }),
      prisma.bookingSeries.findUniqueOrThrow({ where: { id: seeded.bookingSeries.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: seeded.booking.id } })
    ]);

    expect(customer.primaryTeacherId).toBe(owner.id);
    expect(bookingRequest.assignedTeacherId).toBe(owner.id);
    expect(bookingSeries.assignedTeacherId).toBe(owner.id);
    expect(booking.assignedTeacherId).toBe(owner.id);
  });

  it("skips the backfill when any assignment already exists anywhere in the dataset", async () => {
    const owner = await createOwner("owner.existing@example.com", "Existing Owner");
    const seeded = await seedUnassignedGraph();

    await prisma.booking.update({
      where: {
        id: seeded.booking.id
      },
      data: {
        assignedTeacherId: owner.id
      }
    });

    const result = await backfillLegacyStaffAssignments({
      db: prisma,
      siteUrl: "http://127.0.0.1:3000"
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "existing_assignments_detected",
      siteUrl: "http://127.0.0.1:3000"
    });

    const [customer, bookingRequest, bookingSeries, booking] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: seeded.customer.id } }),
      prisma.bookingRequest.findUniqueOrThrow({ where: { id: seeded.bookingRequest.id } }),
      prisma.bookingSeries.findUniqueOrThrow({ where: { id: seeded.bookingSeries.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: seeded.booking.id } })
    ]);

    expect(customer.primaryTeacherId).toBeNull();
    expect(bookingRequest.assignedTeacherId).toBeNull();
    expect(bookingSeries.assignedTeacherId).toBeNull();
    expect(booking.assignedTeacherId).toBe(owner.id);
  });

  it("skips safely when no owner account exists", async () => {
    await createTeacher("teacher.no-owner@example.com", "No Owner Teacher");
    const seeded = await seedUnassignedGraph();

    const result = await backfillLegacyStaffAssignments({
      db: prisma,
      siteUrl: "http://localhost:3000"
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "no_owner",
      siteUrl: "http://localhost:3000"
    });

    const [customer, bookingRequest, bookingSeries, booking] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: seeded.customer.id } }),
      prisma.bookingRequest.findUniqueOrThrow({ where: { id: seeded.bookingRequest.id } }),
      prisma.bookingSeries.findUniqueOrThrow({ where: { id: seeded.bookingSeries.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: seeded.booking.id } })
    ]);

    expect(customer.primaryTeacherId).toBeNull();
    expect(bookingRequest.assignedTeacherId).toBeNull();
    expect(bookingSeries.assignedTeacherId).toBeNull();
    expect(booking.assignedTeacherId).toBeNull();
  });
});
