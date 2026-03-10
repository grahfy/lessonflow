/**
 * Daily Bookings Digest Job
 * 
 * Generates and sends a summary of today's scheduled lessons to the school owner.
 * 
 * PURPOSE:
 * Provides a morning "at-a-glance" email for the teacher, ensuring they are 
 * prepared for the day's schedule without needing to log in to the admin console.
 * 
 * PROTECTION:
 * Secured via `x-cron-secret` to ensure only scheduled internal tasks or 
 * authorized CI/CD triggers can initiate the mailing.
 */

import { endOfDay, startOfDay } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";
import { ownerDailyDigestTemplate } from "@/lib/email/templates";
import { getCronSecret, getOwnerEmail, hasCronSecret } from "@/lib/env";

/**
 * POST: Triggers the generation and delivery of the daily schedule digest.
 * 
 * LOGIC:
 * 1. Verifies cron security secret.
 * 2. Queries the database for all bookings starting within the current calendar day.
 * 3. Renders the digest using the `ownerDailyDigestTemplate`.
 * 4. Dispatches the email to the configured owner address via the primary SMTP service.
 * 
 * @param request - Required 'x-cron-secret' header
 * @returns Summary of bookings included in the digest
 */
export async function POST(request: NextRequest) {
  // Guard: Security verification
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== getCronSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // STEP 1: Fetch today's schedule
  const now = new Date();
  const rows = await prisma.booking.findMany({
    where: {
      startAt: {
        gte: startOfDay(now),
        lte: endOfDay(now)
      }
    },
    orderBy: {
      startAt: "asc"
    }
  });

  // STEP 2: Render Template
  const template = ownerDailyDigestTemplate({
    date: now,
    rows: rows.map((row) => ({
      name: row.name,
      startAt: row.startAt,
      lessonDuration: row.lessonDuration,
      customDurationMinutes: row.customDurationMinutes,
      lessonMode: row.lessonMode,
      status: row.status
    }))
  });

  // STEP 3: Dispatch Email
  await sendEmail({
    to: getOwnerEmail(),
    subject: template.subject,
    html: template.html
  });

  return NextResponse.json({
    ok: true,
    count: rows.length
  });
}
