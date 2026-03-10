/**
 * GST Policy Service
 * 
 * Defines the core rules for Australian GST applicability in LessonFlow.
 * 
 * ARCHITECTURAL RATIONALE:
 * - Compliance: Single point of truth for whether the business is GST-registered.
 * - Flexibility: Supports schools that are transitionary (e.g. crossing registration 
 *   thresholds) via environment variable toggles.
 * - Consistency: Synchronizes tax behavior across DB calculations, Invoice PDFs, 
 *   and UI components to avoid "rounding" or "mis-match" errors.
 */

import { InvoiceTaxMode } from "@/generated/prisma/client";

/**
 * Parses environment variables into booleans with strict truthy/falsy sets.
 * Used for critical business toggles like GST registration.
 */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  
  return fallback;
}

/**
 * Returns whether the school is registered for GST.
 * 
 * NOTE: If false, GST will be 0 on ALL invoices regardless of individual 
 * line item settings. This prevents non-registered sole traders from 
 * accidentally charging tax they aren't authorized to collect.
 */
export function isInvoiceGstRegistered(): boolean {
  return parseBoolean(process.env.INVOICE_GST_REGISTERED, false);
}

/**
 * Determines the default Tax Mode for new line items.
 * 
 * LOGIC:
 * 1. Honors explicit `INVOICE_DEFAULT_TAX_MODE` override.
 * 2. Defaults to 'taxable' for registered businesses, 'gst_free' otherwise.
 */
export function getDefaultInvoiceTaxMode(): InvoiceTaxMode {
  const configured = process.env.INVOICE_DEFAULT_TAX_MODE?.trim().toLowerCase();
  
  if (configured === "taxable" || configured === "gst_free") {
    return configured as InvoiceTaxMode;
  }
  
  return isInvoiceGstRegistered() ? "taxable" : "gst_free";
}

/**
 * Predicate to decide if GST math should run for a specific context.
 * 
 * RATIONALE: To apply GST, the entity must be registered AND the 
 * specific item (e.g. textbook vs tuition) must be marked taxable.
 */
export function shouldApplyGst(taxMode: InvoiceTaxMode): boolean {
  return isInvoiceGstRegistered() && taxMode === "taxable";
}
