import { InvoiceTaxMode } from "@prisma/client";

import { shouldApplyGst } from "@/lib/invoices/gst-policy";
import { CalculatedInvoiceLineItem, CalculatedInvoiceTotals, InvoiceLineItemDraft } from "@/lib/invoices/types";

const GST_RATE = 0.1;

/**
 * Calculates one line item in integer cents, including optional GST based on tax mode.
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
 * Recomputes all lines and returns both line-level and aggregate totals.
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
 * Applies a single invoice-level tax mode to all line items.
 */
export function applyInvoiceTaxMode(lineItems: InvoiceLineItemDraft[], taxMode: InvoiceTaxMode): InvoiceLineItemDraft[] {
  return lineItems.map((lineItem) => ({
    ...lineItem,
    taxMode
  }));
}
