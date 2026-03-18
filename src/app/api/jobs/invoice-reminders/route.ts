/**
 * Invoice Reminder Batch Job
 * 
 * Automates the tracking and notification of overdue or upcoming invoices.
 * 
 * DESIGN RATIONALE:
 * - Idempotency: The job identifies eligible invoices based on `dueAt` and 
 *   `lastReminderStage`, ensuring a reminder isn't sent twice for the same stage.
 * - Protection: Secured by an `x-cron-secret` header to prevent unauthorized trigger.
 * - Accountability: Reminders are attributed to the primary admin owner for 
 *   audit trails (BookingAuditLog/InvoiceAuditLog).
 * - Batching: Defaults to a safe number of emails to avoid SMTP rate limits.
 */

import { NextRequest, NextResponse } from "next/server";

import { getPrimaryActiveAdmin } from "@/lib/admin-auth";
import { getCronSecret, hasCronSecret } from "@/lib/env";
import { runInvoiceReminderBatch } from "@/lib/invoices/reminder-runner";
import { sendInvoiceRemindersSchema } from "@/lib/invoices/schema";

/**
 * POST: Triggers a reminder run for outstanding invoices.
 * 
 * SECURITY:
 * 1. Checks for existence of CRON_SECRET in environment.
 * 2. Compares incoming 'x-cron-secret' header against local secret.
 * 
 * JOB FLOW:
 * 1. Validates the request body using Zod schema (supports dry-runs and subsets).
 * 2. Fetches the primary active admin identity to attribute the automated actions.
 * 3. Calls the `runInvoiceReminderBatch` service to perform the logic (filtering,
 *    rendering, and sending emails via SMTP).
 * 
 * @param request - JSON payload (maxInvoices, dryRun, customerId, stage)
 * @returns Summary of reminder actions performed
 */
export async function POST(request: NextRequest) {
  // Guard: Ensure environment is configured for automated jobs.
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }

  // Guard: Verify secret caller.
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== getCronSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = sendInvoiceRemindersSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reminder payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  /**
   * NOTE: We attribute system-generated emails to the primary administrator 
   * to maintain a clear audit trail in the database.
   */
  const ownerAdmin = await getPrimaryActiveAdmin();
  if (!ownerAdmin) {
    return NextResponse.json({ error: "Setup incomplete. Create an admin account before running reminders." }, { status: 409 });
  }

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
