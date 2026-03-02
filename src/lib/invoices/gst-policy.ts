import { InvoiceTaxMode } from "@/generated/prisma/client";

/**
 * Parses a boolean-like environment variable using conservative defaults.
 */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

/**
 * Returns whether the business is currently configured as GST-registered.
 */
export function isInvoiceGstRegistered(): boolean {
  return parseBoolean(process.env.INVOICE_GST_REGISTERED, false);
}

/**
 * Returns the system default tax mode for newly created line items/invoices.
 */
export function getDefaultInvoiceTaxMode(): InvoiceTaxMode {
  const configured = process.env.INVOICE_DEFAULT_TAX_MODE?.trim().toLowerCase();
  if (configured === "taxable" || configured === "gst_free") {
    return configured;
  }
  return isInvoiceGstRegistered() ? "taxable" : "gst_free";
}

/**
 * Returns whether GST can be applied for a given line tax mode and registration state.
 */
export function shouldApplyGst(taxMode: InvoiceTaxMode): boolean {
  return isInvoiceGstRegistered() && taxMode === "taxable";
}
