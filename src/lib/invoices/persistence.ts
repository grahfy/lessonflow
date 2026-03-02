import { InvoiceDocumentType, InvoiceStatus, InvoiceTaxMode, Prisma } from "@/generated/prisma/client";

import { calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { getDefaultInvoiceTaxMode } from "@/lib/invoices/gst-policy";
import { generateNextInvoiceNumber } from "@/lib/invoices/numbering";
import { sellerSnapshotFromEnv } from "@/lib/invoices/snapshots";
import { InvoiceCustomerSnapshot, InvoiceLineItemDraft } from "@/lib/invoices/types";

/**
 * Parses invoice payment terms from env and returns a conservative fallback.
 */
function getPaymentTermsDays(): number {
  const raw = Number.parseInt(process.env.INVOICE_PAYMENT_TERMS_DAYS || "14", 10);
  if (!Number.isFinite(raw)) {
    return 14;
  }
  return Math.min(Math.max(raw, 0), 120);
}

/**
 * Calculates a default due date by adding configured payment terms to issue time.
 */
export function getDefaultDueAt(issuedAt: Date): Date {
  const due = new Date(issuedAt);
  due.setUTCDate(due.getUTCDate() + getPaymentTermsDays());
  return due;
}

type CreateInvoiceRecordInput = {
  tx: Prisma.TransactionClient;
  adminId: string;
  status?: InvoiceStatus;
  documentType?: InvoiceDocumentType;
  taxMode?: InvoiceTaxMode;
  customerId?: string | null;
  bookingId?: string | null;
  originalInvoiceId?: string | null;
  customerSnapshot: InvoiceCustomerSnapshot;
  lineItems: InvoiceLineItemDraft[];
  notes?: string | null;
  issuedAt: Date;
  dueAt: Date;
};

/**
 * Creates an invoice and all line items atomically with deterministic totals.
 *
 * Key invariants:
 * - totals are recalculated server-side (client totals are not trusted)
 * - seller details are snapshotted from env so historical invoices remain stable
 * - invoice number generation occurs inside the transaction to avoid duplicates
 * - an audit log entry is written with the creating actor
 */
export async function createInvoiceRecord(input: CreateInvoiceRecordInput) {
  const taxMode = input.taxMode ?? getDefaultInvoiceTaxMode();
  // Normalize defaults before calculating totals so persisted ordering and tax mode assignment are
  // deterministic even if the caller omits optional line metadata.
  const normalizedLineItems = input.lineItems.map((lineItem, index) => ({
    ...lineItem,
    taxMode: lineItem.taxMode ?? taxMode,
    sortOrder: lineItem.sortOrder ?? index
  }));

  const calculation = calculateInvoiceTotals(normalizedLineItems);
  const sellerSnapshot = sellerSnapshotFromEnv();
  // Number generation is transaction-scoped to keep invoice numbering consistent under concurrency.
  const invoiceNumber = await generateNextInvoiceNumber(input.tx, input.issuedAt);

  const invoice = await input.tx.invoice.create({
    data: {
      invoiceNumber,
      status: input.status ?? "draft",
      documentType: input.documentType ?? "invoice",
      taxMode,
      customerId: input.customerId ?? null,
      bookingId: input.bookingId ?? null,
      originalInvoiceId: input.originalInvoiceId ?? null,
      customerFirstName: input.customerSnapshot.customerFirstName,
      customerLastName: input.customerSnapshot.customerLastName,
      customerName: input.customerSnapshot.customerName,
      customerEmail: input.customerSnapshot.customerEmail,
      customerPhone: input.customerSnapshot.customerPhone,
      customerAddress: input.customerSnapshot.customerAddress,
      sellerBusinessName: sellerSnapshot.sellerBusinessName,
      sellerAbn: sellerSnapshot.sellerAbn,
      sellerEmail: sellerSnapshot.sellerEmail,
      bankName: sellerSnapshot.bankName,
      bankBsb: sellerSnapshot.bankBsb,
      bankAccountName: sellerSnapshot.bankAccountName,
      bankAccountNumber: sellerSnapshot.bankAccountNumber,
      subtotalCents: calculation.totals.subtotalCents,
      gstCents: calculation.totals.gstCents,
      totalCents: calculation.totals.totalCents,
      notes: input.notes?.trim() || null,
      issuedAt: input.issuedAt,
      dueAt: input.dueAt,
      createdById: input.adminId,
      updatedById: input.adminId,
      lineItems: {
        create: calculation.lineItems.map((lineItem) => ({
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
      },
      auditLogs: {
        create: {
          action: "created",
          actorId: input.adminId,
          details: "Invoice created"
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

  // Callers often render or send the invoice immediately, so we return lines in stable sort order.
  return invoice;
}
