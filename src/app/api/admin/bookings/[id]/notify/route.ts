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

    const body = await request.json().catch(() => null);
    const parsed = notifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notify payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.action === "reminder") {
      await sendCustomerReminderEmail({
        email: booking.email,
        name: booking.name,
        when: booking.startAt
      });

      await prisma.bookingAuditLog.create({
        data: {
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

    await sendCustomerCustomEmail({
      email: booking.email,
      name: booking.name,
      subject: parsed.data.subject,
      message: parsed.data.message
    });

    await prisma.bookingAuditLog.create({
      data: {
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
