/**
 * Unified Email Service
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
import { getOwnerEmail } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";
import { renderTemplate } from "@/lib/email/render";
import { PlaceholderContext } from "@/lib/email/placeholders";

/** Input for standard email sending. */
type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

/** Standardized response for all email delivery attempts. */
export type SendEmailResult = {
  status: "sent" | "queued_no_smtp" | "failed";
  error?: string;
};

/** Reused transporter instance. */
let transporter: nodemailer.Transporter | null = null;

/** Normalizes email addresses by removing name labels and lowercasing. */
function normalizeAddressValue(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  return (bracketMatch?.[1] || trimmed).trim();
}

/** Merges a single BCC recipient into an existing array of BCCs. */
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
 * Initializes the SMTP transporter using environment variables.
 * Returns null if credentials are missing.
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
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

/**
 * High-level helper for sending templated emails.
 * Merges DB-stored templates with runtime placeholders (e.g. {{student_name}}).
 */
export async function sendTemplateEmail(input: SendTemplateEmailInput): Promise<SendEmailResult> {
  const rendered = await renderTemplate(input.templateKey, input.context, input.fallbackRenderer);
  
  return sendEmail({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    bcc: input.bcc,
    attachments: input.attachments
  });
}

/**
 * Core delivery logic with Audit logging and multi-provider failover.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.SMTP_FROM || "LessonFlow <no-reply@example.com>";
  const provider = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
  const tx = getTransporter();
  const ownerBcc = getCustomerAuditBccRecipient(input.to);
  const bcc = ownerBcc ? mergeBccValues(input.bcc, ownerBcc) : input.bcc;

  // STEP 1: GMAIL PROVIDER PATH
  if (provider === "gmail" || (!tx && isGmailConfigured())) {
    if (!isGmailConfigured()) {
      return { status: "failed", error: "EMAIL_PROVIDER is set to gmail but GMAIL credentials are missing." };
    }

    const gmailResult = await sendGmailEmail({ ...input, bcc });
    if (gmailResult.status === "sent") {
      logEvent("email.sent_via_gmail", { to: input.to, subject: input.subject });
    }
    return gmailResult;
  }

  // STEP 2: SMTP PROVIDER PATH (FALLBACK TO QUEUED IF NO TRANSPORT)
  if (!tx) {
    // Record the intent to send even if no live provider is targetable.
    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: input.html,
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
      bcc,
      subject: input.subject,
      html: input.html,
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
        htmlBody: input.html,
        status: "sent",
        provider: "smtp",
        externalId: info.messageId,
        source: "app"
      }
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
    if (isGmailConfigured()) {
      logError("email.smtp_failed_attempting_gmail", error, { to: input.to, subject: input.subject });
      const gmailResult = await sendGmailEmail(input);
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
        htmlBody: input.html,
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
