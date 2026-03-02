import type { AuState } from "@/lib/admin/types";

export { formatBytes, formatDateTime, toDateTimeLocalValue, toMoneyInput, toCurrency } from "./formatters";
export { readApiErrorMessage, readApiErrorFromResponse } from "./formatters";

export function toAuState(value: string): AuState {
    return value as AuState;
}

export function toDigits(value: string, max: number): string {
    return value.replace(/\D/g, "").slice(0, max);
}
