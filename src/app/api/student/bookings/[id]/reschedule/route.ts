import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { ownerRescheduleRequestTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import {
  studentPortalRescheduleRequestInputSchema,
  studentPortalRescheduleRequestResponseSchema
} from "@/lib/student-portal/contracts";
import { requireStudentFromRequest } from "@/lib/student-portal/session";
import { getCurrentCalendarYear, isDateInCalendarYear } from "@/lib/time";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Creates a pending reschedule request for an upcoming booking owned by the
 * authenticated student. The owner/assigned teacher later approves (moving the
 * booking) or declines. Only one pending request per booking is allowed.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    // Throttle reschedule writes per IP: each request fans out an owner email, so
    // we cap abuse consistent with other student portal entry points (login).
    const rateLimit = consumeRateLimit({
      key: `student-reschedule:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 15 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many reschedule requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const booking = await prisma.booking.findUnique({
      where: { id }
    });
    if (!booking || booking.customerId !== student.id) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (booking.status !== "approved") {
      return NextResponse.json(
        { error: "Only confirmed bookings can be rescheduled." },
        { status: 400 }
      );
    }

    const now = new Date();
    if (booking.startAt <= now) {
      return NextResponse.json(
        { error: "Only upcoming bookings can be rescheduled." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = studentPortalRescheduleRequestInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid reschedule payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const requestedStartAt = new Date(parsed.data.requestedStartAt);
    if (Number.isNaN(requestedStartAt.getTime()) || requestedStartAt <= now) {
      return NextResponse.json(
        { error: "Requested lesson time must be in the future." },
        { status: 400 }
      );
    }

    const currentYear = getCurrentCalendarYear();
    if (!isDateInCalendarYear(requestedStartAt, currentYear)) {
      return NextResponse.json(
        { error: `Requested lesson time must be within the current calendar year (${currentYear}).` },
        { status: 400 }
      );
    }

    // Single-pending guard: reject if this booking already has an unresolved
    // reschedule request so the admin queue stays unambiguous.
    const existingPending = await prisma.bookingRescheduleRequest.findFirst({
      where: {
        bookingId: booking.id,
        status: "pending"
      }
    });
    if (existingPending) {
      return NextResponse.json(
        { error: "A reschedule request is already pending for this booking." },
        { status: 409 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const rescheduleRequest = await tx.bookingRescheduleRequest.create({
        data: {
          bookingId: booking.id,
          requestedStartAt,
          reason: parsed.data.reason?.trim() || null,
          status: "pending"
        }
      });

      await tx.bookingAuditLog.create({
        data: {
          bookingId: booking.id,
          action: "reschedule_requested",
          details: `Student requested reschedule to ${requestedStartAt.toISOString()} (${student.id}).`
        }
      });

      return rescheduleRequest;
    });

    logEvent("student_portal.reschedule_request.created", {
      id: created.id,
      bookingId: booking.id,
      customerId: student.id,
      requestedStartAt: created.requestedStartAt.toISOString()
    });

    const responsePayload = studentPortalRescheduleRequestResponseSchema.parse({
      rescheduleRequest: {
        id: created.id,
        bookingId: booking.id,
        status: created.status,
        requestedStartAt: created.requestedStartAt.toISOString()
      }
    });

    // Notify the owner/assigned teacher. Delivery is best-effort: the request is
    // already persisted, so a failed email returns a partial-success warning
    // rather than rolling back the student's action.
    try {
      const template = ownerRescheduleRequestTemplate({
        name: booking.name,
        currentWhen: booking.startAt,
        requestedWhen: created.requestedStartAt,
        reason: created.reason
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
          studentPortalRescheduleRequestResponseSchema.parse({
            ...responsePayload,
            partial: true,
            warning:
              sendResult.status === "suppressed"
                ? "Reschedule request submitted, but owner booking-request notifications are currently disabled in admin settings."
                : "Reschedule request submitted, but we could not deliver the owner notification email right now.",
            deliveryStatus: sendResult.status
          }),
          { status: 201 }
        );
      }
    } catch (error) {
      logError("student_portal.reschedule_request.owner_notification_failed", error, {
        rescheduleRequestId: created.id,
        bookingId: booking.id,
        customerId: student.id
      });
      return NextResponse.json(
        studentPortalRescheduleRequestResponseSchema.parse({
          ...responsePayload,
          partial: true,
          warning: "Reschedule request submitted, but we could not deliver the owner notification email right now.",
          deliveryStatus: "failed"
        }),
        { status: 201 }
      );
    }

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to submit reschedule request.");
  }
}
