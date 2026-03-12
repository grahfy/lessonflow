import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

import { GET } from "@/app/api/admin/staff/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

describe("admin staff options", () => {
  beforeEach(async () => {
    await prisma.adminUser.deleteMany();
  });

  it("returns the owner as the assignable fallback when no active teachers exist", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/staff", {
        headers: {
          cookie: `${getSessionCookieName()}=${token}`
        }
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      teachers: Array<{ id: string; displayName: string; role: string }>;
    };

    expect(body.teachers).toHaveLength(1);
    expect(body.teachers[0]).toMatchObject({
      id: owner.id,
      displayName: owner.displayName,
      role: "owner"
    });
  });

  it("prefers active teachers over the owner fallback when teacher accounts exist", async () => {
    const owner = await ensureOwnerAdmin();
    const token = createSessionToken(owner.email);
    const teacher = await prisma.adminUser.create({
      data: {
        email: "staff-options-teacher@example.com",
        role: "teacher",
        firstName: "Staff",
        lastName: "Option",
        displayName: "Staff Option",
        passwordHash: await bcrypt.hash("teacher-password", 12),
        isActive: true
      }
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/staff", {
        headers: {
          cookie: `${getSessionCookieName()}=${token}`
        }
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      teachers: Array<{ id: string; displayName: string; role: string }>;
    };

    expect(body.teachers).toHaveLength(1);
    expect(body.teachers[0]).toMatchObject({
      id: teacher.id,
      displayName: teacher.displayName,
      role: "teacher"
    });
  });
});
