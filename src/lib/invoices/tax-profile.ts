import { InvoiceTaxMode } from "@/generated/prisma/client";

import { getDefaultCurrency } from "@/lib/branding";

type InvoiceTaxProfileConfig = {
  locale?: string;
  taxLabel?: string;
  taxRateBasisPoints?: number;
  registered?: boolean;
  defaultTaxMode?: InvoiceTaxMode;
};

export type InvoiceTaxProfile = {
  currency: string;
  locale: string;
  taxLabel: string;
  taxRateBasisPoints: number;
  registered: boolean;
  defaultTaxMode: InvoiceTaxMode;
};

const DEFAULT_CURRENCY_LOCALES: Record<string, string> = {
  AUD: "en-AU",
  CAD: "en-CA",
  EUR: "en-IE",
  GBP: "en-GB",
  NZD: "en-NZ",
  SGD: "en-SG",
  USD: "en-US"
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeCurrency(value?: string | null): string {
  const candidate = value?.trim().toUpperCase() || getDefaultCurrency();
  return /^[A-Z]{3}$/.test(candidate) ? candidate : "AUD";
}

function parseConfiguredProfiles(): Record<string, InvoiceTaxProfileConfig> {
  const raw = process.env.INVOICE_TAX_PROFILES;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, InvoiceTaxProfileConfig>;
    return Object.fromEntries(
      Object.entries(parsed).map(([currency, config]) => [normalizeCurrency(currency), config ?? {}])
    );
  } catch {
    return {};
  }
}

function getAudTaxProfile(): InvoiceTaxProfile {
  const registered = parseBoolean(process.env.INVOICE_GST_REGISTERED, false);
  const configuredTaxMode = process.env.INVOICE_DEFAULT_TAX_MODE?.trim().toLowerCase();
  const defaultTaxMode =
    configuredTaxMode === "taxable" || configuredTaxMode === "gst_free"
      ? (configuredTaxMode as InvoiceTaxMode)
      : registered
        ? "taxable"
        : "gst_free";

  return {
    currency: "AUD",
    locale: "en-AU",
    taxLabel: "GST",
    taxRateBasisPoints: 1000,
    registered,
    defaultTaxMode
  };
}

function getFallbackProfile(currency: string): InvoiceTaxProfile {
  if (currency === "AUD") {
    return getAudTaxProfile();
  }

  return {
    currency,
    locale: DEFAULT_CURRENCY_LOCALES[currency] ?? "en-US",
    taxLabel: "Tax",
    taxRateBasisPoints: 0,
    registered: false,
    defaultTaxMode: "gst_free"
  };
}

/**
 * Resolves the tax/currency behavior for an invoice currency.
 *
 * RATIONALE: Currency alone cannot determine the legally correct tax regime for
 * every market. Non-AUD currencies therefore use safe defaults unless the
 * operator configures an explicit entry in `INVOICE_TAX_PROFILES`.
 */
export function getInvoiceTaxProfile(currency?: string | null): InvoiceTaxProfile {
  const resolvedCurrency = normalizeCurrency(currency);
  const fallback = getFallbackProfile(resolvedCurrency);
  const configured = parseConfiguredProfiles()[resolvedCurrency];

  if (!configured) {
    return fallback;
  }

  return {
    currency: resolvedCurrency,
    locale: configured.locale?.trim() || fallback.locale,
    taxLabel: configured.taxLabel?.trim() || fallback.taxLabel,
    taxRateBasisPoints:
      typeof configured.taxRateBasisPoints === "number" && Number.isFinite(configured.taxRateBasisPoints)
        ? Math.max(0, Math.trunc(configured.taxRateBasisPoints))
        : fallback.taxRateBasisPoints,
    registered: typeof configured.registered === "boolean" ? configured.registered : fallback.registered,
    defaultTaxMode:
      configured.defaultTaxMode === "taxable" || configured.defaultTaxMode === "gst_free"
        ? configured.defaultTaxMode
        : fallback.defaultTaxMode
  };
}

export function getInvoiceCurrency(currency?: string | null): string {
  return getInvoiceTaxProfile(currency).currency;
}

export function getInvoiceCurrencyLocale(currency?: string | null): string {
  return getInvoiceTaxProfile(currency).locale;
}

export function getInvoiceTaxLabel(currency?: string | null): string {
  return getInvoiceTaxProfile(currency).taxLabel;
}

export function getDefaultInvoiceTaxModeForCurrency(currency?: string | null): InvoiceTaxMode {
  return getInvoiceTaxProfile(currency).defaultTaxMode;
}

export function shouldApplyInvoiceTax(currency: string | undefined, taxMode: InvoiceTaxMode): boolean {
  const profile = getInvoiceTaxProfile(currency);
  return profile.registered && profile.taxRateBasisPoints > 0 && taxMode === "taxable";
}

export function calculateInvoiceTaxCents(subtotalCents: number, currency: string | undefined, taxMode: InvoiceTaxMode): number {
  if (!shouldApplyInvoiceTax(currency, taxMode)) {
    return 0;
  }

  const rate = getInvoiceTaxProfile(currency).taxRateBasisPoints / 10_000;
  return Math.round(subtotalCents * rate);
}
