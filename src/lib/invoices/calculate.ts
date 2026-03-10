/**
 * Financial Calculation Engine
 * 
 * This module is the single source of truth for all invoice-related financial math.
 * It handles line item subtotals, GST calculation, and aggregate document totals.
 * 
 * DESIGN PRINCIPLE: We operate entirely in integer cents to avoid floating-point
 * rounding errors (e.g. 0.1 + 0.2 !== 0.3).
 */

import { InvoiceTaxMode } from "@/generated/prisma/client";

import { shouldApplyGst } from "@/lib/invoices/gst-policy";
import { CalculatedInvoiceLineItem, CalculatedInvoiceTotals, InvoiceLineItemDraft } from "@/lib/invoices/types";

/**
 * Standard Australian GST rate (10%).
 */
const GST_RATE = 0.1;

/**
 * Calculates financial values for a single line item.
 * 
 * LOGIC:
 * 1. Normalizes quantity to at least 1 (truncated to integer).
 * 2. Normalizes unit price to at least 0 (truncated to integer cents).
 * 3. Calculates subtotal (qty * price).
 * 4. Applies 10% GST if the business is registered and the item is taxable.
 *
 * RATIONALE: We clamp and truncate values here to ensure that persisted totals
 * are deterministic. Server-side persistence must never trust UI-provided math.
 * 
 * @param lineItem - The raw or drafted line item data
 * @returns CalculatedInvoiceLineItem with derived financial fields
 */
export function calculateLineItem(lineItem: InvoiceLineItemDraft): CalculatedInvoiceLineItem {
  const normalizedQuantity = Math.max(1, Math.trunc(lineItem.quantity));
  const normalizedUnitPrice = Math.max(0, Math.trunc(lineItem.unitPriceCents));
  const lineSubtotalCents = normalizedQuantity * normalizedUnitPrice;
  const lineGstCents = shouldApplyGst(lineItem.taxMode) ? Math.round(lineSubtotalCents * GST_RATE) : 0;

  return {
    ...lineItem,
    quantity: normalizedQuantity,
    unitPriceCents: normalizedUnitPrice,
    lineSubtotalCents,
    lineGstCents,
    lineTotalCents: lineSubtotalCents + lineGstCents
  };
}

/**
 * Recomputes all line items and aggregates them into document-wide totals.
 * 
 * NOTE: This is the final step before persistence to the database or 
 * rendering a PDF. It ensures that the document total exactly equals
 * the sum of its lines.
 * 
 * @param lineItems - Array of line item drafts
 * @returns Object containing both calculated lines and aggregate totals
 */
export function calculateInvoiceTotals(lineItems: InvoiceLineItemDraft[]): {
  lineItems: CalculatedInvoiceLineItem[];
  totals: CalculatedInvoiceTotals;
} {
  const calculatedLines = lineItems.map((lineItem) => calculateLineItem(lineItem));

  const totals = calculatedLines.reduce<CalculatedInvoiceTotals>(
    (acc, lineItem) => {
      acc.subtotalCents += lineItem.lineSubtotalCents;
      acc.gstCents += lineItem.lineGstCents;
      acc.totalCents += lineItem.lineTotalCents;
      return acc;
    },
    {
      subtotalCents: 0,
      gstCents: 0,
      totalCents: 0
    }
  );

  return {
    lineItems: calculatedLines,
    totals
  };
}

/**
 * Batch-updates the tax mode for all line items to match a document-wide selection.
 * 
 * RATIONALE: In the Admin UI, users often want to toggle an entire invoice 
 * between GST-free and Taxable. This helper ensures all lines are updated
 * before a recalculation occurs.
 * 
 * @param lineItems - Array of line items to update
 * @param taxMode - The target tax mode (taxable | gst_free)
 */
export function applyInvoiceTaxMode(lineItems: InvoiceLineItemDraft[], taxMode: InvoiceTaxMode): InvoiceLineItemDraft[] {
  return lineItems.map((lineItem) => ({
    ...lineItem,
    taxMode
  }));
}
