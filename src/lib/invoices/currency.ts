import { getInvoiceCurrency, getInvoiceCurrencyLocale } from "@/lib/invoices/tax-profile";

type ParseAudInputResult = {
  cents: number | null;
  error?: string;
};

type ParsePercentInputResult = {
  basisPoints: number | null;
  error?: string;
};

type ParseMoneyInputResult = {
  cents: number | null;
  error?: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCurrencyFractionDigits(currency?: string): number {
  return new Intl.NumberFormat(getInvoiceCurrencyLocale(currency), {
    style: "currency",
    currency: getInvoiceCurrency(currency)
  }).resolvedOptions().maximumFractionDigits ?? 2;
}

function buildMoneyPattern(fractionDigits: number): RegExp {
  if (fractionDigits === 0) {
    return /^\d+$/;
  }

  return new RegExp(`^\\d+(\\.\\d{1,${fractionDigits}})?$`);
}

export function formatCurrency(cents: number, currency?: string): string {
  const resolvedCurrency = getInvoiceCurrency(currency);
  return new Intl.NumberFormat(getInvoiceCurrencyLocale(resolvedCurrency), {
    style: "currency",
    currency: resolvedCurrency
  }).format(cents / 100);
}

/**
 * Parses flexible money inputs into integer minor units for the selected currency.
 * Commas and surrounding spaces are accepted to reduce admin entry friction.
 */
export function parseMoneyInputToCents(rawInput: string, currency?: string): ParseMoneyInputResult {
  const resolvedCurrency = getInvoiceCurrency(currency);
  const normalized = rawInput.trim().replaceAll(",", "");
  if (!normalized) {
    return { cents: null };
  }

  const displayParts = new Intl.NumberFormat(getInvoiceCurrencyLocale(resolvedCurrency), {
    style: "currency",
    currency: resolvedCurrency
  }).formatToParts(1);
  const currencySymbol = displayParts.find((part) => part.type === "currency")?.value || "";
  const currencyPrefix = currencySymbol ? new RegExp(`^${escapeRegex(currencySymbol)}\\s*`) : null;
  const withoutCurrency = currencyPrefix ? normalized.replace(currencyPrefix, "") : normalized.replace(/^[^\d]+/, "");
  if (!withoutCurrency) {
    return { cents: null, error: "Enter a valid amount." };
  }

  const fractionDigits = getCurrencyFractionDigits(resolvedCurrency);
  if (!buildMoneyPattern(fractionDigits).test(withoutCurrency)) {
    return { cents: null, error: "Use a valid currency amount, for example 50 or 50.00." };
  }

  const parsed = Number.parseFloat(withoutCurrency);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { cents: null, error: "Amount must be zero or greater." };
  }

  return {
    cents: Math.round(parsed * 10 ** fractionDigits)
  };
}

export function parseAudInputToCents(rawInput: string): ParseAudInputResult {
  return parseMoneyInputToCents(rawInput, "AUD");
}

/**
 * Parses percentage inputs like `10`, `10.5`, or `10.25%` into basis points.
 */
export function parsePercentageInputToBasisPoints(rawInput: string): ParsePercentInputResult {
  const normalized = rawInput.trim().replaceAll(",", "");
  if (!normalized) {
    return { basisPoints: null };
  }

  const withoutPercent = normalized.endsWith("%") ? normalized.slice(0, -1).trim() : normalized;
  if (!withoutPercent) {
    return { basisPoints: null, error: "Enter a valid percentage." };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(withoutPercent)) {
    return { basisPoints: null, error: "Use formats like 10, 10.5, or 10.25%." };
  }

  const parsed = Number.parseFloat(withoutPercent);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { basisPoints: null, error: "Percentage must be between 0 and 100." };
  }

  return {
    basisPoints: Math.round(parsed * 100)
  };
}

export function basisPointsToPercentageInput(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
}
