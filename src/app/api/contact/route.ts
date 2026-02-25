import { NextResponse } from "next/server";

import { contactSubmissionSchema } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { ownerNewContactTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = contactSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid contact submission.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let createdId: string | null = null;

  try {
    // Persist the message first so the studio can recover submissions even if
    // the outbound email provider (SMTP/Gmail API) is temporarily unavailable.
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

    const template = ownerNewContactTemplate({
      name: created.name,
      email: created.email,
      phone: created.phone,
      message: created.message
    });

    const emailResult = await sendEmail({
      to: getOwnerEmail(),
      subject: template.subject,
      html: template.html
    });

    if (emailResult.status !== "sent") {
      return NextResponse.json(
        {
          ok: false,
          id: created.id,
          error: "Your message was saved, but we could not deliver the email notification right now.",
          deliveryStatus: emailResult.status
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    // Always return JSON so the client can render a precise error instead of
    // falling back to a generic browser/network failure message.
    logError("contact.submit_failed", error, {
      savedSubmissionId: createdId ?? undefined
    });

    if (createdId) {
      return NextResponse.json(
        {
          ok: false,
          id: createdId,
          error: "Your message was saved, but we could not finish the email notification right now."
        },
        { status: 503 }
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
