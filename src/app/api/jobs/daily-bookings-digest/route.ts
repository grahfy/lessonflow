import { endOfDay, startOfDay } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";
import { ownerDailyDigestTemplate } from "@/lib/email/templates";
import { getCronSecret, getOwnerEmail, hasCronSecret } from "@/lib/env";

export async function POST(request: NextRequest) {
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== getCronSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
