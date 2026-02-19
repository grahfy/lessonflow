import { NextRequest, NextResponse } from "next/server";

import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { getCronSecret } from "@/lib/env";
import { runInvoiceReminderBatch } from "@/lib/invoices/reminder-runner";
import { sendInvoiceRemindersSchema } from "@/lib/invoices/schema";

/**
 * Scheduled job endpoint that sends staged invoice reminders.
 *
 * Protected by `x-cron-secret` and defaults to sending up to 100 eligible
 * reminders per run unless overridden in the request payload.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== getCronSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = sendInvoiceRemindersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reminder payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const ownerAdmin = await ensureOwnerAdmin();
  const result = await runInvoiceReminderBatch({
    actorId: ownerAdmin.id,
    dryRun: parsed.data.dryRun,
    maxInvoices: parsed.data.maxInvoices,
    customerId: parsed.data.customerId,
    stage: parsed.data.stage
  });

  return NextResponse.json({
    ok: true,
    ...result
  });
}
