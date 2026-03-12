import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest, requireOwnerFromRequest } from "@/lib/admin-route";
import {
  createTeacherSchema,
  mapStaffProfile,
  mapStaffSummary,
  staffProfileDataFromInput
} from "@/lib/admin/staff-contracts";
import { prisma } from "@/lib/db";

/**
 * Returns the current admin profile plus the teacher list used by owner pages,
 * assignment dropdowns, and teacher self-service screens.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teachers = await prisma.adminUser.findMany({
      where: admin.role === "owner" ? { role: "teacher" } : { role: "teacher", isActive: true },
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }]
    });

    return NextResponse.json({
      currentAdmin: mapStaffProfile(admin),
      teachers: teachers.map(mapStaffSummary)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load staff accounts.");
  }
}

/**
 * Owner-only teacher account creation.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createTeacherSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid teacher payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.adminUser.findUnique({
      where: { email }
    });
    if (existing) {
      return NextResponse.json({ error: "A staff account with this email already exists." }, { status: 409 });
    }

    const created = await prisma.adminUser.create({
      data: {
        email,
        role: "teacher",
        firstName: parsed.data.firstName.trim(),
        lastName: parsed.data.lastName.trim(),
        displayName: parsed.data.displayName.trim(),
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        isActive: true,
        ...staffProfileDataFromInput(parsed.data)
      }
    });

    return NextResponse.json({
      teacher: mapStaffProfile(created)
    }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create teacher.");
  }
}
