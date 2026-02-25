import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { sendCustomerInvoiceEmail } from "@/lib/invoice-events";

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

    await sendCustomerInvoiceEmail(invoice);

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
      }
    });

    return NextResponse.json({ ok: true, invoice: updated });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send invoice.");
  }
}
