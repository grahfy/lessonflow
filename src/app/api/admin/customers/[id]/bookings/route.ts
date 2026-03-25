import { NextRequest, NextResponse } from "next/server";

import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Returns one customer's booking history for the admin customer modal.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(_request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: {
        id
      }
    });

    if (!customer || customer.isArchived) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        customerId: customer.id,
        ...(admin.role === "teacher" ? { assignedTeacherId: admin.id } : {})
      },
      include: {
        assignedTeacher: {
          select: {
            id: true,
            displayName: true
          }
        }
      },
      orderBy: {
        startAt: "desc"
      }
    });

    return NextResponse.json({
      bookings: bookings.map((booking) => ({
        id: booking.id,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        status: booking.status,
        lessonMode: booking.lessonMode,
        lessonDuration: booking.lessonDuration,
        customDurationMinutes: booking.customDurationMinutes,
        notes: booking.notes,
        assignedTeacher: booking.assignedTeacher
          ? {
              id: booking.assignedTeacher.id,
              displayName: booking.assignedTeacher.displayName
            }
          : null
      }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load booking history.");
  }
}
