import { APP_TIMEZONE, toDateTimeLocalValue as toAppDateTimeLocalValue } from "@/lib/time";

export function toDateTimeLocalValue(iso: string): string {
  return toAppDateTimeLocalValue(iso);
}

export function toMoneyInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-AU", {
    timeZone: APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const kb = sizeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function readApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as Record<string, unknown>).error);
  }
  return fallback;
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      if (text) {
        const normalizedText = stripHtmlTags(text);
        extracted = normalizedText ? normalizedText.slice(0, 160) : fallback;
      }
    } catch {
      // Ignored
    }
  }
  return extracted;
}
