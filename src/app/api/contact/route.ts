import { NextResponse } from "next/server";

import { contactSubmissionSchema } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { ownerNewContactTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getOwnerEmail } from "@/lib/env";
import { logEvent } from "@/lib/observability";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = contactSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid contact submission.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const created = await prisma.contactSubmission.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      message: parsed.data.message
    }
  });
  logEvent("contact.created", { id: created.id, email: created.email });

  const template = ownerNewContactTemplate({
    name: created.name,
    email: created.email,
    phone: created.phone,
    message: created.message
  });

  await sendEmail({
    to: getOwnerEmail(),
    subject: template.subject,
    html: template.html
  });

  return NextResponse.json({ ok: true, id: created.id });
}
