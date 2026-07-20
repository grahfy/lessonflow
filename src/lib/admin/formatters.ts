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

/** Per-field validation messages keyed by the payload field name. */
export type ApiFieldErrors = Record<string, string>;

/** How many field messages the summary line shows before collapsing the rest. */
const SUMMARY_FIELD_LIMIT = 3;

export interface ApiErrorDetail {
  /** Human-readable summary, already enriched with field names when available. */
  message: string;
  /** Field-level messages from a Zod `error.flatten()` body, if the route sent one. */
  fieldErrors: ApiFieldErrors;
}

/**
 * Extracts per-field messages from an API error body shaped like
 * `{ error, details: zodError.flatten() }`. Keeps only the first message per
 * field — forms show one line under each input.
 *
 * Note: `flatten()` only reports top-level keys, so a failure inside a nested
 * or array schema is attributed to the parent key with the child's message and
 * no index. Only render these inline for flat payloads.
 */
export function readApiFieldErrors(payload: unknown): ApiFieldErrors {
  const details = (payload as { details?: unknown } | null)?.details;
  const raw = (details as { fieldErrors?: unknown } | null)?.fieldErrors;
  if (!raw || typeof raw !== "object") {
    return {};
  }
  // Require the real `flatten()` shape. `ValidationError.details` lands in the
  // same slot but carries hand-thrown, sometimes input-echoing messages that
  // should not be promoted into the summary line.
  if (!Array.isArray((details as { formErrors?: unknown }).formErrors)) {
    return {};
  }

  const fieldErrors: ApiFieldErrors = {};
  for (const [field, messages] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(messages) && typeof messages[0] === "string") {
      fieldErrors[field] = messages[0];
    }
  }
  return fieldErrors;
}

/** Converts a camelCase payload key into a readable label ("firstName" -> "First name"). */
export function humanizeFieldName(field: string): string {
  // A trailing id is a storage detail: "primaryTeacherId" reads as "Primary
  // teacher" to the admin looking at a teacher picker. The boundary must be a
  // real one — a camelCase "Id" or a separated "_id" — or this eats the tail of
  // ordinary words, since "paidAt", "isValid", and "uuid" all end in "id".
  const withoutIdSuffix = field.replace(/(?:([a-z0-9])Id|[_-]id)$/, "$1") || field;
  const spaced = withoutIdSuffix
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Prefixes a message with its field name, unless the message already opens with
 * it.
 *
 * RATIONALE: the customer schemas self-label ("House number is required."), so
 * prefixing would stutter. Other admin schemas do not — `invoices/currency.ts`
 * says only "Enter a valid amount.", which is ambiguous on its own when two
 * money fields fail in the same request.
 */
function labelMessage(field: string, detail: string): string {
  const label = humanizeFieldName(field);
  if (detail.toLowerCase().startsWith(label.toLowerCase())) {
    return detail;
  }
  return `${label}: ${detail}`;
}

/**
 * Builds a "Field: message" summary, but only when every message is prose a
 * user can act on.
 *
 * Most routes still validate with bare Zod chains, whose default messages are
 * developer strings ("String must contain at least 1 character(s)", "Required").
 * Those read worse than the route's own "Invalid <noun> payload." summary, so
 * they stay out of the summary line — they are still returned as `fieldErrors`
 * for forms that render them inline against a labelled input.
 *
 * Returns null when the summary would be worse than the route's message.
 */
function summarizeFieldErrors(fieldErrors: ApiFieldErrors): string | null {
  const entries = Object.entries(fieldErrors);
  if (entries.length === 0) {
    return null;
  }
  // Hand-written messages are full sentences; Zod's defaults are not.
  if (!entries.every(([, detail]) => /[.!?]$/.test(detail))) {
    return null;
  }
  const messages = entries.map(([field, detail]) => labelMessage(field, detail));
  if (messages.length <= SUMMARY_FIELD_LIMIT) {
    return messages.join(" ");
  }
  return `${messages.slice(0, SUMMARY_FIELD_LIMIT).join(" ")} And ${messages.length - SUMMARY_FIELD_LIMIT} more.`;
}

/**
 * Reads an API error response into a summary message plus any field-level
 * messages. When the route sent actionable field errors, the summary names the
 * offending fields instead of a bare "Invalid ... payload."
 */
export async function readApiErrorDetail(response: Response, fallback: string): Promise<ApiErrorDetail> {
  const contentType = response.headers.get("content-type") || "";
  let message: string = fallback;
  let fieldErrors: ApiFieldErrors = {};

  if (contentType.includes("application/json")) {
    try {
      const json = await response.json();
      message = readApiErrorMessage(json, fallback);
      fieldErrors = readApiFieldErrors(json);
    } catch {
      // Ignored
    }
  } else {
    try {
      const text = await response.text();
      if (text) {
        const normalizedText = stripHtmlTags(text);
        message = normalizedText ? normalizedText.slice(0, 160) : fallback;
      }
    } catch {
      // Ignored
    }
  }

  return {
    message: summarizeFieldErrors(fieldErrors) ?? message,
    fieldErrors
  };
}

export async function readApiErrorFromResponse(response: Response, fallback: string): Promise<string> {
  const { message } = await readApiErrorDetail(response, fallback);
  return message;
}
