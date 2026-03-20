/**
 * Australian GST Compliance Policy
 * 
 * Defines the core rules for GST applicability within LessonFlow.
 * 
 * ARCHITECTURAL RATIONALE:
 * 1. Legal Compliance: Single source of truth for whether the business entity 
 *    is registered for GST. This is critical for generating valid Tax Invoices.
 * 2. Risk Mitigation: If `INVOICE_GST_REGISTERED` is false, the system 
 *    hard-overrides all tax calculations to zero. This prevents unregistered 
 *    sole traders from accidentally charging tax they aren't authorized to collect.
 * 3. Environment Driven: Uses environment variables to allow seamless 
 *    transitions once a business crosses the ATO registration threshold.
 */

import { InvoiceTaxMode } from "@/generated/prisma/client";

import {
  calculateInvoiceTaxCents,
  getDefaultInvoiceTaxModeForCurrency,
  getInvoiceTaxLabel,
  getInvoiceTaxProfile,
  shouldApplyInvoiceTax
} from "@/lib/invoices/tax-profile";

/**
 * Global entity registration check.
 * 
 * NOTE: This is the 'Master Switch'. If this returns false, the entire 
 * invoicing engine treats every transaction as non-taxable regardless 
 * of line-item settings.
 */
export function isInvoiceGstRegistered(): boolean {
  return getInvoiceTaxProfile("AUD").registered;
}

/**
 * Fallback Tax Mode for new line items.
 * 
 * LOGIC:
 * 1. If an override is set via `INVOICE_DEFAULT_TAX_MODE`, we use it.
 * 2. Otherwise, we default to 'taxable' if registered, or 'gst_free' 
 *    to align with registration status.
 */
export function getDefaultInvoiceTaxMode(): InvoiceTaxMode {
  return getDefaultInvoiceTaxModeForCurrency("AUD");
}

/**
 * Final determination for tax calculation.
 * 
 * @param taxMode - The specific mode assigned to a line item (e.g. gst_free, taxable)
 * @returns True if and only if both the BUSINESS is registered AND the LINE is taxable.
 */
export function shouldApplyGst(taxMode: InvoiceTaxMode): boolean {
  return shouldApplyInvoiceTax("AUD", taxMode);
}

export function getInvoiceTaxName(currency?: string | null): string {
  return getInvoiceTaxLabel(currency);
}

export function getDefaultInvoiceTaxModeForCurrencyValue(currency?: string | null): InvoiceTaxMode {
  return getDefaultInvoiceTaxModeForCurrency(currency);
}

export function shouldApplyTax(currency: string | undefined, taxMode: InvoiceTaxMode): boolean {
  return shouldApplyInvoiceTax(currency, taxMode);
}

export function calculateTaxCents(subtotalCents: number, currency: string | undefined, taxMode: InvoiceTaxMode): number {
  return calculateInvoiceTaxCents(subtotalCents, currency, taxMode);
}
