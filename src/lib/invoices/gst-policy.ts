/**
 * GST Policy Service
 * 
 * This module defines the rules for GST applicability in the LessonFlow invoicing system.
 * It determines whether the school is GST-registered and how that affects 
 * default tax modes and line item calculations.
 * 
 * RATIONALE: Australian tax law requires clear differentiation between GST-registered
 * and non-registered entities. This centralized policy ensures consistency across
 * PDF generation, DB persistence, and UI display.
 */

import { InvoiceTaxMode } from "@/generated/prisma/client";

/**
 * Utility to parse environment variables into booleans with safe fallbacks.
 * 
 * @param value - The raw environment variable string
 * @param fallback - The value to return if the string is undefined or invalid
 */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  // We explicitly check for common truthy/falsy strings to prevent misconfiguration
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

/**
 * Checks if the business is officially GST-registered via environment configuration.
 * When true, taxable items will incur 10% GST.
 * 
 * @returns boolean indicating registration status
 */
export function isInvoiceGstRegistered(): boolean {
  return parseBoolean(process.env.INVOICE_GST_REGISTERED, false);
}

/**
 * Provides the system-wide default tax mode for new invoices and line items.
 * 
 * LOGIC:
 * 1. Honors explicit INVOICE_DEFAULT_TAX_MODE if set to "taxable" or "gst_free".
 * 2. If no explicit default, uses "taxable" for registered businesses and "gst_free" otherwise.
 * 
 * @returns InvoiceTaxMode (taxable | gst_free)
 */
export function getDefaultInvoiceTaxMode(): InvoiceTaxMode {
  const configured = process.env.INVOICE_DEFAULT_TAX_MODE?.trim().toLowerCase();
  if (configured === "taxable" || configured === "gst_free") {
    return configured;
  }
  return isInvoiceGstRegistered() ? "taxable" : "gst_free";
}

/**
 * Logic gate for whether GST should be calculated for a given line item.
 * 
 * NOTE: Both the business MUST be registered AND the item MUST be marked as taxable
 * for GST to be computed.
 * 
 * @param taxMode - The specific tax mode of the line item being checked
 * @returns boolean
 */
export function shouldApplyGst(taxMode: InvoiceTaxMode): boolean {
  return isInvoiceGstRegistered() && taxMode === "taxable";
}
