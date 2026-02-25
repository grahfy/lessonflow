import { NextResponse } from "next/server";

import { bookingRequestSchema, formatBookingAddress } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { ownerPendingBookingTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logEvent } from "@/lib/observability";

/**
 * Public booking-request submission endpoint.
 *
 * `GET` is intentionally disabled so pending booking requests cannot be listed publicly. `POST`
 * accepts and persists requests, then notifies the owner using the shared email template/service.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed" },
    {
      status: 405,
      headers: {
        Allow: "POST"
      }
    }
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid booking request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Persist first so the admin can review the request even if outbound email delivery is degraded.
  const created = await prisma.bookingRequest.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address: formatBookingAddress(parsed.data),
      unitNumber: parsed.data.unitNumber,
      houseNumber: parsed.data.houseNumber,
      streetName: parsed.data.streetName,
      streetType: parsed.data.streetType,
      suburb: parsed.data.suburb,
      state: parsed.data.state,
      postcode: parsed.data.postcode,
      lessonMode: parsed.data.lessonMode,
      skillLevel: parsed.data.skillLevel,
      lessonDuration: parsed.data.lessonDuration,
      customDurationMinutes: parsed.data.customDurationMinutes ?? null,
      requestedStartAt: new Date(parsed.data.requestedStartAt),
      notes: parsed.data.notes,
      isRecurring: parsed.data.isRecurring,
      recurrenceEndAt: parsed.data.recurrenceEndAt ? new Date(parsed.data.recurrenceEndAt) : null
    }
  });
  logEvent("booking_request.created", { id: created.id, email: created.email, recurring: created.isRecurring });

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

  return NextResponse.json({ ok: true, id: created.id });
}
