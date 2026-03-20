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

import { InvoiceDiscountKind, InvoiceTaxMode } from "@/generated/prisma/client";

import { calculateTaxCents } from "@/lib/invoices/gst-policy";
import {
  CalculatedInvoiceLineItem,
  CalculatedInvoiceTotals,
  InvoiceDiscountDraft,
  InvoiceLineItemDraft
} from "@/lib/invoices/types";

function clampInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeDiscountKind(kind?: InvoiceDiscountKind | null): InvoiceDiscountKind | null {
  return kind === "amount" || kind === "percent" ? kind : null;
}

function normalizeDiscountValue(kind: InvoiceDiscountKind | null, value?: number | null): number | null {
  if (kind === null || value === null || value === undefined) {
    return null;
  }

  const normalized = clampInteger(value);
  if (kind === "percent") {
    return Math.min(normalized, 10_000);
  }
  return normalized;
}

/**
 * Resolves a discount into integer cents for a specific base amount.
 */
export function resolveDiscountCents(baseCents: number, discount: InvoiceDiscountDraft): number {
  const normalizedBase = Math.max(0, Math.trunc(baseCents));
  const kind = normalizeDiscountKind(discount.discountKind);
  const value = normalizeDiscountValue(kind, discount.discountValue);

  if (normalizedBase === 0 || kind === null || value === null || value === 0) {
    return 0;
  }

  if (kind === "percent") {
    return Math.min(normalizedBase, Math.round(normalizedBase * (value / 10_000)));
  }

  return Math.min(normalizedBase, value);
}

function allocateDiscountAcrossBases(baseCents: number[], totalDiscountCents: number): number[] {
  if (totalDiscountCents <= 0 || baseCents.length === 0) {
    return baseCents.map(() => 0);
  }

  const totalBaseCents = baseCents.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (totalBaseCents <= 0) {
    return baseCents.map(() => 0);
  }

  const allocations = baseCents.map((value, index) => {
    const normalizedBase = Math.max(0, value);
    const exactShare = (normalizedBase / totalBaseCents) * totalDiscountCents;
    return {
      index,
      floor: Math.floor(exactShare),
      remainder: exactShare - Math.floor(exactShare)
    };
  });

  let remaining = totalDiscountCents - allocations.reduce((sum, entry) => sum + entry.floor, 0);
  allocations.sort((left, right) => right.remainder - left.remainder);

  for (const entry of allocations) {
    if (remaining <= 0) {
      break;
    }
    entry.floor += 1;
    remaining -= 1;
  }

  allocations.sort((left, right) => left.index - right.index);
  return allocations.map((entry) => entry.floor);
}

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
export function calculateLineItem(lineItem: InvoiceLineItemDraft, currency = "AUD"): CalculatedInvoiceLineItem {
  // RATIONALE: We use Math.trunc to ensure we are working with clean integers 
  // before starting any multiplication, preventing accidental float leaks.
  const normalizedQuantity = Math.max(1, Math.trunc(lineItem.quantity));
  const normalizedUnitPrice = Math.max(0, Math.trunc(lineItem.unitPriceCents));
  const discountKind = normalizeDiscountKind(lineItem.discountKind);
  const discountValue = normalizeDiscountValue(discountKind, lineItem.discountValue);
  const baseSubtotalCents = normalizedQuantity * normalizedUnitPrice;
  const lineDiscountCents = resolveDiscountCents(baseSubtotalCents, {
    discountKind,
    discountValue
  });
  const lineSubtotalCents = baseSubtotalCents - lineDiscountCents;
  
  /**
   * NOTE: GST is only applied if the business is registered AND 
   * the specific item mode warrants it (e.g. gst_inclusive).
   */
  const lineGstCents = calculateTaxCents(lineSubtotalCents, currency, lineItem.taxMode);

  return {
    ...lineItem,
    quantity: normalizedQuantity,
    unitPriceCents: normalizedUnitPrice,
    discountKind,
    discountValue,
    lineDiscountCents,
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
export function calculateInvoiceTotals(
  lineItems: InvoiceLineItemDraft[],
  invoiceDiscount: InvoiceDiscountDraft = {},
  options: {
    currency?: string;
  } = {}
): {
  lineItems: CalculatedInvoiceLineItem[];
  totals: CalculatedInvoiceTotals;
} {
  const currency = options.currency ?? "AUD";
  const calculatedLines = lineItems.map((lineItem) => calculateLineItem(lineItem, currency));
  const subtotalCents = calculatedLines.reduce((sum, lineItem) => sum + lineItem.lineSubtotalCents, 0);
  const discountCents = resolveDiscountCents(subtotalCents, invoiceDiscount);
  const invoiceDiscountAllocations = allocateDiscountAcrossBases(
    calculatedLines.map((lineItem) => lineItem.lineSubtotalCents),
    discountCents
  );

  const adjustedLines = calculatedLines.map((lineItem, index) => {
    const allocatedInvoiceDiscountCents = invoiceDiscountAllocations[index];
    const adjustedLineSubtotalCents = Math.max(0, lineItem.lineSubtotalCents - allocatedInvoiceDiscountCents);
    const adjustedLineGstCents = calculateTaxCents(adjustedLineSubtotalCents, currency, lineItem.taxMode);

    return {
      ...lineItem,
      lineSubtotalCents: adjustedLineSubtotalCents,
      lineGstCents: adjustedLineGstCents,
      lineTotalCents: adjustedLineSubtotalCents + adjustedLineGstCents
    };
  });

  const gstCents = adjustedLines.reduce((sum, lineItem) => sum + lineItem.lineGstCents, 0);

  const totals: CalculatedInvoiceTotals = {
    subtotalCents,
    discountCents,
    gstCents,
    totalCents: subtotalCents - discountCents + gstCents
  };

  return {
    lineItems: adjustedLines,
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
