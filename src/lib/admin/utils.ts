import { APP_TIMEZONE } from "@/lib/time";
import type { AuState } from "@/lib/admin/types";

export function toAuState(value: string): AuState {
    return value as AuState;
}

export function toDigits(value: string, max: number): string {
    return value.replace(/\D/g, "").slice(0, max);
}

export function formatBytes(sizeBytes: number): string {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    const kb = sizeBytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

export function formatDateTime(value: string) {
    return new Date(value).toLocaleString("en-AU", {
        timeZone: APP_TIMEZONE,
        dateStyle: "medium",
        timeStyle: "short",
    });
}

export function readApiErrorMessage(payload: unknown, fallback: string): string {
    if (typeof payload === "object" && payload !== null && "error" in payload) {
        return String((payload as Record<string, unknown>).error);
    }
    return fallback;
}

export async function readApiErrorFromResponse(response: Response, fallback: string): Promise<string> {
    const contentType = response.headers.get("content-type") || "";
    let extracted: string = fallback;
    if (contentType.includes("application/json")) {
        try {
            const json = await response.json();
            extracted = readApiErrorMessage(json, fallback);
        } catch {
            // Ignored
        }
    } else {
        try {
            const text = await response.text();
            if (text) extracted = text.slice(0, 100);
        } catch {
            // Ignored
        }
    }
    return extracted;
}
