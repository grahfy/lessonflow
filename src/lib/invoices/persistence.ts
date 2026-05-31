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
import { isInvoiceNumberConflict } from "@/lib/invoices/numbering";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { generateNextInvoiceNumber } from "@/lib/invoices/numbering";
import { sellerSnapshotFromEnv } from "@/lib/invoices/snapshots";
import { getInvoiceCurrency } from "@/lib/invoices/tax-profile";
import { InvoiceCustomerSnapshot, InvoiceDiscountDraft, InvoiceLineItemDraft } from "@/lib/invoices/types";

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
  currency?: string;
  taxMode?: InvoiceTaxMode;
  customerId?: string | null;
  bookingId?: string | null;
  bookingIds?: string[] | null;
  originalInvoiceId?: string | null;
  customerSnapshot: InvoiceCustomerSnapshot;
  lineItems: InvoiceLineItemDraft[];
  invoiceDiscount?: InvoiceDiscountDraft;
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
  const currency = getInvoiceCurrency(input.currency);
  const taxMode = input.taxMode ?? getDefaultInvoiceTaxModeForCurrencyValue(currency);
  
  // LOGIC: Normalize defaults before calculating totals.
  // This ensures that persisted ordering and tax mode assignment are deterministic 
  // even if the caller omits optional line metadata in the draft.
  const normalizedLineItems = input.lineItems.map((lineItem, index) => ({
    ...lineItem,
    taxMode: lineItem.taxMode ?? taxMode,
    sortOrder: lineItem.sortOrder ?? index,
    discountKind: lineItem.discountKind ?? null,
    discountValue: lineItem.discountValue ?? null
  }));

  const calculation = calculateInvoiceTotals(normalizedLineItems, {
    discountKind: input.invoiceDiscount?.discountKind ?? null,
    discountValue: input.invoiceDiscount?.discountValue ?? null
  }, {
    currency
  });
  const sellerSnapshot = sellerSnapshotFromEnv();
  const resolvedBookingIds = Array.from(
    new Set(
      [input.bookingId ?? null, ...(input.bookingIds ?? [])]
        .filter((bookingId): bookingId is string => typeof bookingId === "string" && bookingId.trim().length > 0)
    )
  );
  
  // CONCURRENCY: `generateNextInvoiceNumber` derives the next sequence from the
  // latest existing row, so two creates racing inside separate transactions can
  // compute the same number; the DB UNIQUE constraint then makes one create
  // throw P2002. Rather than surfacing a 500, we retry the allocate-and-create a
  // bounded number of times, recomputing a fresh number on each attempt so the
  // loser simply lands on the next free sequence. The number must be (re)allocated
  // immediately before the create so each retry observes the row the winner just
  // inserted. (MariaDB does not abort the surrounding interactive transaction on a
  // duplicate-key error, so the provided `tx` remains usable across attempts.)
  const MAX_INVOICE_NUMBER_ATTEMPTS = 5;
  let invoice: Awaited<ReturnType<typeof input.tx.invoice.create>> | undefined;

  for (let attempt = 1; attempt <= MAX_INVOICE_NUMBER_ATTEMPTS; attempt += 1) {
    const invoiceNumber = await generateNextInvoiceNumber(input.tx, input.issuedAt);

    try {
      invoice = await input.tx.invoice.create({
        data: {
          invoiceNumber,
          status: input.status ?? "draft",
          documentType: input.documentType ?? "invoice",
          currency,
          taxMode,
          discountKind: input.invoiceDiscount?.discountKind ?? null,
          discountValue: input.invoiceDiscount?.discountValue ?? null,
          discountCents: calculation.totals.discountCents,
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
          paymentDetailsSource: "system",

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
              discountKind: lineItem.discountKind ?? null,
              discountValue: lineItem.discountValue ?? null,
              lineDiscountCents: lineItem.lineDiscountCents,
              lineSubtotalCents: lineItem.lineSubtotalCents,
              lineGstCents: lineItem.lineGstCents,
              lineTotalCents: lineItem.lineTotalCents,
              sortOrder: lineItem.sortOrder
            }))
          },
          bookingLinks: resolvedBookingIds.length > 0
            ? {
                create: resolvedBookingIds.map((bookingId) => ({
                  bookingId
                }))
              }
            : undefined,

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

      break;
    } catch (error) {
      // Retry only on an invoice-number UNIQUE collision; rethrow anything else.
      // If we have exhausted our attempts, surface the conflict to the caller.
      if (isInvoiceNumberConflict(error) && attempt < MAX_INVOICE_NUMBER_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }

  // INVARIANT: the loop either assigns `invoice` and breaks, or rethrows. The
  // guard satisfies the type checker and documents the unreachable fallthrough.
  if (!invoice) {
    throw new Error("Failed to allocate a unique invoice number after multiple attempts.");
  }

  return invoice;
}
