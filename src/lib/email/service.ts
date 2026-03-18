/**
 * Unified Email Dispatch & Audit Engine
 * 
 * Provides a resilient API for sending transactional emails (Invoices, Reminders, Portal Access).
 * 
 * DESIGN FEATURES:
 * 1. Provider Agnostic: Supports both standard SMTP (Nodemailer) and Gmail API.
 * 2. High Availability: Implements an automatic "Fall-through" mechanism. If SMTP fails, 
 *    it attempts delivery via the Gmail API as a secondary path.
 * 3. Atomic Audit: Every outbound email attempt is logged to the `OutboundEmail` table 
 *    with its status (sent, failed, or queued_no_smtp).
 * 4. Compliance/Insight: Automatically BCCs the owner email balance for customer-facing 
 *    messages to ensure the teacher sees what the student sees.
 * 
 * RATIONALE: Transactional email is a "Mission Critical" component of the school. 
 * If SMTP fails during an invoice run, we must prioritize delivery via any available 
 * channel before reporting failure.
 */

import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
import { isGmailConfigured, sendGmailEmail } from "@/lib/email/gmail-service";
import {
  EMAIL_SIGNATURE_END_MARKER,
  EMAIL_SIGNATURE_START_MARKER,
  renderEmailLayout
} from "@/lib/email/layout";
import {
  getNotificationSettingsState,
  isAutomatedNotificationEnabled,
  type EmailNotificationMetadata
} from "@/lib/email/notification-settings";
import { renderResolvedSignatureHtml } from "@/lib/email/signature";
import { getOwnerEmail } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";
import { renderTemplate } from "@/lib/email/render";
import { PlaceholderContext } from "@/lib/email/placeholders";

/** Input for standard email sending. */
export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Optional carbon copy recipients. */
  cc?: string | string[];
  /** Optional blind carbon copy recipients. */
  bcc?: string | string[];
  /** Optional file attachments (e.g. Invoices). */
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
  notification?: EmailNotificationMetadata;
  skipNotificationPolicyCheck?: boolean;
};

/** Standardized response for all email delivery attempts. */
export type SendEmailResult = {
  /** 
   * 'sent': Delivered to provider successfully.
   * 'queued_no_smtp': Recorded in DB but no provider was available.
   * 'failed': Provider rejected the message.
   * 'suppressed': Blocked by notification settings before provider delivery.
   */
  status: "sent" | "queued_no_smtp" | "failed" | "suppressed";
  error?: string;
};

/** Reused transporter instance to minimize connection overhead. */
let transporter: nodemailer.Transporter | null = null;

function isFullHtmlDocument(value: string): boolean {
  return /<html[\s>]/i.test(value) || /<!doctype html/i.test(value);
}

async function injectEmailSignature(html: string, subject: string): Promise<string> {
  const baseHtml = isFullHtmlDocument(html)
    ? html
    : renderEmailLayout({
        title: subject,
        contentHtml: html
      });

  const signatureHtml = await renderResolvedSignatureHtml();
  const signatureBlock = `${EMAIL_SIGNATURE_START_MARKER}${signatureHtml}${EMAIL_SIGNATURE_END_MARKER}`;

  if (baseHtml.includes(EMAIL_SIGNATURE_START_MARKER) && baseHtml.includes(EMAIL_SIGNATURE_END_MARKER)) {
    return baseHtml.replace(
      new RegExp(`${EMAIL_SIGNATURE_START_MARKER}[\\s\\S]*?${EMAIL_SIGNATURE_END_MARKER}`),
      signatureBlock
    );
  }

  if (/<\/body>/i.test(baseHtml)) {
    return baseHtml.replace(/<\/body>/i, `${signatureBlock}</body>`);
  }

  return `${baseHtml}${signatureBlock}`;
}

/** 
 * Cleanly extracts the raw email portion from "Name <email@address.com>" 
 * or similar descriptive formats.
 */
function normalizeAddressValue(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  return (bracketMatch?.[1] || trimmed).trim();
}

