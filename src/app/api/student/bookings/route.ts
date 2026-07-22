import { NextRequest, NextResponse } from "next/server";

import { resolveAutoAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import { formatBookingAddress, getDurationMinutes } from "@/lib/booking-rules";
import { deriveAvailableSlots } from "@/lib/booking/availability";
import { getBusinessHours, toWeeklyBusinessHours } from "@/lib/booking/business-hours";
import { prisma } from "@/lib/db";
import { ownerPendingBookingTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { durationMinutesToBookingPayload } from "@/lib/lesson-duration-utils";
import { getActiveLessonPricingMap } from "@/lib/lesson-pricing";
import {
  evaluatePublicGeoblocking,
  logPublicGeoblockingBlock,
  PUBLIC_GEOBLOCKED_MESSAGE
} from "@/lib/geoblocking-settings";
import { logError, logEvent } from "@/lib/observability";
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

  // Apply the same public geoblocking policy as the anonymous booking form so
  // the region restriction is enforced consistently across booking entry points.
  const geoblocking = await evaluatePublicGeoblocking(request.headers);
  if (!geoblocking.allowed) {
    logPublicGeoblockingBlock("student_portal_booking", request.headers, geoblocking);
    return NextResponse.json({ error: PUBLIC_GEOBLOCKED_MESSAGE }, { status: 403 });
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

  // Lesson length has two encodings on the wire: the canonical
  // `durationMinutes`, and the legacy `lessonDuration` + `customDurationMinutes`
  // pair. `durationMinutes` wins when present.
  //
  // CONFLICT: a caller that sends BOTH encodings disagreeing with each other is
  // confused, so it gets a 400 rather than a silent winner — the whole reason
  // this field exists is that a dropped duration produced a wrong-length lesson
  // and, downstream, wrong billing. The raw body is consulted because
  // `lessonDuration` carries a zod default, so after parsing "absent" and
  // "explicitly min60" are indistinguishable.
  const rawBody = (body ?? {}) as Record<string, unknown>;
  if (
    parsed.data.durationMinutes !== undefined &&
    (rawBody.lessonDuration !== undefined || rawBody.customDurationMinutes != null) &&
    getDurationMinutes(parsed.data.lessonDuration, parsed.data.customDurationMinutes) !==
      parsed.data.durationMinutes
  ) {
    return NextResponse.json(
      { error: "Conflicting lesson length: send durationMinutes or lessonDuration, not both." },
      { status: 400 }
    );
  }

  // An arbitrary length is rejected, not honoured. Skipped when the owner has
  // configured no active pricing at all, matching GET /api/student/booking-slots
  // — otherwise an unconfigured school could not take a booking. The legacy pair
  // is deliberately not price-checked here: min30/min60 are structurally safe
  // and every existing caller depends on them being accepted.
  if (parsed.data.durationMinutes !== undefined) {
    const activeDurations = [...(await getActiveLessonPricingMap()).keys()];
    if (activeDurations.length > 0 && !activeDurations.includes(parsed.data.durationMinutes)) {
      return NextResponse.json(
        { error: "That lesson length is not currently offered." },
        { status: 400 }
      );
    }
  }

  // One source of truth for both the availability check and the stored row.
  // The legacy branch keeps the caller's exact fields so existing payloads
  // persist byte-for-byte as they do today.
  const durationFields =
    parsed.data.durationMinutes !== undefined
      ? durationMinutesToBookingPayload(parsed.data.durationMinutes)
      : {
          lessonDuration: parsed.data.lessonDuration,
          customDurationMinutes: parsed.data.customDurationMinutes ?? null
        };

  // Resolve the assignee BEFORE validating availability, so the calendar we
  // check is always the calendar the request lands on. `primaryTeacherId` is
  // only a *preference*: `resolveAutoAssignedTeacherId` falls back to the single
  // assignable staff member whenever that teacher is no longer active, which
  // happens for real when an owner deactivates a departing teacher without
  // reassigning their students. Validating the preference and assigning the
  // fallback would check a calendar nobody is booked on.
  //
  // Never sourced from the body — the input schema carries no teacher id — so a
  // student still cannot aim this at a teacher they are not assigned to.
  const assignedTeacherId = await resolveAutoAssignedTeacherId({
    db: prisma,
    preferredTeacherId: student.primaryTeacherId
  });

  // AC-61: the requested time is re-derived server-side and must be one of the
  // slots this student could actually have been offered. The client's slot list
  // is advisory only — a hand-crafted payload gets the identical check.
  //
  // A null assignee (no active staff at all) has no calendar to collide with, so
  // business hours, the slot grid and the notice window are still enforced
  // against an empty booking list and the request is accepted. That is the same
  // standing decision as an unassigned student: the request is pending, a human
  // approves it, and `assertTeacherSlotFree` skips null-teacher rows by design.
  // Rejecting here would only move the failure to a worse place.
  //
  // Deliberately NOT a hold or a reservation: two students may request the same
  // slot. The owner approves, and the real overlap guard runs at approval time.
  const durationMinutes = getDurationMinutes(
    durationFields.lessonDuration,
    durationFields.customDurationMinutes
  );
  const businessHours = await getBusinessHours();
  const teacherBookings = assignedTeacherId
    ? await prisma.booking.findMany({
        where: {
          assignedTeacherId,
          status: { not: "cancelled" },
          startAt: { lt: new Date(requestedStartAt.getTime() + durationMinutes * 60_000) },
          endAt: { gt: requestedStartAt }
        },
        select: { id: true, startAt: true, endAt: true }
      })
    : [];

  // `deriveAvailableSlots` filters slots on their start into the half-open
  // `[rangeStart, rangeEnd)` window, so a one-millisecond window can only ever
  // contain the requested instant itself. Non-empty therefore means "this exact
  // start is a real slot" — grid alignment, business hours, minimum notice and
  // booking overlap all enforced by the same code path that produced the list.
  const matchingSlots = deriveAvailableSlots({
    rangeStart: requestedStartAt,
    rangeEnd: new Date(requestedStartAt.getTime() + 1),
    businessHours: toWeeklyBusinessHours(businessHours.weekdays),
    durationMinutes,
    bookings: teacherBookings,
    now,
    slotMinutes: businessHours.slotGranularityMinutes,
    minimumNoticeHours: businessHours.minimumNoticeHours
  });
  if (matchingSlots.length === 0) {
    return NextResponse.json(
      { error: "That lesson time is not available. Please pick one of the offered times." },
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
      lessonDuration: durationFields.lessonDuration,
      customDurationMinutes: durationFields.customDurationMinutes,
      assignedTeacherId,
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

  const responsePayload = studentPortalBookingRequestResponseSchema.parse({
    request: {
      id: created.id,
      status: created.status,
      requestedStartAt: created.requestedStartAt.toISOString()
    }
  });

  try {
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
    const sendResult = await sendEmail({
      to: getOwnerEmail(),
      subject: template.subject,
      html: template.html,
      notification: {
        triggerMode: "automated",
        category: "owner_booking_requests"
      }
    });

    if (sendResult.status !== "sent") {
      return NextResponse.json(
        studentPortalBookingRequestResponseSchema.parse({
          ...responsePayload,
          partial: true,
          warning:
            sendResult.status === "suppressed"
              ? "Lesson request submitted, but owner booking-request notifications are currently disabled in admin settings."
              : "Lesson request submitted, but we could not deliver the owner notification email right now.",
          deliveryStatus: sendResult.status
        }),
        { status: 201 }
      );
    }
  } catch (error) {
    logError("student_portal.booking_request.owner_notification_failed", error, {
      bookingRequestId: created.id,
      customerId: student.id
    });
    return NextResponse.json(
      studentPortalBookingRequestResponseSchema.parse({
        ...responsePayload,
        partial: true,
        warning: "Lesson request submitted, but we could not deliver the owner notification email right now.",
        deliveryStatus: "failed"
      }),
      { status: 201 }
    );
  }

  return NextResponse.json(responsePayload, { status: 201 });
}
