/**
 * WCAG 2 contrast-ratio check for the promo popup admin preview (AC-33).
 *
 * Pure, framework-free: no DOM (`getComputedStyle`, canvas) — just the
 * relative-luminance formula over two hex colours, so the admin preview can
 * warn (never block) on hard-to-read text-on-background combinations.
 */

export interface ContrastResult {
  /** Contrast ratio between the two colours, from 1 (identical) to 21 (black vs white). */
  ratio: number;
  /** Whether `ratio` clears the WCAG AA threshold for normal-size text. */
  passesAA: boolean;
}

/** WCAG 2 AA minimum contrast ratio for normal-size text. */
export const WCAG_AA_NORMAL_TEXT_RATIO = 4.5;

/** Parses a 3- or 6-digit hex colour, with or without a leading `#`. Returns `null` for anything else. */
function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") {
    return null;
  }
  const clean = hex.trim().replace(/^#/, "");
  let sixDigit: string;
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    sixDigit = clean
      .split("")
      .map((ch) => ch + ch)
      .join("");
  } else if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    sixDigit = clean;
  } else {
    return null;
  }
  return {
    r: parseInt(sixDigit.slice(0, 2), 16),
    g: parseInt(sixDigit.slice(2, 4), 16),
    b: parseInt(sixDigit.slice(4, 6), 16)
  };
}

/** sRGB channel (0-255) to linear-light value, per the WCAG relative-luminance formula. */
function linearizeChannel(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an sRGB colour (0 = black, 1 = white). */
function relativeLuminance(color: { r: number; g: number; b: number }): number {
  return (
    0.2126 * linearizeChannel(color.r) +
    0.7152 * linearizeChannel(color.g) +
    0.0722 * linearizeChannel(color.b)
  );
}

/**
 * Computes the WCAG contrast ratio between two hex colours (order doesn't
 * matter — the lighter one is always the numerator).
 *
 * Returns `null` for unparseable input (wrong length, non-hex characters,
 * non-string) rather than throwing: this feeds a non-blocking preview
 * warning, so the caller should treat `null` as "can't tell" and skip the
 * warning rather than crash the form.
 */
export function getContrastRatio(colorHexA: string, colorHexB: string): ContrastResult | null {
  const parsedA = parseHexColor(colorHexA);
  const parsedB = parseHexColor(colorHexB);
  if (!parsedA || !parsedB) {
    return null;
  }
  const luminanceA = relativeLuminance(parsedA);
  const luminanceB = relativeLuminance(parsedB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return { ratio, passesAA: ratio >= WCAG_AA_NORMAL_TEXT_RATIO };
}
