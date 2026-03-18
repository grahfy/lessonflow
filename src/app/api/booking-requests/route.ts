/**
 * Public Booking Requests API
 * 
 * Handles incoming lesson requests from the school's public booking form.
 * 
 * DESIGN PHILOSOPHY:
 * 1. Accessibility: GET is disabled to prevent data leakage of private requests.
 * 2. Geo-Fencing: Server-side validation ensures only AU residents can submit.
 * 3. Atomic Grace: The request is persisted to DB before owner notification
 *    and returns partial success if email delivery is degraded.
 */

import { NextResponse } from "next/server";

import { bookingRequestSchema, formatBookingAddress } from "@/lib/booking-rules";
import { verifyCaptchaGuard } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { resolveAutoAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import { resolveRequestCountry } from "@/lib/geo-country";
import { sendOwnerBookingEmail } from "@/lib/booking-events";
import { logError, logEvent } from "@/lib/observability";

/** Timeout for the outbound notification email to the school owner. */
const OWNER_BOOKING_EMAIL_TIMEOUT_MS = 12000;

/**
 * Wraps the email service in a timeout to prevent the HTTP request from 
 * hanging if the SMTP provider is unresponsive.
 * 
 * @param input - The booking request payload for the email template
 * @returns Result status of the notification attempt
 */
async function sendOwnerBookingEmailWithTimeout(input: Parameters<typeof sendOwnerBookingEmail>[0]) {
  return Promise.race([
    sendOwnerBookingEmail(input),
    new Promise<Awaited<ReturnType<typeof sendOwnerBookingEmail>>>((resolve) => {
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
 * GET: Method Not Allowed.
 * RATIONALE: Public listing of booking requests is a security risk.
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

/**
 * POST: Handles the submission of a new booking request.
 * 
 * SECURITY & VALIDATION:
 * 1. Captcha: Throttles bots and automated spam.
 * 2. Geo-Blocking: Uses header-based geolocation to enforce domestic-only service.
 * 3. Zod Parsing: Strict type enforcement of the request body.
 * 
 * LOGIC:
 * - Attempts to match the requester to an existing Customer profile.
 * - Enforces business rules (e.g., new customers restricted to 30-min intro lessons).
 * - Persists the 'pending' request.
 * - Triggers an asynchronous email to the owner.
 * 
 * @param request - Incoming Next.js Request
 * @returns Progress status, including DB record ID
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  
  // STEP 1: Anti-Spam Gate
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

  // STEP 2: Geo-Fencing
  // RATIONALE: We only provide lessons in Australia. Server-side check prevents vpn/bot bypass.
  const resolvedCountry = await resolveRequestCountry(request.headers);
  if (resolvedCountry.country && resolvedCountry.country !== "AU") {
    return NextResponse.json(
      {
        error: "Booking requests are currently available to Australian residents only."
      },
      { status: 403 }
    );
  }

  // STEP 3: Schema Validation
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

    const assignedTeacherId = await resolveAutoAssignedTeacherId({
      db: prisma,
      preferredTeacherId: existingCustomer?.primaryTeacherId ?? null
    });

    // STEP 4: DB Persistence
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
        assignedTeacherId,
        // Link to existing customer if found
        customerId: existingCustomer?.id ?? null
      }
    });
    createdId = created.id;
    logEvent("booking_request.created", { id: created.id, email: created.email, recurring: created.isRecurring });

    // STEP 5: Owner Notification
    const emailResult = await sendOwnerBookingEmailWithTimeout({
      bookingRequest: created
    });

    // Mirror the contact route behavior: the request was saved, but owner notification delivery
    // may be delayed if SMTP/Gmail is unavailable.
    if (emailResult.status !== "sent") {
      return NextResponse.json(
        {
          ok: true,
          id: created.id,
          partial: true,
          warning:
            emailResult.status === "suppressed"
              ? "Your booking request was saved, but owner booking-request notifications are currently disabled in admin settings."
              : "Your booking request was saved, but we could not deliver the owner notification email right now.",
          deliveryStatus: emailResult.status
        },
        { status: 202 }
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
          ok: true,
          id: createdId,
          partial: true,
          warning: "Your booking request was saved, but we could not finish the owner notification right now.",
          deliveryStatus: "failed"
        },
        { status: 202 }
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