/** 
 * Aggregates BCC recipients while ensuring uniqueness.
 * RATIONALE: Prevents duplicate deliveries if the owner is already 
 * explicitly in the BCC list.
 */
function mergeBccValues(existing: string | string[] | undefined, extra: string): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  const addValue = (value: string) => {
    const normalized = normalizeAddressValue(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(value);
  };

  if (Array.isArray(existing)) {
    for (const value of existing) addValue(value);
  } else if (typeof existing === "string" && existing.trim()) {
    addValue(existing);
  }

  addValue(extra);
  return merged;
}

/**
 * Returns the owner's email if the target 'to' address is a customer.
 * 
 * RATIONALE: We BCC the owner on customer emails so they have a local copy 
 * in their inbox for historical context and verification.
 */
function getCustomerAuditBccRecipient(to: string): string | null {
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) return null;

  // Don't BCC the owner on emails ALREADY going to the owner (e.g. daily digest).
  if (normalizeAddressValue(to) === normalizeAddressValue(ownerEmail)) return null;

  return ownerEmail;
}

/**
 * Lazy-initializes the SMTP transporter.
 * Returns null if credentials (SMTP_HOST, etc.) are missing.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }
  return transporter;
}

type SendTemplateEmailInput = {
  to: string;
  templateKey: string;
  context: PlaceholderContext;
  /** fallback function if no template row is found in DB. */
  fallbackRenderer: (ctx: PlaceholderContext) => { subject: string; html: string };
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
  notification?: EmailNotificationMetadata;
  skipNotificationPolicyCheck?: boolean;
};

function toPolicyAuditHtml(input: Pick<SendEmailInput, "html" | "subject">): string {
  return isFullHtmlDocument(input.html)
    ? input.html
    : renderEmailLayout({
        title: input.subject,
        contentHtml: input.html
      });
}

async function maybeSuppressAutomatedEmail(input: SendEmailInput): Promise<SendEmailResult | null> {
  if (input.skipNotificationPolicyCheck || input.notification?.triggerMode !== "automated") {
    return null;
  }

  const settings = await getNotificationSettingsState();
  if (isAutomatedNotificationEnabled(settings, input.notification.category)) {
    return null;
  }

  const message = settings.globalAutomatedEmailEnabled
    ? `Automated email for ${input.notification.category} is disabled in notification settings.`
    : "Automated email notifications are disabled in notification settings.";

  await prisma.outboundEmail.create({
    data: {
      toEmail: input.to,
      subject: input.subject,
      htmlBody: toPolicyAuditHtml(input),
      status: "suppressed",
      provider: "policy",
      source: "app",
      error: message
    }
  });
  logEvent("email.suppressed", {
    to: input.to,
    subject: input.subject,
    category: input.notification.category
  });

  return {
    status: "suppressed",
    error: message
  };
}

/**
 * High-level helper for sending templated emails.
 * Merges DB-stored templates with runtime placeholders (e.g. {{student_name}}).
 * 
 * @param input - Recipient, Template Key, and dynamic Context
 */
export async function sendTemplateEmail(input: SendTemplateEmailInput): Promise<SendEmailResult> {
  const rendered = await renderTemplate(input.templateKey, input.context, input.fallbackRenderer);
  
  return sendEmail({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments,
    notification: input.notification,
    skipNotificationPolicyCheck: input.skipNotificationPolicyCheck
  });
}

