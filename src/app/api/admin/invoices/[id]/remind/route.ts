import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { getInvoiceReminderPolicy, getNotificationSettingsState } from "@/lib/email/notification-settings";
import { sendCustomerInvoiceReminderEmail } from "@/lib/invoice-events";
import { getInvoiceOverdueDays } from "@/lib/invoices/aging";
import { withResolvedInvoicePaymentDetails } from "@/lib/invoices/payment-details";
import { buildInvoiceReminderPersistence, getInvoiceReminderEligibility } from "@/lib/invoices/reminders";
import { logError } from "@/lib/observability";

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
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const notificationSettings = await getNotificationSettingsState();
    const reminderPolicy = getInvoiceReminderPolicy(notificationSettings);
    const eligibility = getInvoiceReminderEligibility(invoice, reminderPolicy);
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
    const reminderState = manualStage
      ? buildInvoiceReminderPersistence(overdueDays, manualStage)
      : {
          lastReminderSentAt: new Date(),
          lastReminderStage: invoice.lastReminderStage,
          details: `Manual overdue reminder sent (${overdueDays} days overdue)`
        };

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        lastReminderSentAt: reminderState.lastReminderSentAt,
        lastReminderStage: reminderState.lastReminderStage,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "reminder_sent",
            actorId: admin.id,
            details: reminderState.details
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

    try {
      const deliveryResult = await sendCustomerInvoiceReminderEmail(invoice, overdueDays);
      if (deliveryResult.status === "failed") {
        return NextResponse.json(
          {
            overdueDays,
            stage: manualStage,
            partial: true,
            warning: "Reminder metadata was saved, but the customer email could not be delivered.",
            deliveryStatus: deliveryResult.status,
            invoice: withResolvedInvoicePaymentDetails(updated)
          },
          { status: 202 }
        );
      }

      if (deliveryResult.status === "queued_no_smtp") {
        return NextResponse.json(
          {
            overdueDays,
            stage: manualStage,
            partial: true,
            warning: "Reminder metadata was saved, but no live email provider is configured for customer delivery.",
            deliveryStatus: deliveryResult.status,
            invoice: withResolvedInvoicePaymentDetails(updated)
          },
          { status: 202 }
        );
      }

      return NextResponse.json({
        invoice: withResolvedInvoicePaymentDetails(updated),
        overdueDays,
        stage: manualStage,
        message: "Reminder sent.",
        deliveryStatus: deliveryResult.status
      });
    } catch (error) {
      logError("invoice.reminder_notification_failed", error, { invoiceId: invoice.id, actorId: admin.id });
      return NextResponse.json(
        {
          invoice: withResolvedInvoicePaymentDetails(updated),
          overdueDays,
          stage: manualStage,
          partial: true,
          warning: "Reminder metadata was saved, but the customer email could not be delivered.",
          deliveryStatus: "failed"
        },
        { status: 202 }
      );
    }
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send invoice reminder.");
  }
}
