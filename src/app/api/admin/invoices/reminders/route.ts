import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { runInvoiceReminderBatch } from "@/lib/invoices/reminder-runner";
import { sendInvoiceRemindersSchema } from "@/lib/invoices/schema";

/**
 * Sends staged overdue reminders (7/14/30 days) for eligible sent invoices.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = sendInvoiceRemindersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reminder payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await runInvoiceReminderBatch({
    actorId: admin.id,
    dryRun: parsed.data.dryRun,
    maxInvoices: parsed.data.maxInvoices,
    customerId: parsed.data.customerId,
    stage: parsed.data.stage
  });

  return NextResponse.json(result);
}
