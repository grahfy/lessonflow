/**
 * Financial Calculation Engine
 * 
 * The single source of truth for all invoice-related financial math.
 * 
 * CORE ARCHITECTURE:
 * 1. Integer Arithmetic: All calculations use integer CENTS. This prevents 
 *    the precision errors common in floating-point math (e.g., 0.1 + 0.2 === 0.30000000000000004).
 * 2. Deterministic Results: Every calculation (tax, subtotal, totals) is 
 *    clamped and truncated to ensure consistency across the DB, UI, and PDF.
 * 3. Australian Tax Compliance: Implements the 10% GST logic specifically 
 *    tailored for Australian small businesses.
 */

import { InvoiceTaxMode } from "@/generated/prisma/client";

import { shouldApplyGst } from "@/lib/invoices/gst-policy";
import { CalculatedInvoiceLineItem, CalculatedInvoiceTotals, InvoiceLineItemDraft } from "@/lib/invoices/types";

/** Standard Australian GST rate (10%). */
const GST_RATE = 0.1;

/**
 * Derived financial values for a single line item.
 * 
 * RATIONALE:
 * - We enforce a minimum quantity of 1 for invoices.
 * - We enforce a minimum unit price of 0 (no negative line items).
 * - GST is calculated per-line using standard rounding (Banker's rounding 
 *   or simple halfway-up depending on standard implementation, here simple round).
 * 
 * @param lineItem - Input partial containing quantity, price, and tax mode
 * @returns Fully populated line item with calculated cents
 */
export function calculateLineItem(lineItem: InvoiceLineItemDraft): CalculatedInvoiceLineItem {
  // Ensure we don't have fractional quantities (e.g. 1.5 lessons) for business simplicity.
  const normalizedQuantity = Math.max(1, Math.trunc(lineItem.quantity));
  const normalizedUnitPrice = Math.max(0, Math.trunc(lineItem.unitPriceCents));
  
  const lineSubtotalCents = normalizedQuantity * normalizedUnitPrice;
  
  /**
   * NOTE: GST is only applied if the business is registered AND 
   * the specific item is marked as taxable.
   */
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
 * Aggregates all line items into a document-wide financial snapshot.
 * 
 * DESIGN RATIONALE:
 * - Summation Order: We sum the calculated fields (Subtotal, GST, Total) 
 *   independently. This ensures the grand total always matches the sum 
 *   of its line totals exactly, preventing "off-by-one-cent" errors 
 *   on the PDF footers.
 * 
 * @param lineItems - List of line items (e.g. from a form draft)
 * @returns Object with recomputed lines and the aggregate totals
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
 * Bulk updates the tax mode of a list of items.
 * RATIONALE: Used in the UI when the user toggles the "GST Mode" for the 
 * entire invoice; ensures all items are synchronized before recalculation.
 */
export function applyInvoiceTaxMode(lineItems: InvoiceLineItemDraft[], taxMode: InvoiceTaxMode): InvoiceLineItemDraft[] {
  return lineItems.map((lineItem) => ({
    ...lineItem,
    taxMode
  }));
}
