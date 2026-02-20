type ParseAudInputResult = {
  cents: number | null;
  error?: string;
};

/**
 * Parses flexible AUD inputs (`$50`, `$50.00`, `50`, `50.00`) into integer cents.
 * Commas and surrounding spaces are accepted to reduce admin entry friction.
 */
export function parseAudInputToCents(rawInput: string): ParseAudInputResult {
  const normalized = rawInput.trim().replaceAll(",", "");
  if (!normalized) {
    return { cents: null };
  }

  const withoutCurrency = normalized.startsWith("$") ? normalized.slice(1).trim() : normalized;
  if (!withoutCurrency) {
    return { cents: null, error: "Enter a valid amount." };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(withoutCurrency)) {
    return { cents: null, error: "Use formats like $50, 50, or 50.00." };
  }

  const parsed = Number.parseFloat(withoutCurrency);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { cents: null, error: "Amount must be zero or greater." };
  }

  return {
    cents: Math.round(parsed * 100)
  };
}
