type ParseAudInputResult = {
  cents: number | null;
  error?: string;
};

type ParsePercentInputResult = {
  basisPoints: number | null;
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
