/**
 * Invoice Persistence Service
 * 
 * This module handles the atomic creation and storage of invoice records.
 * It ensures that every invoice is created with consistent snapshots of 
 * historical data (customer and seller details) to maintain financial 
 * records even if master profiles change in the future.
 * 
 * RATIONALE: We denormalize customer and seller data into the invoice record
 * at the moment of creation. This is a critical accounting practice to 
 * ensure that old invoices still reflect the names, addresses, and bank 
 * details that were valid at the time the document was issued.
 */

import { InvoiceDocumentType, InvoiceStatus, InvoiceTaxMode, Prisma } from "@/generated/prisma/client";

import { calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { getDefaultInvoiceTaxMode } from "@/lib/invoices/gst-policy";
import { generateNextInvoiceNumber } from "@/lib/invoices/numbering";
import { sellerSnapshotFromEnv } from "@/lib/invoices/snapshots";
import { InvoiceCustomerSnapshot, InvoiceLineItemDraft } from "@/lib/invoices/types";

/**
 * Retrieves the standard payment term (in days) from environment variables.
 * Used to calculate the default due date for new invoices.
 * 
 * @returns number (default 14)
 */
function getPaymentTermsDays(): number {
  const raw = Number.parseInt(process.env.INVOICE_PAYMENT_TERMS_DAYS || "14", 10);
  if (!Number.isFinite(raw)) {
    return 14;
  }
  return Math.min(Math.max(raw, 0), 120);
}

/**
 * Convenience helper to calculate a due date based on an issue date.
 * 
 * @param issuedAt - The date the invoice is issued
 * @returns Date object for the due date
 */
export function getDefaultDueAt(issuedAt: Date): Date {
  const due = new Date(issuedAt);
  due.setUTCDate(due.getUTCDate() + getPaymentTermsDays());
  return due;
}

/**
 * Input structure for creating a new invoice record.
 */
type CreateInvoiceRecordInput = {
  tx: Prisma.TransactionClient; // RATIONALE: Mandatory transaction client to ensure atomicity
  adminId: string;              // The ID of the admin creating the record
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
 * Creates an invoice and its associated line items atomically.
 *
 * KEY INVARIANTS:
 * 1. Totals are ALWAYS recalculated server-side using the calculation engine.
 * 2. Seller and Customer details are "snapshotted" (denormalized) for historical stability.
 * 3. Unique invoice number generation occurs WITHIN the provided transaction.
 * 4. An audit log entry is automatically generated to track the creator.
 * 
 * @param input - Detailed configuration for the new invoice
 * @returns The created invoice object including line items
 */
export async function createInvoiceRecord(input: CreateInvoiceRecordInput) {
  const taxMode = input.taxMode ?? getDefaultInvoiceTaxMode();
  
  // LOGIC: Normalize defaults before calculating totals.
  // This ensures that persisted ordering and tax mode assignment are deterministic 
  // even if the caller omits optional line metadata in the draft.
  const normalizedLineItems = input.lineItems.map((lineItem, index) => ({
    ...lineItem,
    taxMode: lineItem.taxMode ?? taxMode,
    sortOrder: lineItem.sortOrder ?? index
  }));

  const calculation = calculateInvoiceTotals(normalizedLineItems);
  const sellerSnapshot = sellerSnapshotFromEnv();
  
  // NOTE: Number generation is transaction-scoped to maintain consistency under concurrency.
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
      
      // DENORMALIZED CUSTOMER DATA
      customerFirstName: input.customerSnapshot.customerFirstName,
      customerLastName: input.customerSnapshot.customerLastName,
      customerName: input.customerSnapshot.customerName,
      customerEmail: input.customerSnapshot.customerEmail,
      customerPhone: input.customerSnapshot.customerPhone,
      customerAddress: input.customerSnapshot.customerAddress,
      
      // DENORMALIZED SELLER DATA
      sellerBusinessName: sellerSnapshot.sellerBusinessName,
      sellerAbn: sellerSnapshot.sellerAbn,
      sellerEmail: sellerSnapshot.sellerEmail,
      bankName: sellerSnapshot.bankName,
      bankBsb: sellerSnapshot.bankBsb,
      bankAccountName: sellerSnapshot.bankAccountName,
      bankAccountNumber: sellerSnapshot.bankAccountNumber,
      
      // CALCULATED TOTALS
      subtotalCents: calculation.totals.subtotalCents,
      gstCents: calculation.totals.gstCents,
      totalCents: calculation.totals.totalCents,
      
      notes: input.notes?.trim() || null,
      issuedAt: input.issuedAt,
      dueAt: input.dueAt,
      createdById: input.adminId,
      updatedById: input.adminId,
      
      // ATOMIC LINE ITEM CREATION
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
      
      // AUTOMATIC AUDIT LOGGING
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

  return invoice;
}
