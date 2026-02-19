import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
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

  const eligibility = getInvoiceReminderEligibility(invoice);
  if (!eligibility.isEligible || !eligibility.stage) {
    return NextResponse.json(
      {
        error:
          invoice.status !== "sent"
            ? "Only sent invoices can receive reminders."
            : "Invoice is not yet eligible for the next reminder stage."
      },
      { status: 400 }
    );
  }

  const reminder = await sendInvoiceReminder(invoice, eligibility.overdueDays, eligibility.stage);
  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      lastReminderSentAt: reminder.lastReminderSentAt,
      lastReminderStage: reminder.lastReminderStage,
      updatedById: admin.id,
      auditLogs: {
        create: {
          action: "reminder_sent",
          actorId: admin.id,
          details: reminder.details
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

  return NextResponse.json({ invoice: updated, overdueDays: eligibility.overdueDays, stage: eligibility.stage });
}
