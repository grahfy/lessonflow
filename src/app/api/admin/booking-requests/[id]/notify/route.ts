import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendCustomerCustomEmail, sendCustomerReminderEmail } from "@/lib/booking-events";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const notifySchema = z.object({
  action: z.enum(["reminder", "custom"]),
  subject: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().min(1).max(4000).optional()
});

/**
 * Sends reminder/custom notifications for a booking request and records booking-audit entries.
 *
 * When a request has no linked booking yet, audit entries keep the `requestId` in details so the
 * action remains traceable in admin history.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const bookingRequest = await prisma.bookingRequest.findUnique({
      where: { id }
    });
    if (!bookingRequest) {
      return NextResponse.json({ error: "Booking request not found." }, { status: 404 });
    }

    const linkedBooking = await prisma.booking.findFirst({
      where: { requestId: id },
      select: { id: true },
      orderBy: {
        createdAt: "desc"
      }
    });

    const body = await request.json().catch(() => null);
    const parsed = notifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notify payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.action === "reminder") {
      await sendCustomerReminderEmail({
        email: bookingRequest.email,
        name: bookingRequest.name,
        when: bookingRequest.requestedStartAt,
        audit: {
          bookingId: linkedBooking?.id,
          actorId: admin.id,
          action: "reminder_sent",
          details: linkedBooking ? `requestId=${id}` : `requestId=${id}; no_linked_booking`
        }
      });

      return NextResponse.json({ ok: true });
    }

    if (!parsed.data.subject || !parsed.data.message) {
      return NextResponse.json({ error: "Custom notifications require subject and message." }, { status: 400 });
    }

    // Custom request notifications intentionally reuse the same customer-email wrapper as bookings.
    await sendCustomerCustomEmail({
      email: bookingRequest.email,
      name: bookingRequest.name,
      subject: parsed.data.subject,
      message: parsed.data.message,
      audit: {
        bookingId: linkedBooking?.id,
        actorId: admin.id,
        action: "custom_email_sent",
        details: linkedBooking ? `requestId=${id}` : `requestId=${id}; no_linked_booking`
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Notification failed.");
  }
}
