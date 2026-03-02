import { NextResponse } from "next/server";

import { bookingRequestSchema, formatBookingAddress } from "@/lib/booking-rules";
import { verifyCaptchaGuard } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { ownerPendingBookingTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";

const OWNER_BOOKING_EMAIL_TIMEOUT_MS = 12000;

async function sendOwnerBookingEmailWithTimeout(input: Parameters<typeof sendEmail>[0]) {
  return Promise.race([
    sendEmail(input),
    new Promise<Awaited<ReturnType<typeof sendEmail>>>((resolve) => {
      setTimeout(() => {
        resolve({
          status: "failed",
          error: `Owner notification email timed out after ${OWNER_BOOKING_EMAIL_TIMEOUT_MS}ms`
        });
      }, OWNER_BOOKING_EMAIL_TIMEOUT_MS);
    })
  ]);
}

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
  const gate = verifyCaptchaGuard({
    body,
    headers: request.headers,
    scope: "booking-request",
    limit: 16,
    windowMs: 10 * 60 * 1000
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.message, code: gate.code },
      {
        status: gate.status,
        headers: gate.retryAfterSeconds ? { "Retry-After": String(gate.retryAfterSeconds) } : undefined
      }
    );
  }

  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid booking request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let createdId: string | null = null;

  try {
    /**
     * CUSTOMER MATCHING LOGIC
     * RATIONALE: To prevent duplicate records and maintain continuity, we attempt 
     * to link this booking request to an existing customer profile.
     * 
     * CRITERIA: 
     * 1. Full name match (normalized firstName + lastName)
     * 2. Normalized phone match
     * 3. Postcode match
     */
    const normalizedName = [parsed.data.firstName, parsed.data.lastName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .trim();
    const normalizedPhone = parsed.data.phone.replace(/\D/g, "");
    
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        isArchived: false,
        normalizedFullName: normalizedName,
        normalizedPhone: normalizedPhone,
        postcode: parsed.data.postcode
      }
    });

    /**
     * DURATION ENFORCEMENT
     * RATIONALE: New customers (not found in the system) are restricted to a 
     * 30-minute introductory lesson. Existing customers can request their 
     * preferred duration.
     */
    let finalDuration = parsed.data.lessonDuration;
    let finalCustomDuration = parsed.data.customDurationMinutes ?? null;

    if (!existingCustomer) {
      finalDuration = "min30";
      finalCustomDuration = null;
    }

    // Persist first so the admin can review the request even if outbound email delivery is degraded.
    const created = await prisma.bookingRequest.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
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
        lessonDuration: finalDuration,
        customDurationMinutes: finalCustomDuration,
        requestedStartAt: new Date(parsed.data.requestedStartAt),
        notes: parsed.data.notes,
        isRecurring: parsed.data.isRecurring,
        recurrenceEndAt: parsed.data.recurrenceEndAt ? new Date(parsed.data.recurrenceEndAt) : null,
        // Link to existing customer if found
        customerId: existingCustomer?.id ?? null
      }
    });
    createdId = created.id;
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

    const emailResult = await sendOwnerBookingEmailWithTimeout({
      to: getOwnerEmail(),
      subject: template.subject,
      html: template.html
    });

    // Mirror the contact route behavior: the request was saved, but owner notification delivery
    // may be delayed if SMTP/Gmail is unavailable.
    if (emailResult.status !== "sent") {
      return NextResponse.json(
        {
          ok: false,
          id: created.id,
          error: "Your booking request was saved, but we could not deliver the owner notification email right now.",
          deliveryStatus: emailResult.status
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    logError("booking_request.submit_failed", error, {
      savedBookingRequestId: createdId ?? undefined
    });

    if (createdId) {
      return NextResponse.json(
        {
          ok: false,
          id: createdId,
          error: "Your booking request was saved, but we could not finish the owner notification right now."
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "We could not process your booking request right now. Please try again."
      },
      { status: 500 }
    );
  }
}
