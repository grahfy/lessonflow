/**
 * Financial Calculation Engine
 * 
 * The single source of truth for all invoice-related financial math.
 * 
 * CORE ARCHITECTURE:
 * 1. Integer Arithmetic: All calculations use integer CENTS. This prevents 
 *    the precision errors common in floating-point math (e.g., 0.1 + 0.2 !== 0.3).
 * 2. Deterministic Results: Every calculation (tax, subtotal, totals) is 
 *    clamped and truncated to ensure consistency across DB, UI, and PDF.
 * 3. Australian Tax Compliance: Implements standard 10% GST logic.
 * 4. Line-Level Precision: Taxes are calculated and rounded at the line-item 
 *    level, ensuring that line totals always sum up to the invoice grand total 
 *    exactly (avoiding rounding discrepancies at the footer).
 * 
 * RATIONALE: We prioritize mathematical correctness over convenience. By 
 * calculating tax per line and storing cents, we eliminate the 'missing cent' 
 * problem that plagues many invoicing systems.
 */

import { InvoiceTaxMode } from "@/generated/prisma/client";

import { shouldApplyGst } from "@/lib/invoices/gst-policy";
import { CalculatedInvoiceLineItem, CalculatedInvoiceTotals, InvoiceLineItemDraft } from "@/lib/invoices/types";

/** Standard Australian GST rate (10%). */
const GST_RATE = 0.1;

/**
 * Derived financial values for a single line item.
 * 
 * LOGIC:
 * 1. Normalize: Forces quantity to 1+ and unit price to 0+.
 * 2. Multiply: Subtotal = Quantity * UnitPrice.
 * 3. Tax: GST is 10% of subtotal, rounded to the nearest cent if applicable.
 * 
 * @param lineItem - Input partial containing quantity, price, and tax mode
 * @returns Fully populated line item with calculated cents
 */
export function calculateLineItem(lineItem: InvoiceLineItemDraft): CalculatedInvoiceLineItem {
  // RATIONALE: We use Math.trunc to ensure we are working with clean integers 
  // before starting any multiplication, preventing accidental float leaks.
  const normalizedQuantity = Math.max(1, Math.trunc(lineItem.quantity));
  const normalizedUnitPrice = Math.max(0, Math.trunc(lineItem.unitPriceCents));
  
  const lineSubtotalCents = normalizedQuantity * normalizedUnitPrice;
  
  /**
   * NOTE: GST is only applied if the business is registered AND 
   * the specific item mode warrants it (e.g. gst_inclusive).
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
 * - We sum the calculated fields (Subtotal, GST, Total) independently. 
 * - This ensures the grand total always matches the sum of its line 
 *   totals exactly, preventing "off-by-one-cent" errors on PDF footers 
 *   that occur when tax is calculated on the sub-grand-total.
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
 * RATIONALE: Used when the user toggles the global invoice tax mode 
 * (e.g. switching from GST-Free to GST-Inclusive).
 */
export function applyInvoiceTaxMode(lineItems: InvoiceLineItemDraft[], taxMode: InvoiceTaxMode): InvoiceLineItemDraft[] {
  return lineItems.map((lineItem) => ({
    ...lineItem,
    taxMode
  }));
}
