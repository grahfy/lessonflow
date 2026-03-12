import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { applyInvoiceTaxMode, calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { updateInvoiceSchema } from "@/lib/invoices/schema";
import { allowedStatusesForAction, canApplyInvoiceAction, type InvoiceLifecycleAction, type InvoiceLifecycleStatus } from "@/lib/invoices/transitions";
import { InvoiceLineItemDraft } from "@/lib/invoices/types";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Returns one invoice record with line items for detail views.
 */
export async function GET(request: NextRequest, { params }: Params) {
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

  return NextResponse.json({ invoice });
}

/**
 * Applies invoice edits and lifecycle transitions with explicit audit records.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lineItems: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  if (existing.isDeleted && parsed.data.action !== "restore") {
    return NextResponse.json({ error: "Deleted invoices can only be restored." }, { status: 400 });
  }

  if (existing.documentType === "credit_note" && parsed.data.action === "edit" && parsed.data.lineItems?.length) {
    // RATIONALE: Credit notes are accounting corrections that should preserve
    // their original financial breakdown. Admins may still adjust notes/due
    // date metadata, but not rewrite the credited line items after issuance.
    return NextResponse.json(
      { error: "Credit-note line items are immutable. Update notes or due date only." },
      { status: 400 }
    );
  }

  if (parsed.data.action === "restore") {
    const restored = await prisma.invoice.update({
      where: { id },
      data: {
        isDeleted: false,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "restored",
            actorId: admin.id,
            details: "Invoice restored"
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
    return NextResponse.json({ invoice: restored });
  }

  if (parsed.data.action === "mark_paid" || parsed.data.action === "mark_unpaid" || parsed.data.action === "void") {
    const action: InvoiceLifecycleAction = parsed.data.action;
    const currentStatus = existing.status as InvoiceLifecycleStatus;
    // NOTE: Transition rules live in the shared invoices domain module so UI and
    // API agree on what lifecycle actions are legal from each status.
    if (!canApplyInvoiceAction(currentStatus, action)) {
      return NextResponse.json(
        {
          error: "Invalid invoice transition.",
          details: {
            action,
            status: existing.status,
            allowedFrom: allowedStatusesForAction(action)
          }
        },
        { status: 400 }
      );
    }
  }

  if (parsed.data.action === "mark_paid") {
    const paid = await prisma.invoice.update({
      where: { id },
      data: {
        status: "paid",
        paidAt: new Date(),
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "marked_paid",
            actorId: admin.id,
            details: "Invoice marked as paid"
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
    return NextResponse.json({ invoice: paid });
  }

  if (parsed.data.action === "mark_unpaid") {
    const unpaid = await prisma.invoice.update({
      where: { id },
      data: {
        status: existing.sentAt ? "sent" : "draft",
        paidAt: null,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "marked_unpaid",
            actorId: admin.id,
            details: "Invoice marked as unpaid"
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
    return NextResponse.json({ invoice: unpaid });
  }

  if (parsed.data.action === "void") {
    const voided = await prisma.invoice.update({
      where: { id },
      data: {
        status: "void",
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "voided",
            actorId: admin.id,
            details: "Invoice voided"
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
    return NextResponse.json({ invoice: voided });
  }

  const lineItemsProvided = Boolean(parsed.data.lineItems?.length);
  const sourceLineItems = lineItemsProvided && parsed.data.lineItems ? parsed.data.lineItems : existing.lineItems;
  // RATIONALE: Tax-mode changes must be applied against the full working set of
  // line items, even when the admin only toggles GST behavior and leaves the
  // descriptions/quantities untouched.
  const baseLineDrafts: InvoiceLineItemDraft[] = sourceLineItems.map((lineItem, index) => ({
    description: lineItem.description,
    quantity: lineItem.quantity,
    unitPriceCents: lineItem.unitPriceCents,
    taxMode: lineItem.taxMode,
    kind: lineItem.kind as InvoiceLineItemDraft["kind"],
    sortOrder: lineItem.sortOrder ?? index
  }));

  const normalizedLines = parsed.data.taxMode ? applyInvoiceTaxMode(baseLineDrafts, parsed.data.taxMode) : baseLineDrafts;
  const calculation = calculateInvoiceTotals(normalizedLines);

  const updated = await prisma.$transaction(async (tx) => {
    if (lineItemsProvided || parsed.data.taxMode) {
      // RATIONALE: Replacing the line-item set inside one transaction keeps the
      // invoice totals and stored line rows in sync. Partial updates here would
      // risk stale totals or mismatched tax calculations.
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLineItem.createMany({
        data: calculation.lineItems.map((lineItem) => ({
          invoiceId: id,
          kind: lineItem.kind,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unitPriceCents: lineItem.unitPriceCents,
          taxMode: lineItem.taxMode,
          lineSubtotalCents: lineItem.lineSubtotalCents,
          lineGstCents: lineItem.lineGstCents,
          lineTotalCents: lineItem.lineTotalCents,
          sortOrder: lineItem.sortOrder
        }))
      });
    }

    return tx.invoice.update({
      where: { id },
      data: {
        customerName: parsed.data.customerName ?? existing.customerName,
        customerEmail: parsed.data.customerEmail ?? existing.customerEmail,
        customerPhone: parsed.data.customerPhone ?? existing.customerPhone,
        customerAddress: parsed.data.customerAddress ?? existing.customerAddress,
        taxMode: parsed.data.taxMode ?? existing.taxMode,
        notes: parsed.data.notes === null ? null : parsed.data.notes ?? existing.notes,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : existing.dueAt,
        subtotalCents: calculation.totals.subtotalCents,
        gstCents: calculation.totals.gstCents,
        totalCents: calculation.totals.totalCents,
        updatedById: admin.id,
        auditLogs: {
          create: {
            action: "edited",
            actorId: admin.id,
            details: "Invoice edited"
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
  });

  return NextResponse.json({ invoice: updated });
}

/**
 * Soft-deletes an invoice so it no longer appears in default admin views.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerAdmin(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  if (existing.documentType === "invoice" && (existing.status === "sent" || existing.status === "paid")) {
    // RATIONALE: Issued financial documents should remain part of the audit
    // trail. Operators must correct them with credit notes rather than hiding
    // them via delete once they have been sent or paid.
    return NextResponse.json(
      { error: "Sent or paid invoices cannot be deleted. Create a credit note instead." },
      { status: 400 }
    );
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      isDeleted: true,
      updatedById: admin.id,
      auditLogs: {
        create: {
          action: "deleted",
          actorId: admin.id,
          details: "Invoice soft-deleted"
        }
      }
    }
  });

  return NextResponse.json({ ok: true });
}
