export type EmailRecordDirection = "inbound" | "outbound";

export interface EmailRecord {
  id: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  status: string;
  provider?: string;
  source?: string;
  error?: string;
  createdAt: string;
  direction: EmailRecordDirection;
}

export type EmailViewerContent =
  | { kind: "html"; value: string }
  | { kind: "text"; value: string }
  | { kind: "empty"; value: "" };

const HTML_EMAIL_BODY_PATTERN = /<(?:!doctype|html|head|body|div|p|br|span|table|tbody|thead|tr|td|th|img|a|ul|ol|li|strong|em|style|blockquote|pre|h[1-6])(?:\s|>|\/)/i;
const EMAIL_PREVIEW_MAX_LENGTH = 160;

function normalizeEmailBodyValue(value?: string | null): string {
  return value?.trim() || "";
}

function looksLikeHtmlEmailBody(value: string): boolean {
  return HTML_EMAIL_BODY_PATTERN.test(value.trim());
}

function stripHtmlEmailBody(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function normalizePreviewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncatePreviewText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

/**
 * Normalizes a stored email body into the shared `EmailRecord` shape.
 * Plain-text payloads stay in `textBody`; renderable HTML stays in `htmlBody`.
 */
export function getEmailRecordBodyFields(body?: string | null): Pick<EmailRecord, "htmlBody" | "textBody"> {
  const normalizedBody = normalizeEmailBodyValue(body);
  if (!normalizedBody) {
    return {};
  }

  if (looksLikeHtmlEmailBody(normalizedBody)) {
    return { htmlBody: normalizedBody };
  }

  return { textBody: normalizedBody };
}

/**
 * Selects the best body representation for the email viewer.
 * RATIONALE: Older rows may have plain text stored in `htmlBody`, so the viewer
 * needs a shared fallback path instead of assuming the field is always HTML.
 */
export function getEmailViewerContent(email: Pick<EmailRecord, "htmlBody" | "textBody">): EmailViewerContent {
  const normalizedHtmlBody = normalizeEmailBodyValue(email.htmlBody);
  if (normalizedHtmlBody) {
    if (looksLikeHtmlEmailBody(normalizedHtmlBody)) {
      return { kind: "html", value: normalizedHtmlBody };
    }

    return { kind: "text", value: normalizedHtmlBody };
  }

  const normalizedTextBody = normalizeEmailBodyValue(email.textBody);
  if (normalizedTextBody) {
    return { kind: "text", value: normalizedTextBody };
  }

  return { kind: "empty", value: "" };
}

/**
 * Derives a compact single-line preview for shared email-history rows.
 * RATIONALE: Reusing viewer content keeps preview selection aligned with the
 * full-message dialog while still degrading HTML to readable text snippets.
 */
export function getEmailPreviewText(
  email: Pick<EmailRecord, "htmlBody" | "textBody">,
  maxLength: number = EMAIL_PREVIEW_MAX_LENGTH
): string {
  const viewerContent = getEmailViewerContent(email);
  if (viewerContent.kind === "empty") {
    return "";
  }

  const rawPreview =
    viewerContent.kind === "html"
      ? stripHtmlEmailBody(viewerContent.value)
      : viewerContent.value;
  const normalizedPreview = normalizePreviewText(rawPreview);

  if (!normalizedPreview) {
    return "";
  }

  return truncatePreviewText(normalizedPreview, maxLength);
}

export type EmailRefreshResult = {
  ok: boolean;
  gmail?: GmailRefreshSummary;
  imap?: EmailProviderRefreshCounts;
};

export type EmailProviderRefreshCounts = {
  importedCount: number;
  skippedCount: number;
};

export type GmailRefreshSummary = EmailProviderRefreshCounts & {
  degradedReadAccess?: boolean;
  warning?: string;
};

export function getEmailSourceLabel(source?: string): string | null {
  switch (source) {
    case "app":
      return "via App";
    case "gmail":
      return "via Gmail";
    case "imap":
      return "via IMAP";
    default:
      return source ? `via ${source}` : null;
  }
}
