import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendCustomerCustomEmail, sendCustomerReminderEmail } from "@/lib/booking-events";
import { canManageAssignedTeacher } from "@/lib/admin/permissions";
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
 * Sends reminder/custom email notifications for a confirmed booking and records an audit log entry.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const booking = await prisma.booking.findUnique({
      where: { id }
    });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (!canManageAssignedTeacher(admin, booking.assignedTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = notifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notify payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.action === "reminder") {
      // Reminder emails use the shared booking reminder template to match automated reminder copy.
      await sendCustomerReminderEmail({
        email: booking.email,
        name: booking.name,
        when: booking.startAt,
        audit: {
          bookingId: booking.id,
          actorId: admin.id,
          action: "reminder_sent"
        }
      });

      return NextResponse.json({ ok: true });
    }

    if (!parsed.data.subject || !parsed.data.message) {
      return NextResponse.json({ error: "Custom notifications require subject and message." }, { status: 400 });
    }

    // Custom emails still route through the shared booking-events wrapper so outbound logging and
    // transport fallback behavior remain consistent.
    await sendCustomerCustomEmail({
      email: booking.email,
      name: booking.name,
      subject: parsed.data.subject,
      message: parsed.data.message,
      audit: {
        bookingId: booking.id,
        actorId: admin.id,
        action: "custom_email_sent"
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Notification failed.");
  }
}
