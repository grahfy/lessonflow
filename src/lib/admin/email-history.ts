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

function normalizeEmailBodyValue(value?: string | null): string {
  return value?.trim() || "";
}

function looksLikeHtmlEmailBody(value: string): boolean {
  return HTML_EMAIL_BODY_PATTERN.test(value.trim());
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

export type EmailRefreshResult = {
  ok: boolean;
  gmail?: {
    importedCount: number;
    skippedCount: number;
  };
  imap?: {
    importedCount: number;
    skippedCount: number;
  };
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