/**
 * Core delivery logic with Audit logging and multi-provider failover.
 * 
 * LOGIC:
 * 1. Checks `EMAIL_PROVIDER` preference.
 * 2. Attempts SMTP primary delivery if configured.
 * 3. Fallbacks to Gmail API if SMTP fails and Gmail is configured.
 * 4. Logs the final outcome in `OutboundEmail` table.
 * 
 * @param input - Message body and attachments
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const suppressedResult = await maybeSuppressAutomatedEmail(input);
  if (suppressedResult) {
    return suppressedResult;
  }

  const from = process.env.SMTP_FROM || "LessonFlow <no-reply@example.com>";
  const provider = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
  const tx = getTransporter();
  const ownerBcc = getCustomerAuditBccRecipient(input.to);
  const bcc = ownerBcc ? mergeBccValues(input.bcc, ownerBcc) : input.bcc;
  const html = await injectEmailSignature(input.html, input.subject);
  const providerInput = {
    to: input.to,
    subject: input.subject,
    html: input.html,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments
  };

  const gmailConfigured = isGmailConfigured();

  // STEP 1: GMAIL PROVIDER PATH (Explicitly requested or only live provider available)
  if (provider === "gmail" || (!tx && gmailConfigured)) {
    if (gmailConfigured) {
      const gmailResult = await sendGmailEmail({ ...providerInput, html, bcc });
      if (gmailResult.status === "sent") {
        logEvent("email.sent_via_gmail", { to: input.to, subject: input.subject });
        return gmailResult;
      }

      if (!tx) {
        return gmailResult;
      }

      logError("email.gmail_failed_attempting_smtp", gmailResult.error || "Unknown Gmail error", {
        to: input.to,
        subject: input.subject
      });
    } else if (!tx) {
      await prisma.outboundEmail.create({
        data: {
          toEmail: input.to,
          subject: input.subject,
          htmlBody: html,
          status: "queued_no_smtp",
          provider: "smtp",
          source: "app",
          error: "EMAIL_PROVIDER is set to gmail but GMAIL credentials are missing."
        }
      });
      logEvent("email.queued_no_provider", { to: input.to, subject: input.subject, provider });
      return {
        status: "queued_no_smtp",
        error: "EMAIL_PROVIDER is set to gmail but GMAIL credentials are missing."
      };
    }
  }

  // STEP 2: SMTP PROVIDER PATH (FALLBACK TO QUEUED IF NO TRANSPORT)
  if (!tx) {
    // Record the intent to send even if no live provider is targetable.
    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: html,
        status: "queued_no_smtp",
        provider: "smtp",
        source: "app"
      }
    });
    logEvent("email.queued_no_smtp", { to: input.to, subject: input.subject });
    return { status: "queued_no_smtp" };
  }

  try {
    const info = await tx.sendMail({
      from,
      to: input.to,
      cc: input.cc,
      bcc,
      subject: input.subject,
      html,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType
      }))
    });

    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: html,
        status: "sent",
        provider: "smtp",
        externalId: info.messageId,
        source: "app"
      }
    }).catch((persistError) => {
      // The provider already accepted the message, so audit-log persistence must not
      // turn delivery into an apparent failure that encourages duplicate retries.
      logError("email.audit_persist_failed_after_smtp_send", persistError, {
        to: input.to,
        subject: input.subject,
        messageId: info.messageId
      });
    });
    logEvent("email.sent_smtp", { to: input.to, subject: input.subject });
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    /**
     * FAILOVER LOGIC:
     * If SMTP fails (e.g. IP blocked, creds expired) but Gmail is configured,
     * try one last time via the API before reporting failure.
     */
    if (gmailConfigured) {
      logError("email.smtp_failed_attempting_gmail", error, { to: input.to, subject: input.subject });
      const gmailResult = await sendGmailEmail({ ...providerInput, html, bcc });
      if (gmailResult.status === "sent") {
        logEvent("email.smtp_failed_gmail_fallback_sent", { to: input.to, subject: input.subject });
        return gmailResult;
      }
      return { status: "failed", error: `SMTP failed: ${message}; Gmail fallback failed: ${gmailResult.error ?? "Unknown error"}` };
    }

    // Capture the failure for visibility in the Admin audit dashboard.
    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: html,
        status: "failed",
        provider: "smtp",
        source: "app",
        error: message
      }
    });
    logError("email.failed", error, { to: input.to, subject: input.subject });
    return { status: "failed", error: message };
  }
}
