import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/invoices/pdf";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Returns a downloadable PDF for one invoice.
 */
export async function GET(request: NextRequest, { params }: Params) {
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

    const pdfBuffer = await renderInvoicePdf(invoice);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        // Prevent browsers/proxies from serving a cached pre-edit PDF when an admin
        // downloads the same invoice again after saving changes.
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        pragma: "no-cache",
        expires: "0"
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to generate invoice PDF.");
  }
}
