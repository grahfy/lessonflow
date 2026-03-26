import { NextRequest, NextResponse } from "next/server";

import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { bookingLessonPlanInputSchema, lessonPlanSectionsInputSchema } from "@/lib/lesson-plan-contract";
import { deleteBookingLessonPlan, getBookingLessonPlanV2State, upsertBookingLessonPlan, upsertBookingLessonPlanV2 } from "@/lib/lesson-plans";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function formatFieldErrors(issues: Array<{ path: Array<string | number>; message: string }>) {
  return Object.fromEntries(
    issues.map((issue) => [issue.path.join(".") || "lessonPlan", issue.message])
  );
}

async function resolveManagedBooking(request: NextRequest, params: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return {
      admin: null,
      booking: null,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const { id } = await params.params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      assignedTeacherId: true
    }
  });
  if (!booking) {
    return {
      admin,
      booking: null,
      response: NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 })
    };
  }
  if (!canManageAssignedTeacher(admin, booking.assignedTeacherId)) {
    return {
      admin,
      booking: null,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    };
  }

  return {
    admin,
    booking,
    response: null
  };
}

/**
 * Returns the single lesson plan currently attached to a booking.
 */
export async function GET(request: NextRequest, params: Params) {
  const resolved = await resolveManagedBooking(request, params);
  if (resolved.response) {
    return resolved.response;
  }

  const lessonPlan = await getBookingLessonPlanV2State(resolved.booking!.id);
  return NextResponse.json({
    ok: true,
    lessonPlan
  });
}

/**
 * Creates or updates the lesson plan attached to one booking.
 */
export async function PUT(request: NextRequest, params: Params) {
  try {
    const resolved = await resolveManagedBooking(request, params);
    if (resolved.response) {
      return resolved.response;
    }

    const body = await request.json().catch(() => null);

    // V2 payloads have a `sections` array; V1 payloads have flat text fields.
    const isV2 = body && Array.isArray(body.sections);

    if (isV2) {
      const parsed = lessonPlanSectionsInputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Invalid lesson-plan payload.", fieldErrors: formatFieldErrors(parsed.error.issues) },
          { status: 400 }
        );
      }
      const lessonPlan = await upsertBookingLessonPlanV2(resolved.admin!, resolved.booking!.id, parsed.data);
      return NextResponse.json({ ok: true, lessonPlan });
    }

    const parsed = bookingLessonPlanInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid lesson-plan payload.",
          fieldErrors: formatFieldErrors(parsed.error.issues)
        },
        { status: 400 }
      );
    }

    const lessonPlan = await upsertBookingLessonPlan(resolved.admin!, resolved.booking!.id, parsed.data);
    return NextResponse.json({
      ok: true,
      lessonPlan
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to save lesson plan.");
  }
}

/**
 * Clears the lesson plan attached to one booking.
 */
export async function DELETE(request: NextRequest, params: Params) {
  try {
    const resolved = await resolveManagedBooking(request, params);
    if (resolved.response) {
      return resolved.response;
    }

    await deleteBookingLessonPlan(resolved.booking!.id);
    return NextResponse.json({
      ok: true,
      lessonPlan: null
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to clear lesson plan.");
  }
}
