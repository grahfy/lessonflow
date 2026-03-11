import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { createCreditNoteSchema } from "@/lib/invoices/schema";
import { generateNextCreditNoteNumber } from "@/lib/invoices/numbering";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Creates a reversing credit note for sent/paid invoices instead of deleting history.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createCreditNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credit-note payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const original = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lineItems: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });

  if (!original || original.isDeleted) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (original.documentType === "credit_note") {
    return NextResponse.json({ error: "Credit notes cannot be reversed with another credit note." }, { status: 400 });
  }
  if (original.status !== "sent" && original.status !== "paid") {
    // RATIONALE: Draft invoices can still be edited or deleted directly. Credit
    // notes are reserved for already-issued documents that must preserve history.
    return NextResponse.json({ error: "Only sent or paid invoices can be credited." }, { status: 400 });
  }

  const existingCredit = await prisma.invoice.findFirst({
    where: {
      originalInvoiceId: original.id,
      documentType: "credit_note",
      isDeleted: false
    },
    select: {
      id: true,
      invoiceNumber: true
    }
  });
  if (existingCredit) {
    return NextResponse.json(
      { error: `Credit note ${existingCredit.invoiceNumber} already exists for this invoice.` },
      { status: 409 }
    );
  }

  const issuedAt = new Date();
  const reason = parsed.data.reason?.trim();
  const creditNote = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateNextCreditNoteNumber(tx, issuedAt);

    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        status: "draft",
        documentType: "credit_note",
        taxMode: original.taxMode,
        currency: original.currency,
        customerId: original.customerId,
        bookingId: original.bookingId,
        originalInvoiceId: original.id,
        customerName: original.customerName,
        customerEmail: original.customerEmail,
        customerPhone: original.customerPhone,
        customerAddress: original.customerAddress,
        sellerBusinessName: original.sellerBusinessName,
        sellerAbn: original.sellerAbn,
        sellerEmail: original.sellerEmail,
        bankName: original.bankName,
        bankBsb: original.bankBsb,
        bankAccountName: original.bankAccountName,
        bankAccountNumber: original.bankAccountNumber,
        subtotalCents: -Math.abs(original.subtotalCents),
        gstCents: -Math.abs(original.gstCents),
        totalCents: -Math.abs(original.totalCents),
        notes: reason ? `Credit note for ${original.invoiceNumber}: ${reason}` : `Credit note for ${original.invoiceNumber}`,
        issuedAt,
        dueAt: issuedAt,
        createdById: admin.id,
        updatedById: admin.id,
        lineItems: {
          create: original.lineItems.map((lineItem) => ({
            kind: lineItem.kind,
            // NOTE: Credit-note rows stay human-readable in PDFs/admin views by
            // prefixing the original description instead of hiding the source.
            description: `Credit note: ${lineItem.description}`,
            quantity: Math.max(1, Math.abs(lineItem.quantity)),
            unitPriceCents: -Math.abs(lineItem.unitPriceCents),
            taxMode: lineItem.taxMode,
            lineSubtotalCents: -Math.abs(lineItem.lineSubtotalCents),
            lineGstCents: -Math.abs(lineItem.lineGstCents),
            lineTotalCents: -Math.abs(lineItem.lineTotalCents),
            sortOrder: lineItem.sortOrder
          }))
        },
        auditLogs: {
          create: {
            action: "created",
            actorId: admin.id,
            details: reason ? `Credit note created: ${reason}` : "Credit note created"
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

    await tx.invoiceAuditLog.create({
      data: {
        invoiceId: original.id,
        action: "credit_note_created",
        actorId: admin.id,
        details: `Credit note ${created.invoiceNumber} created${reason ? ` (${reason})` : ""}`
      }
    });

    // RATIONALE: Touch the original invoice's `updatedById` so later admin
    // history views show that a corrective document was created against it.
    await tx.invoice.update({
      where: { id: original.id },
      data: {
        updatedById: admin.id
      }
    });

    return created;
  });

  return NextResponse.json({ invoice: creditNote }, { status: 201 });
}
