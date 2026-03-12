import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  findSingleAssignableStaffId,
  findSingleActiveTeacherId,
  resolveAssignedTeacherId,
  resolveAutoAssignedTeacherId
} from "@/lib/admin/teacher-assignment";

async function createTeacher(email: string, displayName: string, isActive = true) {
  return prisma.adminUser.create({
    data: {
      email,
      role: "teacher",
      firstName: displayName,
      lastName: "Teacher",
      displayName,
      passwordHash: await bcrypt.hash("teacher-password", 12),
      isActive
    }
  });
}

describe("teacher assignment", () => {
  beforeEach(async () => {
    await prisma.bookingAuditLog.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.bookingSeries.deleteMany();
    await prisma.bookingRequest.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  it("returns the single active teacher id only when exactly one teacher is active", async () => {
    const teacher = await createTeacher("single-active@example.com", "Single Active");
    expect(await findSingleActiveTeacherId(prisma)).toBe(teacher.id);

    await createTeacher("second-active@example.com", "Second Active");
    expect(await findSingleActiveTeacherId(prisma)).toBeNull();
  });

  it("uses the single-teacher default for owner assignment when no explicit teacher is provided", async () => {
    const teacher = await createTeacher("owner-default@example.com", "Owner Default");

    const assignedTeacherId = await resolveAssignedTeacherId({
      db: prisma,
      actor: {
        id: "owner-id",
        role: "owner"
      }
    });

    expect(assignedTeacherId).toBe(teacher.id);
  });

  it("falls back to the owner account when no active teachers exist", async () => {
    const owner = await prisma.adminUser.create({
      data: {
        email: "owner-fallback@example.com",
        role: "owner",
        firstName: "Owner",
        lastName: "Fallback",
        displayName: "Owner Fallback",
        passwordHash: await bcrypt.hash("owner-password", 12),
        isActive: true
      }
    });

    expect(await findSingleAssignableStaffId(prisma)).toBe(owner.id);

    const assignedTeacherId = await resolveAssignedTeacherId({
      db: prisma,
      actor: {
        id: owner.id,
        role: "owner"
      }
    });

    expect(assignedTeacherId).toBe(owner.id);
  });

  it("prefers an active teacher default and otherwise falls back to the single-teacher default", async () => {
    const inactiveTeacher = await createTeacher("inactive-default@example.com", "Inactive Default", false);
    const activeTeacher = await createTeacher("active-default@example.com", "Active Default");

    const assignedTeacherId = await resolveAutoAssignedTeacherId({
      db: prisma,
      preferredTeacherId: inactiveTeacher.id
    });

    expect(assignedTeacherId).toBe(activeTeacher.id);
  });
});
