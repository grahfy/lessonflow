import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { canManageAssignedTeacher } from "@/lib/admin/permissions";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { getBookingEnd } from "@/lib/booking-rules";
import { sendCustomerBookingMovedEmail } from "@/lib/booking-events";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";
import { customerRescheduleDeclinedTemplate } from "@/lib/email/templates";
import { logEvent } from "@/lib/observability";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const patchSchema = z.object({
  action: z.enum(["approve", "decline"])
});

/**
 * Resolves a student-initiated reschedule request.
 *
 * Kept on a dedicated route (separate from the booking PATCH endpoint) so the
 * reschedule workflow owns its own validation and side effects. Approve replicates
 * the minimal "move" logic from the booking route (recompute endAt, audit + email)
 * rather than coupling to it; decline marks the request and notifies the student.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const rescheduleRequest = await prisma.bookingRescheduleRequest.findUnique({
      where: { id },
      include: { booking: true }
    });
    if (!rescheduleRequest) {
      return NextResponse.json({ error: "Reschedule request not found." }, { status: 404 });
    }
    // Only owner or the booking's assigned teacher may resolve a request.
    if (!canManageAssignedTeacher(admin, rescheduleRequest.booking.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (rescheduleRequest.status !== "pending") {
      return NextResponse.json(
        { error: "This reschedule request has already been resolved." },
        { status: 409 }
      );
    }

    const booking = rescheduleRequest.booking;
    const now = new Date();

    if (parsed.data.action === "approve") {
      // Guard against approving a stale request whose target time is now in the past.
      if (rescheduleRequest.requestedStartAt <= now) {
        return NextResponse.json(
          { error: "The requested lesson time is in the past." },
          { status: 400 }
        );
      }

      const oldWhen = booking.startAt;
      const newStart = rescheduleRequest.requestedStartAt;

      // Move the booking and resolve the request atomically so the portal never
      // shows a still-pending request against an already-moved booking.
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            startAt: newStart,
            endAt: getBookingEnd(newStart, booking.lessonDuration, booking.customDurationMinutes),
            modifiedById: admin.id
          }
        });
        await tx.bookingRescheduleRequest.update({
          where: { id: rescheduleRequest.id },
          data: {
            status: "approved",
            resolvedAt: now,
            resolvedById: admin.id
          }
        });
        await tx.bookingAuditLog.create({
          data: {
            bookingId: booking.id,
            actorId: admin.id,
            action: "reschedule_approved",
            details: `Approved reschedule to ${newStart.toISOString()}`
          }
        });
        // Write the supplementary "moved" audit durably inside the transaction so the move is
        // fully traced even when the customer email is later suppressed or fails to deliver.
        await tx.bookingAuditLog.create({
          data: {
            bookingId: booking.id,
            actorId: admin.id,
            action: "moved",
            details: `Moved to ${newStart.toISOString()} via reschedule approval`
          }
        });
      });

      logEvent("admin.reschedule_request.approved", {
        id: rescheduleRequest.id,
        bookingId: booking.id,
        actorId: admin.id,
        newStartAt: newStart.toISOString()
      });

      // Send after the DB write succeeds so the customer email reflects persisted
      // booking times. The "moved" audit row is written durably inside the transaction
      // above, so it is NOT passed here (which would double-write only on delivered emails).
      const deliveryResult = await sendCustomerBookingMovedEmail({
        email: booking.email,
        name: booking.name,
        oldWhen,
        newWhen: newStart
      });

      if (deliveryResult.status !== "sent") {
        return NextResponse.json(
          {
            ok: true,
            partial: true,
            warning:
              deliveryResult.status === "suppressed"
                ? "Reschedule approved, but automated customer booking-update emails are disabled in admin settings."
                : deliveryResult.error ||
                  "Reschedule approved, but the notification email could not be delivered.",
            deliveryStatus: deliveryResult.status
          },
          { status: 200 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Decline: mark the request declined; the booking is unchanged.
    await prisma.$transaction(async (tx) => {
      await tx.bookingRescheduleRequest.update({
        where: { id: rescheduleRequest.id },
        data: {
          status: "declined",
          resolvedAt: now,
          resolvedById: admin.id
        }
      });
      await tx.bookingAuditLog.create({
        data: {
          bookingId: booking.id,
          actorId: admin.id,
          action: "reschedule_declined",
          details: `Declined reschedule to ${rescheduleRequest.requestedStartAt.toISOString()}`
        }
      });
    });

    logEvent("admin.reschedule_request.declined", {
      id: rescheduleRequest.id,
      bookingId: booking.id,
      actorId: admin.id
    });

    const template = customerRescheduleDeclinedTemplate({
      name: booking.name,
      currentWhen: booking.startAt,
      requestedWhen: rescheduleRequest.requestedStartAt
    });
    const deliveryResult = await sendEmail({
      to: booking.email,
      subject: template.subject,
      html: template.html,
      notification: {
        triggerMode: "automated",
        category: "customer_booking_updates"
      }
    });

    if (deliveryResult.status !== "sent") {
      return NextResponse.json(
        {
          ok: true,
          partial: true,
          warning:
            deliveryResult.status === "suppressed"
              ? "Reschedule declined, but automated customer booking-update emails are disabled in admin settings."
              : deliveryResult.error ||
                "Reschedule declined, but the notification email could not be delivered.",
          deliveryStatus: deliveryResult.status
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to resolve reschedule request.");
  }
}
