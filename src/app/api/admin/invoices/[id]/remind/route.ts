import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { sendCustomerInvoiceReminderEmail } from "@/lib/invoice-events";
import { getInvoiceOverdueDays } from "@/lib/invoices/aging";
import { getInvoiceReminderEligibility, sendInvoiceReminder } from "@/lib/invoices/reminders";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Sends one overdue invoice reminder and records reminder-stage metadata.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });

    if (!invoice || invoice.isDeleted) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const overdueDays = getInvoiceOverdueDays(invoice.dueAt);
    if (invoice.documentType !== "invoice" || invoice.status !== "sent") {
      return NextResponse.json(
        {
          error: "Only sent invoices can receive reminders."
        },
        { status: 400 }
      );
    }
    if (overdueDays < 1) {
      return NextResponse.json(
        {
          error: "Invoice is not overdue yet."
        },
        { status: 400 }
      );
    }

    const eligibility = getInvoiceReminderEligibility(invoice);
    if (!eligibility.isEligible) {
      return NextResponse.json(
        {
          error: "Invoice is not eligible for a reminder at this time.",
          details: eligibility
        },
        { status: 400 }
      );
    }

    const manualStage = eligibility.stage;

    // Manual reminders should work for any overdue sent invoice. We still preserve the automated
    // 7/14/30 stage helper when a stage applies so reminder metadata remains consistent with cron.
    const reminder = manualStage
      ? await sendInvoiceReminder(invoice, overdueDays, manualStage)
      : (() => {
          const sendPromise = sendCustomerInvoiceReminderEmail(invoice, overdueDays);
          return sendPromise.then(() => ({
            lastReminderSentAt: new Date(),
            lastReminderStage: invoice.lastReminderStage,
            details: `Manual overdue reminder sent (${overdueDays} days overdue)`
          }));
        })();

    const resolvedReminder = await reminder;
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        lastReminderSentAt: resolvedReminder.lastReminderSentAt,
        lastReminderStage: resolvedReminder.lastReminderStage,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "reminder_sent",
            actorId: admin.id,
            details: resolvedReminder.details
          }
        }
      },
      include: {
        lineItems: {
          orderBy: {
            sortOrder: "asc"
          }
        }
      }
    });

    return NextResponse.json({ invoice: updated, overdueDays, stage: manualStage });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send invoice reminder.");
  }
}
