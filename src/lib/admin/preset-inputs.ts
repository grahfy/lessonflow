import { toMoneyInput } from "@/lib/admin/formatters";
import { basisPointsToPercentageInput, parseAudInputToCents, parsePercentageInputToBasisPoints } from "@/lib/invoices/currency";

export type PresetDiscountKind = "amount" | "percent" | null;

type NormalizePresetInputResult = {
  input: string;
  error?: string;
};

type SerializePresetNumberResult = {
  value: number | null;
  error?: string;
};

/**
 * Formats an existing persisted preset discount value back into the editor's input shape.
 * @param kind - Saved discount kind for the preset
 * @param value - Saved numeric discount value
 * @returns UI-ready input text for the discount editor
 */
export function formatPresetDiscountInput(kind: PresetDiscountKind, value: number | null | undefined): string {
  if (!kind || value === null || value === undefined) {
    return "";
  }

  return kind === "percent" ? basisPointsToPercentageInput(value) : toMoneyInput(value);
}

/**
 * Normalizes a free-form AUD amount after editing without forcing formatting on each keystroke.
 * @param rawInput - User-entered amount text
 * @returns Canonical money input text or the validation error
 */
export function normalizePresetAmountInput(rawInput: string): NormalizePresetInputResult {
  if (!rawInput.trim()) {
    return { input: "" };
  }

  const parsed = parseAudInputToCents(rawInput);
  if (parsed.cents === null) {
    return { input: rawInput, error: parsed.error || "Enter a valid amount." };
  }

  return { input: toMoneyInput(parsed.cents) };
}

/**
 * Serializes a free-form AUD amount into cents for preset persistence.
 * @param rawInput - User-entered amount text
 * @returns Integer cents or a validation error when the input is malformed
 */
export function serializePresetAmountInput(rawInput: string): SerializePresetNumberResult {
  if (!rawInput.trim()) {
    return { value: 0 };
  }

  const parsed = parseAudInputToCents(rawInput);
  if (parsed.cents === null) {
    return { value: null, error: parsed.error || "Enter a valid amount." };
  }

  return { value: parsed.cents };
}

/**
 * Normalizes a preset discount input after blur based on the active discount kind.
 * @param kind - Current discount mode selected in the editor
 * @param rawInput - User-entered discount text
 * @returns Canonical input text for the selected discount mode
 */
export function normalizePresetDiscountInput(kind: PresetDiscountKind, rawInput: string): NormalizePresetInputResult {
  if (!kind || !rawInput.trim()) {
    return { input: "" };
  }

  if (kind === "amount") {
    return normalizePresetAmountInput(rawInput);
  }

  const parsed = parsePercentageInputToBasisPoints(rawInput);
  if (parsed.basisPoints === null) {
    return { input: rawInput, error: parsed.error || "Enter a valid percentage." };
  }

  return { input: basisPointsToPercentageInput(parsed.basisPoints) };
}

/**
 * Serializes a preset discount input into the saved numeric representation.
 * @param kind - Current discount mode selected in the editor
 * @param rawInput - User-entered discount text
 * @returns Cents, basis points, or null when no discount applies
 */
export function serializePresetDiscountInput(kind: PresetDiscountKind, rawInput: string): SerializePresetNumberResult {
  if (!kind) {
    return { value: null };
  }

  if (!rawInput.trim()) {
    return kind === "amount"
      ? { value: 0 }
      : { value: null, error: "Enter a valid percentage." };
  }

  if (kind === "amount") {
    return serializePresetAmountInput(rawInput);
  }

  const parsed = parsePercentageInputToBasisPoints(rawInput);
  if (parsed.basisPoints === null) {
    return { value: null, error: parsed.error || "Enter a valid percentage." };
  }

  return { value: parsed.basisPoints };
}
