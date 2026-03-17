import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { sendCustomerInvoiceEmail } from "@/lib/invoice-events";
import { logError } from "@/lib/observability";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Sends an invoice to customer and persists send/audit metadata.
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

    const now = new Date();
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: invoice.status === "paid" ? "paid" : "sent",
        sentAt: now,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "sent",
            actorId: admin.id,
            details: "Invoice email dispatched"
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
      const deliveryResult = await sendCustomerInvoiceEmail(invoice);
      if (deliveryResult.status === "failed") {
        return NextResponse.json(
          {
            ok: true,
            partial: true,
            warning: "Invoice was marked as sent, but the customer email could not be delivered.",
            deliveryStatus: deliveryResult.status,
            invoice: updated
          },
          { status: 202 }
        );
      }

      if (deliveryResult.status === "queued_no_smtp") {
        return NextResponse.json(
          {
            ok: true,
            partial: true,
            warning: "Invoice was marked as sent, but no live email provider is configured for customer delivery.",
            deliveryStatus: deliveryResult.status,
            invoice: updated
          },
          { status: 202 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Invoice sent.",
        deliveryStatus: deliveryResult.status,
        invoice: updated
      });
    } catch (error) {
      logError("invoice.send_notification_failed", error, { invoiceId: invoice.id, actorId: admin.id });
      return NextResponse.json(
        {
          ok: true,
          partial: true,
          warning: "Invoice was marked as sent, but the customer email could not be delivered.",
          deliveryStatus: "failed",
          invoice: updated
        },
        { status: 202 }
      );
    }
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send invoice.");
  }
}
