import { NextRequest, NextResponse } from "next/server";

import { formatBookingAddress } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { ownerPendingBookingTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logEvent } from "@/lib/observability";
import {
  studentPortalBookingRequestInputSchema,
  studentPortalBookingRequestResponseSchema
} from "@/lib/student-portal/contracts";
import { requireStudentFromRequest } from "@/lib/student-portal/session";
import { getCurrentCalendarYear, isDateInCalendarYear } from "@/lib/time";

/**
 * Creates a pending booking request for the authenticated student.
 * Requests are owner-approved before becoming confirmed appointments.
 */
export async function POST(request: NextRequest) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fullNameParts = student.fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = student.firstName.trim() || fullNameParts[0] || "";
  const lastName = student.lastName.trim() || fullNameParts.slice(1).join(" ");

  const body = await request.json().catch(() => null);
  const parsed = studentPortalBookingRequestInputSchema.safeParse(body);
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
      firstName,
      lastName,
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

  const responsePayload = studentPortalBookingRequestResponseSchema.parse({
    request: {
      id: created.id,
      status: created.status,
      requestedStartAt: created.requestedStartAt.toISOString()
    }
  });

  return NextResponse.json(responsePayload, { status: 201 });
}
