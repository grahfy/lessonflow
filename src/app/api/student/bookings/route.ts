import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { formatBookingAddress, lessonDurationSchema, lessonModeSchema } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { ownerPendingBookingTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logEvent } from "@/lib/observability";
import { requireStudentFromRequest } from "@/lib/student-portal/session";
import { getCurrentCalendarYear, isDateInCalendarYear } from "@/lib/time";

const createStudentBookingSchema = z.object({
  requestedStartAt: z.string().datetime({ offset: true }),
  lessonMode: lessonModeSchema.optional(),
  lessonDuration: lessonDurationSchema.default("min60"),
  customDurationMinutes: z.coerce.number().int().min(15).max(300).nullable().optional(),
  notes: z.string().trim().max(1000).optional()
});

/**
 * Creates a pending booking request for the authenticated student.
 * Requests are owner-approved before becoming confirmed appointments.
 */
export async function POST(request: NextRequest) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createStudentBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking request payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const requestedStartAt = new Date(parsed.data.requestedStartAt);
  const now = new Date();
  if (Number.isNaN(requestedStartAt.getTime()) || requestedStartAt <= now) {
    return NextResponse.json({ error: "Requested lesson time must be in the future." }, { status: 400 });
  }

  const currentYear = getCurrentCalendarYear();
  if (!isDateInCalendarYear(requestedStartAt, currentYear)) {
    return NextResponse.json(
      { error: `Requested lesson time must be within the current calendar year (${currentYear}).` },
      { status: 400 }
    );
  }

  // Student portal requests reuse the student's saved address so the owner/admin sees the same
  // location context as the original customer profile.
  const address = formatBookingAddress({
    unitNumber: student.unitNumber ?? undefined,
    houseNumber: student.houseNumber,
    streetName: student.streetName,
    streetType: student.streetType,
    suburb: student.suburb,
    state: student.state,
    postcode: student.postcode
  });

  // Student portal creates pending requests only; admin approval converts them into bookings.
  const created = await prisma.bookingRequest.create({
    data: {
      name: student.fullName,
      email: student.email,
      phone: student.phone,
      address,
      unitNumber: student.unitNumber,
      houseNumber: student.houseNumber,
      streetName: student.streetName,
      streetType: student.streetType,
      suburb: student.suburb,
      state: student.state,
      postcode: student.postcode,
      lessonMode: parsed.data.lessonMode ?? student.lessonMode,
      skillLevel: student.skillLevel,
      lessonDuration: parsed.data.lessonDuration,
      customDurationMinutes: parsed.data.customDurationMinutes ?? null,
      requestedStartAt,
      notes: parsed.data.notes || null,
      isRecurring: false,
      recurrenceEndAt: null,
      customerId: student.id
    }
  });

  logEvent("student_portal.booking_request.created", {
    id: created.id,
    customerId: student.id,
    requestedStartAt: created.requestedStartAt.toISOString()
  });

  const template = ownerPendingBookingTemplate({
    name: created.name,
    email: created.email,
    phone: created.phone,
    address: created.address,
    lessonMode: created.lessonMode,
    skillLevel: created.skillLevel,
    lessonDuration: created.lessonDuration,
    customDurationMinutes: created.customDurationMinutes,
    requestedStartAt: created.requestedStartAt,
    isRecurring: created.isRecurring,
    recurrenceEndAt: created.recurrenceEndAt
  });
  await sendEmail({
    to: getOwnerEmail(),
    subject: template.subject,
    html: template.html
  });

  return NextResponse.json(
    {
      request: {
        id: created.id,
        status: created.status,
        requestedStartAt: created.requestedStartAt.toISOString()
      }
    },
    { status: 201 }
  );
}
