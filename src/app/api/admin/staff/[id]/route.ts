import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { canManageStaffAccount, isOwner } from "@/lib/admin/permissions";
import {
  mapStaffProfile,
  ownerUpdateStaffSchema,
  selfUpdateStaffSchema,
  staffPasswordSchema,
  staffProfileDataFromInput
} from "@/lib/admin/staff-contracts";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!canManageStaffAccount(admin, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const staff = await prisma.adminUser.findUnique({
      where: { id }
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    return NextResponse.json({
      staff: mapStaffProfile(staff)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load staff account.");
  }
}

/**
 * Updates one staff profile or password. Owners can manage any teacher, while
 * teachers can only self-manage their own profile fields and password.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!canManageStaffAccount(admin, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.adminUser.findUnique({
      where: { id }
    });
    if (!existing) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const mode = String(body?.mode || "profile");

    if (mode === "password") {
      const parsed = staffPasswordSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid password payload.", details: parsed.error.flatten() }, { status: 400 });
      }

      const updated = await prisma.adminUser.update({
        where: { id },
        data: {
          passwordHash: await bcrypt.hash(parsed.data.password, 12),
          sessionInvalidBefore: new Date()
        }
      });

      return NextResponse.json({
        staff: mapStaffProfile(updated)
      });
    }

    if (isOwner(admin)) {
      const parsed = ownerUpdateStaffSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid staff payload.", details: parsed.error.flatten() }, { status: 400 });
      }

      const data = staffProfileDataFromInput(parsed.data);
      const nextEmail = typeof parsed.data.email === "string" ? parsed.data.email.trim().toLowerCase() : existing.email;

      if (nextEmail !== existing.email) {
        const duplicate = await prisma.adminUser.findUnique({
          where: { email: nextEmail }
        });
        if (duplicate && duplicate.id !== existing.id) {
          return NextResponse.json({ error: "Another staff account already uses this email." }, { status: 409 });
        }
      }

      const nextIsActive = typeof parsed.data.isActive === "boolean" ? parsed.data.isActive : existing.isActive;
      if (existing.role === "owner" && nextIsActive === false) {
        return NextResponse.json({ error: "The owner account cannot be deactivated." }, { status: 400 });
      }

      const updated = await prisma.adminUser.update({
        where: { id },
        data: {
          ...data,
          email: nextEmail,
          isActive: nextIsActive
        }
      });

      return NextResponse.json({
        staff: mapStaffProfile(updated)
      });
    }

    const parsed = selfUpdateStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid staff payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.adminUser.update({
      where: { id },
      data: staffProfileDataFromInput(parsed.data)
    });

    return NextResponse.json({
      staff: mapStaffProfile(updated)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update staff account.");
  }
}
