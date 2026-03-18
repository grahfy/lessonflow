/**
 * Contact Submission API
 * 
 * Handles public inquiries from the school's contact form.
 * 
 * DESIGN PHILOSOPHY: Resilience First.
 * We prioritize persisting the submission to the database over email delivery.
 * If the database write succeeds but email delivery fails, we still return 
 * a success (202 Accepted) to the user so they know their message is safe.
 */

import { NextResponse } from "next/server";

import { contactSubmissionSchema } from "@/lib/booking-rules";
import { verifyCaptchaGuard } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { ownerNewContactTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";

/**
 * Validates and processes a contact form submission.
 * 
 * SECURITY:
 * 1. Captcha Guard: Prevents bot spam via Turnstile/ReCAPTCHA and rate limiting.
 * 2. Zod Validation: Ensures incoming body matches the expected contact schema.
 * 
 * @param request - Standard Next.js Request object
 * @returns JSON response with submission status
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  
  // STEP 1: Anti-Spam Verification
  // RATIONALE: Public endpoints are prime targets for spam. 
  // We use a window-based rate limit (16 requests per 10 mins per IP).
  const gate = verifyCaptchaGuard({
    body,
    headers: request.headers,
    scope: "contact",
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

  // STEP 2: Schema Validation
  const parsed = contactSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid contact submission.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let createdId: string | null = null;

  try {
    // STEP 3: DB Persistence
    // RATIONALE: We save the record before attempting email delivery. 
    // This handles cases where the SMTP provider is down but the school still 
    // needs to see the message in the Admin Dashboard later.
    const created = await prisma.contactSubmission.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        message: parsed.data.message
      }
    });
    createdId = created.id;
    logEvent("contact.created", { id: created.id, email: created.email });

    // STEP 4: Owner Notification
    const template = ownerNewContactTemplate({
      name: created.name,
      email: created.email,
      phone: created.phone,
      message: created.message
    });

    const emailResult = await sendEmail({
      to: getOwnerEmail(),
      subject: template.subject,
      html: template.html,
      notification: {
        triggerMode: "automated",
        category: "owner_contact"
      }
    });

    // STEP 5: Response Coordination
    // If email failed but DB succeeded, return 202 (Accepted) with a warning.
    if (emailResult.status !== "sent") {
      return NextResponse.json(
        {
          ok: true,
          id: created.id,
          partial: true,
          warning:
            emailResult.status === "suppressed"
              ? "Your message was saved, but owner email notifications are currently disabled in admin settings."
              : "Your message was saved, but we could not deliver the email notification right now.",
          deliveryStatus: emailResult.status
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    // Error Logging
    logError("contact.submit_failed", error, {
      savedSubmissionId: createdId ?? undefined
    });

    // If we have an ID, it means the catch happened during email sending, 
    // so the message is actually saved in the DB.
    if (createdId) {
      return NextResponse.json(
        {
          ok: true,
          id: createdId,
          partial: true,
          warning: "Your message was saved, but we could not finish the email notification right now.",
          deliveryStatus: "failed"
        },
        { status: 202 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "We could not process your message right now. Please try again."
      },
      { status: 500 }
    );
  }
}
